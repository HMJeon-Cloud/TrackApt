/* scripts/macro_build.js — 금리 · 임금 · 부동산 대책 · 교통 · 정책대출 자료를 매일 새벽에 모은다 (v7.4)
   GitHub Actions 가 brief_build.js 다음에 돌려 macro_data.json 을 커밋한다. 앱은 이 파일만 읽는다.

   ① 금리  — 한국은행 ECOS Open API (환경변수 ECOS_KEY). 기준금리(일) · 예금은행 주택담보대출 가중평균금리(월, 신규취급액) · 국고채 3년(일)
   ② 임금  — ECOS 에서 '임금' 통계를 먼저 찾고, 없으면 통계청 KOSIS Open API (환경변수 KOSIS_KEY) 사업체노동력조사 상용근로자 월 임금총액.
             둘 다 실패하면 data/manual/wages.json 의 값을 쓴다(수동).
   ③ 대책 · ④ 교통 · ⑤ 정책대출 — 새 소식은 구글 뉴스 RSS 로 자동 수집, 확정 내용은 data/manual/{policy,transit,loans}.json 을 직접 고친다.

   통계 코드는 기본값을 먼저 쓰고, 이름이 안 맞거나 자료가 없으면 ECOS 통계표/항목 목록에서 이름으로 찾아 data/macro_codes.json 에 기억한다.
   무엇을 받았고 어디서 막혔는지는 data/macro_debug.json 에 남긴다(처음 돌릴 때 확인용).
   node 18+ */
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var ECOS = process.env.ECOS_KEY || "", KOSIS = process.env.KOSIS_KEY || "";
var CODES_P = path.join(ROOT, "data", "macro_codes.json"), DEBUG_P = path.join(ROOT, "data", "macro_debug.json"), OUT_P = path.join(ROOT, "macro_data.json");
var DBG = { builtAt: new Date().toISOString(), steps: [] }, CALLS = 0;
function log(s) { console.log(s); DBG.steps.push(String(s)); }
function readJson(p, dflt) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return dflt; } }
function kst() { var d = new Date(Date.now() + 9 * 3600000); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
function ymOf(n) { return Math.floor(n / 100); }
function ymShift(ym, k) { var y = Math.floor(ym / 100), m = ym % 100 - 1 + k; return (y + Math.floor(m / 12)) * 100 + ((m % 12) + 12) % 12 + 1; }
function num(v) { var n = Number(String(v == null ? "" : v).replace(/,/g, "")); return isFinite(n) ? n : null; }
var CODES = readJson(CODES_P, {});
Object.keys(CODES).forEach(function (k) { if (CODES[k] && (CODES[k].cycle === "A" || CODES[k].cycle === "Q")) delete CODES[k]; });   /* v7.41: 연간으로 잘못 잡힌 캐시 버림 */
if (CODES.base && CODES.base.cycle !== "M") delete CODES.base;                                                                    /* v7.61: 기준금리는 월별로 */
/* 시험용 — 가짜 서버로 돌릴 때만 바꾼다 */
var ECOS_BASE = process.env.ECOS_BASE || "https://ecos.bok.or.kr/api/", KOSIS_BASE = process.env.KOSIS_BASE || "https://kosis.kr/openapi/", GNEWS_BASE = process.env.GNEWS_BASE || "https://news.google.com/rss/search";

var execFileSync = require("child_process").execFileSync;
async function getText(url) {
  CALLS++;
  var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 25000);
  try {
    var r = await fetch(url, { signal: ac.signal, headers: { "user-agent": "Mozilla/5.0 (TrackApt-macro-build)" } });
    return await r.text();
  } catch (e) {
    /* node fetch 가 막히는 서버(오래된 TLS 등)는 curl 로 한 번 더 */
    var why = (e && e.cause && (e.cause.code || e.cause.message)) || e.message;
    try {
      var out = execFileSync("curl", ["-sS", "-L", "--max-time", "25", "-A", "Mozilla/5.0 (TrackApt-macro-build)", url], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
      log("fetch 실패(" + why + ") → curl 로 받음: " + url.replace(/apiKey=[^&]+/, "apiKey=***").slice(0, 90));
      return out;
    } catch (e2) { throw new Error("fetch 실패(" + why + "), curl 도 실패(" + String(e2.message).slice(0, 80) + ")"); }
  } finally { clearTimeout(t); }
}
async function getJson(url) { var t = await getText(url); try { return JSON.parse(t); } catch (e) { return { _raw: t.slice(0, 300) }; } }

/* ── ECOS ─────────────────────────────────────────────────────────────── */
function ecosUrl(svc, rest) { return ECOS_BASE + svc + "/" + encodeURIComponent(ECOS) + "/json/kr/" + rest; }
function ecosRows(j, svc) {
  if (j && j[svc] && j[svc].row) return j[svc].row;
  var r = j && (j.RESULT || (j[svc] && j[svc].RESULT));
  throw new Error("ECOS " + svc + ": " + (r ? r.CODE + " " + r.MESSAGE : JSON.stringify(j).slice(0, 160)));
}
async function ecosSearch(stat, cycle, from, to, item) {
  var j = await getJson(ecosUrl("StatisticSearch", "1/1000/" + stat + "/" + cycle + "/" + from + "/" + to + "/" + (item || "")));
  return ecosRows(j, "StatisticSearch").map(function (r) { return { t: r.TIME, v: num(r.DATA_VALUE), nm: r.ITEM_NAME1, unit: r.UNIT_NAME, stat: r.STAT_NAME }; })
    .filter(function (r) { return r.v != null; });
}
var TABLE_CACHE = null;
async function ecosTables() {
  if (TABLE_CACHE) return TABLE_CACHE;
  var out = [];
  for (var p = 1; p <= 6; p++) {
    var j = await getJson(ecosUrl("StatisticTableList", ((p - 1) * 1000 + 1) + "/" + (p * 1000) + "/"));
    var rows; try { rows = ecosRows(j, "StatisticTableList"); } catch (e) { break; }
    out = out.concat(rows); if (rows.length < 1000) break;
  }
  TABLE_CACHE = out.filter(function (r) { return r.SRCH_YN === "Y"; });
  log("ECOS 통계표 " + TABLE_CACHE.length + "개 읽음");
  return TABLE_CACHE;
}
async function ecosItems(stat) {
  var j = await getJson(ecosUrl("StatisticItemList", "1/1000/" + stat));
  return ecosRows(j, "StatisticItemList");
}
/* 이름으로 (통계표, 항목) 찾기 — must: 모두 들어가야 하는 말, any: 하나 이상, not: 들어가면 안 되는 말 */
function hit(name, must, any, not) {
  name = String(name || "");
  return must.every(function (w) { return name.indexOf(w) >= 0; }) && (!any || any.some(function (w) { return name.indexOf(w) >= 0; })) &&
    !(not || []).some(function (w) { return name.indexOf(w) >= 0; });
}
async function ecosResolve(key, def, want) {
  /* def: {stat, item, cycle} 기본 코드 · want: {table:[must,any,not], item:[must,any,not], cycle} 이름 조건 */
  var c = CODES[key]; if (c && c.stat && c.item) return c;
  var tries = def ? [def] : [], items;
  for (var i = 0; i < tries.length; i++) {
    try {
      items = await ecosItems(tries[i].stat);
      var it = items.filter(function (r) { return r.ITEM_CODE === tries[i].item; })[0];
      if (it) { CODES[key] = { stat: tries[i].stat, item: it.ITEM_CODE, cycle: tries[i].cycle || it.CYCLE, nm: it.STAT_NAME + " · " + it.ITEM_NAME, how: "기본 코드" }; return CODES[key]; }
      var byName = items.filter(function (r) { return hit(r.ITEM_NAME, want.item[0], want.item[1], want.item[2]) && (!want.cycle || r.CYCLE === want.cycle); })[0];
      if (byName) { CODES[key] = { stat: tries[i].stat, item: byName.ITEM_CODE, cycle: want.cycle || byName.CYCLE, nm: byName.STAT_NAME + " · " + byName.ITEM_NAME, how: "기본 표 안에서 이름으로" }; return CODES[key]; }
    } catch (e) { log(key + " 기본 코드 확인 실패: " + e.message); }
  }
  var tabs = (await ecosTables()).filter(function (r) { return hit(r.STAT_NAME, want.table[0], want.table[1], want.table[2]) && (!want.cycle || r.CYCLE === want.cycle); });
  log(key + " 이름으로 찾은 통계표 " + tabs.length + "개: " + tabs.slice(0, 5).map(function (r) { return r.STAT_CODE + " " + r.STAT_NAME; }).join(" / "));
  for (var k = 0; k < Math.min(tabs.length, 6); k++) {
    try {
      items = await ecosItems(tabs[k].STAT_CODE);
      var cand = items.filter(function (r) { return hit(r.ITEM_NAME, want.item[0], want.item[1], want.item[2]) && (!want.cycle || r.CYCLE === want.cycle) && Number(r.DATA_CNT || 1) > 0; });
      if (cand.length) { CODES[key] = { stat: tabs[k].STAT_CODE, item: cand[0].ITEM_CODE, cycle: want.cycle || cand[0].CYCLE, nm: tabs[k].STAT_NAME + " · " + cand[0].ITEM_NAME, how: "통계표 목록에서 이름으로" }; return CODES[key]; }
    } catch (e) { log(key + " 항목 확인 실패(" + tabs[k].STAT_CODE + "): " + e.message); }
  }
  return null;
}
function tMonth(t) { t = String(t); return Number(t.slice(0, 4) + t.slice(4, 6)); }
function tDay(t) { t = String(t); return t.length >= 8 ? Number(t.slice(0, 8)) : Number(t.slice(0, 6) + "01"); }
async function ecosSeries(key, def, want, months) {
  var c = await ecosResolve(key, def, want);
  if (!c) { log(key + ": ECOS 에서 찾지 못함"); return null; }
  var today = kst(), ym = ymOf(today), from, to;
  if (c.cycle === "D") { from = String(ymShift(ym, -months)) + "01"; to = String(today); }
  else if (c.cycle === "M") { from = String(ymShift(ym, -months)); to = String(ym); }
  else if (c.cycle === "Q") { from = Math.floor(ymShift(ym, -months) / 100) + "Q1"; to = Math.floor(ym / 100) + "Q4"; }
  else { from = String(Math.floor(ymShift(ym, -months) / 100)); to = String(Math.floor(ym / 100)); }
  var rows = await ecosSearch(c.stat, c.cycle, from, to, c.item);
  if (!rows.length && c.cycle !== "M") {            /* 일별이 없으면 월별로 */
    c.cycle = "M"; from = String(ymShift(ym, -months)); to = String(ym);
    rows = await ecosSearch(c.stat, c.cycle, from, to, c.item);
  }
  if (!rows.length) { log(key + ": 자료 0건 (" + c.stat + "/" + c.item + ")"); delete CODES[key]; return null; }
  /* 끝이 두 달 넘게 오래됐으면(통계가 끊긴 표) 월별·연간으로 다시 */
  var lastM = tMonth(rows[rows.length - 1].t);
  if (c.cycle !== "A" && lastM < ymShift(ym, -2)) {
    log(key + ": " + c.cycle + " 자료가 " + lastM + "에서 끊김 → 다른 주기로 재시도");
    var alt = c.cycle === "D" ? ["M", "A"] : ["A"];
    for (var ai = 0; ai < alt.length; ai++) {
      var f2 = alt[ai] === "M" ? String(ymShift(ym, -months)) : String(Math.floor(ymShift(ym, -months) / 100)), t2 = alt[ai] === "M" ? String(ym) : String(Math.floor(ym / 100));
      var r2 = await ecosSearch(c.stat, alt[ai], f2, t2, c.item);
      if (r2.length && tMonth(r2[r2.length - 1].t) > lastM) { rows = r2; c.cycle = alt[ai]; break; }
    }
  }
  /* 일별은 달마다 마지막 값 하나로 줄인다(기준금리는 바뀐 날짜도 따로 남긴다) */
  var byM = {}, changes = [], last = null;
  rows.forEach(function (r) {
    var m = tMonth(r.t); byM[m] = r.v;
    if (c.cycle === "D" && (last == null || Math.abs(r.v - last) > 1e-9)) { changes.push([tDay(r.t), r.v]); }
    last = r.v;
  });
  var hist = Object.keys(byM).map(Number).sort().map(function (m) { return [m, byM[m]]; });
  var cur = rows[rows.length - 1];
  return { v: cur.v, t: c.cycle === "D" ? tDay(cur.t) : tMonth(cur.t), unit: cur.unit, name: c.nm, how: c.how, hist: hist, changes: changes.slice(-8) };
}

/* ── KOSIS (임금 대안) ───────────────────────────────────────────────── */
function kosisUrl(svc, q) {
  var s = KOSIS_BASE + svc + "?method=" + q.method + "&apiKey=" + encodeURIComponent(KOSIS) + "&format=json&jsonVD=Y";
  Object.keys(q).forEach(function (k) { if (k !== "method") s += "&" + k + "=" + encodeURIComponent(q[k]); });
  return s;
}
function kosisArr(j) { return Array.isArray(j) ? j : (j && Array.isArray(j.list) ? j.list : null); }
function kosisErr(j) {
  if (j && j._raw) { var m = String(j._raw).match(/<title>([\s\S]*?)<\/title>/i); return "HTML 응답" + (m ? " (" + m[1].trim().slice(0, 60) + ")" : ""); }
  return j && (j.errMsg || j.err) ? (j.errMsg || j.err) : JSON.stringify(j).slice(0, 160);
}
async function kosisWages() {
  if (!KOSIS) return null;
  var c = CODES.kosisWage;
  if (!c) {
    var found = await getJson(kosisUrl("statisticsSearch.do", { method: "getList", searchNm: "산업/규모별 임금 및 근로시간" }));
    var list = kosisArr(found) || [];
    DBG.kosisSearch = list.slice(0, 10);
    var pick = list.filter(function (r) { return r.TBL_ID === "DT_118N_MON051"; })[0] ||
      list.filter(function (r) { return /임금/.test(r.TBL_NM || "") && !/누계|계절/.test(r.TBL_NM || "") && String(r.ORG_ID) === "118"; })[0] || list[0];
    if (!pick) { log("KOSIS 검색 결과 없음: " + kosisErr(found)); return null; }
    c = { orgId: pick.ORG_ID, tblId: pick.TBL_ID, nm: pick.TBL_NM };
    log("KOSIS 표 선택: " + c.orgId + "/" + c.tblId + " " + c.nm);
  }
  /* 1차: 최근 1개월만 전체(ALL)로 받아 분류 단계·코드를 알아낸다 (40,000셀 제한 때문에 전체 기간은 못 받음) */
  function q(n, over) {
    var o = { method: "getList", orgId: c.orgId, tblId: c.tblId, itmId: "ALL", prdSe: "M", newEstPrdCnt: "1" };
    for (var k = 1; k <= n; k++) o["objL" + k] = "ALL";
    Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
    return o;
  }
  var probe = null, nLev = 0, j = null;
  for (var n = 1; n <= 4 && !probe; n++) {
    j = await getJson(kosisUrl("Param/statisticsParameterData.do", q(n)));
    var arr = kosisArr(j);
    if (arr && arr.length) { probe = arr; nLev = n; }
    else log("KOSIS 탐색 " + n + "단계: " + kosisErr(j));
  }
  if (!probe) { DBG.kosisRaw = j; return null; }
  DBG.kosisProbe = probe.slice(0, 6);
  /* 전산업 · 전규모(또는 전체) · 상용근로자 · 임금총액 행을 고른다 */
  function pickRow(rows) {
    var cand = rows.filter(function (r) { return /임금총액|월평균임금|월급여/.test(r.ITM_NM || "") && !/실질/.test(r.ITM_NM || ""); });
    var names = function (r) { return [r.C1_NM, r.C2_NM, r.C3_NM, r.C4_NM].filter(Boolean).join(" "); };
    var best = cand.filter(function (r) { return /상용/.test(names(r)) && /전산업|전체|계\b/.test(r.C1_NM || "") && !/임시|일용/.test(names(r)); });
    if (!best.length) best = cand.filter(function (r) { return /전산업|전체/.test(r.C1_NM || "") && !/임시|일용/.test(names(r)); });
    if (!best.length) best = cand;
    /* 규모는 '전규모·전체·1인 이상' 우선 */
    best.sort(function (a, b) { return (/전규모|전체|1인 이상|계$/.test(names(b)) ? 1 : 0) - (/전규모|전체|1인 이상|계$/.test(names(a)) ? 1 : 0); });
    return best[0] || null;
  }
  var pr = pickRow(probe);
  if (!pr) { log("KOSIS 임금 행을 고르지 못함 — 항목 이름: " + probe.slice(0, 5).map(function (r) { return r.ITM_NM + "/" + r.C1_NM + "/" + (r.C2_NM || ""); }).join(", ")); return null; }
  /* 2차: 그 조합만 36개월 */
  var over = { itmId: pr.ITM_ID || "ALL", newEstPrdCnt: "36" };
  for (var k2 = 1; k2 <= nLev; k2++) { var code = pr["C" + k2]; if (code) over["objL" + k2] = code; }
  j = await getJson(kosisUrl("Param/statisticsParameterData.do", q(nLev, over)));
  var rows = kosisArr(j);
  if (!rows || !rows.length) { log("KOSIS 2차 실패: " + kosisErr(j)); DBG.kosisRaw = j; return null; }
  log("KOSIS 자료 " + rows.length + "행 — " + [pr.ITM_NM, pr.C1_NM, pr.C2_NM, pr.C3_NM].filter(Boolean).join(" · "));
  DBG.kosisSample = rows.slice(0, 5);
  var cand = rows.filter(function (r) { return /임금총액|월평균임금|월급여/.test(r.ITM_NM || "") && !/실질|임시|일용/.test([r.ITM_NM, r.C1_NM, r.C2_NM, r.C3_NM].join(" ")); });
  var pref = cand.filter(function (r) { return /전산업|전체|계$/.test(r.C1_NM || "") && /전규모|전체|계$|1인 이상|5인 이상/.test((r.C2_NM || "전체")); });
  if (pref.length) cand = pref;
  if (!cand.length) cand = rows.filter(function (r) { return /임금/.test(r.ITM_NM || ""); });
  if (!cand.length) { log("KOSIS 임금 행을 고르지 못함 (항목 이름 확인 필요)"); return null; }
  var g = {};
  cand.forEach(function (r) { var k = [r.ITM_NM, r.C1_NM, r.C2_NM, r.C3_NM].join("|"); (g[k] = g[k] || []).push(r); });
  var keys = Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length || (/상용/.test(b) ? 1 : 0) - (/상용/.test(a) ? 1 : 0); });
  var best = keys.filter(function (k) { return /상용/.test(k); })[0] || keys[0], arr = g[best];
  var hist = arr.map(function (r) { return [Number(r.PRD_DE), num(r.DT)]; }).filter(function (x) { return x[1] != null && x[0] > 190000; }).sort(function (a, b) { return a[0] - b[0]; });
  if (!hist.length) return null;
  CODES.kosisWage = c;
  var unit = arr[0].UNIT_NM || "원", scale = /천원/.test(unit) ? 1000 : /만원/.test(unit) ? 10000 : 1;
  hist = hist.map(function (x) { return [x[0], x[1] * scale]; });
  return { v: hist[hist.length - 1][1], t: hist[hist.length - 1][0], unit: "원", name: "KOSIS " + c.nm + " · " + best.replace(/\|/g, " ").replace(/\s+/g, " "), how: "KOSIS", hist: hist };
}

/* ── RSS ─────────────────────────────────────────────────────────────── */
function unesc(s) {
  return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]+>/g, "").trim();
}
function gnews(q) { return GNEWS_BASE + "?q=" + encodeURIComponent(q) + "&hl=ko&gl=KR&ceid=KR:ko"; }
async function rss(feeds, days, max, mustRe) {
  var all = [], seen = {};
  for (var i = 0; i < feeds.length; i++) {
    try {
      var xml = await getText(feeds[i]), re = /<item>([\s\S]*?)<\/item>/g, m;
      while ((m = re.exec(xml))) {
        var it = m[1], title = unesc((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]).replace(/\s*-\s*[^-]+$/, "");
        if (!title || seen[title.replace(/\s/g, "")]) continue;
        if (mustRe && !mustRe.test(title)) continue;
        seen[title.replace(/\s/g, "")] = 1;
        all.push({ t: title, u: unesc((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]), d: unesc((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]),
          s: unesc((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]) });
      }
    } catch (e) { log("RSS 실패: " + e.message); }
  }
  var lim = Date.now() - days * 86400000;
  return all.filter(function (x) { var d = new Date(x.d); return !isFinite(d) || d >= lim; })
    .sort(function (a, b) { return new Date(b.d) - new Date(a.d); }).slice(0, max);
}

/* ── 본체 ─────────────────────────────────────────────────────────────── */
(async function main() {
  var out = { v: 1, builtAt: new Date().toISOString(), asOf: kst(), rates: {}, wages: null, policy: {}, transit: {}, loans: {}, errors: [] };
  /* ① 금리 */
  if (!ECOS) { out.errors.push("ECOS_KEY 없음 — 금리를 받지 못했습니다"); log("ECOS_KEY 없음"); }
  else {
    var specs = [
      ["base", { stat: "722Y001", item: "0101000", cycle: "M" }, { table: [["기준금리"]], item: [["기준금리"]], cycle: "M" }, 60],
      ["kb3y", { stat: "817Y002", item: "010200000", cycle: "D" }, { table: [["시장금리"], ["일별"]], item: [["국고채"], ["3년"]], cycle: "D" }, 36],
      ["mortgage", { stat: "121Y006", item: "BECBLA0302", cycle: "M" }, { table: [["대출금리"], ["신규취급액"], ["잔액"]], item: [["주택담보대출"]], cycle: "M" }, 36],
      ["loanAvg", { stat: "121Y006", item: "BECBLA01", cycle: "M" }, { table: [["대출금리"], ["신규취급액"], ["잔액"]], item: [["대출평균"]], cycle: "M" }, 36]
    ];
    for (var i = 0; i < specs.length; i++) {
      try { out.rates[specs[i][0]] = await ecosSeries(specs[i][0], specs[i][1], specs[i][2], specs[i][3]); if (out.rates[specs[i][0]]) log(specs[i][0] + " ✓ " + out.rates[specs[i][0]].name + " = " + out.rates[specs[i][0]].v); }
      catch (e) { out.errors.push(specs[i][0] + ": " + e.message); log(specs[i][0] + " 실패: " + e.message); }
    }
  }
  /* 기준금리 현재값 — ECOS '100대 통계지표'에서 한 번 더 확인해, 월별 통계가 뒤처져 있으면 이번 달 값으로 덧붙인다 */
  if (ECOS) try {
    var ks = ecosRows(await getJson(ecosUrl("KeyStatisticList", "1/100/")), "KeyStatisticList");
    var kb = ks.filter(function (r) { return /기준금리/.test(r.KEYSTAT_NAME || ""); })[0];
    DBG.keyStat = ks.slice(0, 5).map(function (r) { return r.KEYSTAT_NAME + "=" + r.DATA_VALUE + " " + r.CYCLE; });
    if (kb && num(kb.DATA_VALUE) != null) {
      var kv = num(kb.DATA_VALUE), kt = String(kb.CYCLE || ""), kym = kt.length >= 6 ? Number(kt.slice(0, 6)) : ymOf(kst());
      out.keyBase = { v: kv, t: kt };
      if (!out.rates.base) out.rates.base = { v: kv, t: kym, unit: "연%", name: "100대 통계지표 · 한국은행 기준금리", how: "KeyStatisticList", hist: [[kym, kv]], changes: [] };
      else {
        var B0 = out.rates.base, lastH = B0.hist[B0.hist.length - 1];
        if (lastH[0] < kym) { for (var mm = ymShift(lastH[0], 1); mm < kym; mm = ymShift(mm, 1)) B0.hist.push([mm, lastH[1]]); B0.hist.push([kym, kv]); B0.v = kv; B0.t = kym; B0.name += " (+100대 지표 현재값)"; }
        else if (Math.abs(B0.v - kv) > 1e-9) { B0.v = kv; B0.hist[B0.hist.length - 1][1] = kv; }
      }
      log("기준금리 현재값(100대 지표) " + kv + "% · " + kt);
    }
  } catch (e) { log("100대 지표 확인 생략: " + e.message); }
  /* 기준금리 — 월별이 기본(일별 통계는 중간에 끊겨 있음). 변경일은 월별 값이 바뀐 달로 잡고, 일별 자료가 그 달까지 있으면 정확한 날짜로 바꾼다 */
  if (out.rates.base) {
    var B = out.rates.base, ch = [], prev = null;
    B.hist.forEach(function (p) { if (prev == null || Math.abs(p[1] - prev) > 1e-9) ch.push([p[0] * 100 + 1, p[1]]); prev = p[1]; });
    B.changes = ch.slice(-8); B.t = B.hist[B.hist.length - 1][0]; B.v = B.hist[B.hist.length - 1][1];
    try {
      var dRows = await ecosSearch("722Y001", "D", String(ymShift(ymOf(kst()), -60)) + "01", String(kst()), "0101000");
      if (dRows.length) {
        var dch = [], last = null;
        dRows.forEach(function (r) { if (last == null || Math.abs(r.v - last) > 1e-9) dch.push([tDay(r.t), r.v]); last = r.v; });
        var dLast = tMonth(dRows[dRows.length - 1].t);
        B.changes = B.changes.map(function (c) { var m = Math.floor(c[0] / 100); if (m > dLast) return c; var hit2 = dch.filter(function (d) { return Math.floor(d[0] / 100) === m; })[0]; return hit2 || c; });
        log("기준금리 변경일: 일별 자료 " + dLast + "까지로 보정");
      }
    } catch (e) { log("기준금리 일별 보정 생략: " + e.message); }
  }
  /* ② 임금 — ECOS → KOSIS → 수동 */
  try {
    if (ECOS) out.wages = await ecosSeries("wage", null, { table: [["임금"], ["사업체노동력", "상용", "임금총액", "월평균"], ["물가", "실질"]], item: [["임금"], ["전산업", "전체", "총액", "계"], ["실질", "임시", "일용"]] }, 36);
  } catch (e) { log("ECOS 임금 실패: " + e.message); }
  if (!out.wages) { try { out.wages = await kosisWages(); } catch (e) { out.errors.push("KOSIS: " + e.message); log("KOSIS 실패: " + e.message); } }
  var manualW = readJson(path.join(ROOT, "data", "manual", "wages.json"), null);
  if (!out.wages && manualW && manualW.monthly) { out.wages = { v: manualW.monthly, t: manualW.asOf, unit: "원", name: manualW.source || "직접 입력", how: "수동 파일", hist: [] }; log("임금: 수동 파일 사용"); }
  if (out.wages) {
    var h = out.wages.hist || [], cur = out.wages.v, yago = null;
    for (var k = h.length - 1; k >= 0; k--) if (h[k][0] <= ymShift(out.wages.t > 999999 ? ymOf(out.wages.t) : out.wages.t, -12)) { yago = h[k][1]; break; }
    out.wages.yoy = yago ? Math.round((cur / yago - 1) * 1000) / 10 : null;
    /* 월 변동이 큰 통계라 최근 12개월 평균도 함께 */
    var last12 = h.slice(-12).map(function (x) { return x[1]; });
    out.wages.avg12 = last12.length >= 6 ? Math.round(last12.reduce(function (a, b) { return a + b; }, 0) / last12.length) : cur;
    log("임금 ✓ " + out.wages.name + " = " + cur + " (" + out.wages.how + ")");
  } else out.errors.push("임금 자료를 받지 못했습니다 (ECOS·KOSIS·수동 모두 없음)");
  /* ③④⑤ 수동 파일 + RSS */
  out.policy = { manual: readJson(path.join(ROOT, "data", "manual", "policy.json"), { items: [] }),
    news: await rss([gnews("부동산 대책 OR 주택 공급 대책 OR 규제지역 OR 토지거래허가"), gnews("국토교통부 주택 정책 발표")], 14, 12, /대책|규제|허가|공급|정책|정비|재건축|세제|세금/) };
  out.transit = { manual: readJson(path.join(ROOT, "data", "manual", "transit.json"), { lines: [] }),
    news: await rss([gnews("GTX 개통 OR GTX 착공 OR GTX 노선"), gnews("지하철 연장 개통 OR 신설 노선 착공 OR 광역철도")], 14, 12, /GTX|지하철|철도|노선|개통|착공|연장|경전철|신분당|월곶|신안산/) };
  out.loans = { manual: readJson(path.join(ROOT, "data", "manual", "loans.json"), { programs: [] }),
    news: await rss([gnews("디딤돌대출 OR 보금자리론 OR 신생아특례대출"), gnews("주택담보대출 한도 OR DSR 규제 OR 전세대출 규제")], 14, 12, /대출|DSR|LTV|한도|금리|보금자리|디딤돌|특례/) };
  log("대책 기사 " + out.policy.news.length + " · 교통 " + out.transit.news.length + " · 대출 " + out.loans.news.length);

  out.calls = CALLS;
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(OUT_P, JSON.stringify(out));
  fs.writeFileSync(CODES_P, JSON.stringify(CODES, null, 1));
  DBG.codes = CODES; DBG.errors = out.errors;
  fs.writeFileSync(DEBUG_P, JSON.stringify(DBG, null, 1));
  log("완료 — 호출 " + CALLS + "회 · 오류 " + out.errors.length + "건 · " + Math.round(fs.statSync(OUT_P).size / 1024) + "KB");
})().catch(function (e) { console.error(e); process.exit(1); });
