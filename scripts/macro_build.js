/* scripts/macro_build.js — 금리 · 임금 · 부동산 대책 · 교통 · 정책대출 자료를 매일 새벽에 모은다 (v7.4)
   GitHub Actions 가 brief_build.js 다음에 돌려 macro_data.json 을 커밋한다. 앱은 이 파일만 읽는다.

   ① 금리  — 한국은행 ECOS Open API (환경변수 ECOS_KEY). 기준금리(일) · 예금은행 주택담보대출 가중평균금리(월, 신규취급액) · 국고채 3년(일)
   ② 임금  — ECOS 에서 '임금' 통계를 먼저 찾고, 없으면 통계청 KOSIS Open API (환경변수 KOSIS_KEY) 사업체노동력조사 상용근로자 월 임금총액.
             둘 다 실패하면 data/manual/wages.json 의 값을 쓴다(수동).
   ③ 대책 · ④ 교통 · ⑤ 정책대출 — 새 소식은 구글 뉴스 RSS + 정책브리핑(korea.kr) 국토부·금융위 보도자료 RSS 로 자동 수집, 확정 내용은 data/manual/{policy,transit,loans}.json 을 직접 고친다.
   ⑥ 수동 목록 자동 점검(v7.8) — 보도자료·기사에서 '새 대책 발표' '노선 개통·착공' '정책대출 금리 변경' 을 찾아 data/manual/_inbox.json 에 "확인 필요" 로 쌓고,
             정책대출 금리는 기금e든든 안내 페이지(loans.json 의 src)에서 연 x~y% 범위를 직접 읽어 수동값과 다르면 알린다. 수동 파일을 고치면 해당 항목은 다음 날 사라진다.
             새 항목이 생기면 Actions 가 GitHub 이슈를 하나 만든다(알림용).

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
var KOREAKR_BASE = process.env.KOREAKR_BASE || "https://www.korea.kr/rss/";             /* 정책브리핑 부처별 보도자료 RSS: dept_molit.xml(국토부) · dept_fsc.xml(금융위) */
var FETCH_REWRITE = (process.env.FETCH_REWRITE || "").split(",").filter(Boolean).map(function (x) { return x.split("=>"); });   /* 시험용 "https://nhuf.molit.go.kr=>http://127.0.0.1:18081/nhuf" */
var INBOX_P = path.join(ROOT, "data", "manual", "_inbox.json"), INBOX_NOTE = process.env.INBOX_NOTE || path.join(require("os").tmpdir(), "trackapt_inbox_new.md");

var execFileSync = require("child_process").execFileSync;
async function getText(url) {
  CALLS++;
  FETCH_REWRITE.forEach(function (rw) { if (rw[1] && url.indexOf(rw[0]) === 0) url = rw[1] + url.slice(rw[0].length); });
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
function koreakr(dept) { return KOREAKR_BASE + "dept_" + dept + ".xml"; }
var OFFICIAL = { molit: "국토교통부", fsc: "금융위원회" };
async function rss(feeds, days, max, mustRe) {
  var all = [], seen = {};
  for (var i = 0; i < feeds.length; i++) {
    try {
      var official = feeds[i].indexOf(KOREAKR_BASE) === 0, dept = official ? (feeds[i].match(/dept_(\w+)\.xml/) || [])[1] : null;
      var xml = await getText(feeds[i]), re = /<item>([\s\S]*?)<\/item>/g, m, cnt = 0;
      while ((m = re.exec(xml))) {
        var it = m[1], title = unesc((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
        if (!official) title = title.replace(/\s+-\s+[^-]+$/, "");      /* 구글 뉴스는 제목 끝에 " - 언론사" 가 붙는다 (GTX-A 같은 붙임표는 건드리지 않음) */
        if (!title || seen[title.replace(/\s/g, "")]) continue;
        if (mustRe && !mustRe.test(title)) continue;
        seen[title.replace(/\s/g, "")] = 1; cnt++;
        all.push({ t: title, u: unesc((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]), d: unesc((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]),
          s: official ? (OFFICIAL[dept] || "정책브리핑") : unesc((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]), o: official ? 1 : 0 });
      }
      if (official) log("보도자료 RSS " + (OFFICIAL[dept] || dept) + " " + cnt + "건");
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
  /* 보도자료(국토부·금융위)는 한 번만 받아 세 갈래로 나눠 쓴다 — 60일치 */
  var press = await rss([koreakr("molit"), koreakr("fsc")], 60, 200, null);
  function pressPick(re, days, max) { var lim = Date.now() - days * 86400000; return press.filter(function (x) { return re.test(x.t) && (!isFinite(new Date(x.d)) || new Date(x.d) >= lim); }).slice(0, max); }
  function merge(a, b, max) { var seen = {}, o = []; a.concat(b).forEach(function (x) { var k = x.t.replace(/\s/g, ""); if (seen[k]) return; seen[k] = 1; o.push(x); }); return o.sort(function (x, y) { return new Date(y.d) - new Date(x.d); }).slice(0, max); }
  var P_RE = /대책|규제|허가|공급|정책|정비|재건축|세제|세금|가계부채|분양/, T_RE = /GTX|지하철|철도|노선|개통|착공|연장|경전철|신분당|월곶|신안산/, L_RE = /대출|DSR|LTV|한도|금리|보금자리|디딤돌|특례|버팀목/;
  out.policy = { manual: readJson(path.join(ROOT, "data", "manual", "policy.json"), { items: [] }),
    news: merge(pressPick(/주택|부동산|시장|가계부채|분양|규제지역|토지거래/, 14, 6), await rss([gnews("부동산 대책 OR 주택 공급 대책 OR 규제지역 OR 토지거래허가"), gnews("국토교통부 주택 정책 발표")], 14, 12, P_RE), 12) };
  out.transit = { manual: readJson(path.join(ROOT, "data", "manual", "transit.json"), { lines: [] }),
    news: merge(pressPick(T_RE, 14, 6), await rss([gnews("GTX 개통 OR GTX 착공 OR GTX 노선"), gnews("지하철 연장 개통 OR 신설 노선 착공 OR 광역철도")], 14, 12, T_RE), 12) };
  out.loans = { manual: readJson(path.join(ROOT, "data", "manual", "loans.json"), { programs: [] }),
    news: merge(pressPick(/디딤돌|보금자리|버팀목|신생아|주택담보|DSR|전세대출/, 14, 6), await rss([gnews("디딤돌대출 OR 보금자리론 OR 신생아특례대출"), gnews("주택담보대출 한도 OR DSR 규제 OR 전세대출 규제")], 14, 12, L_RE), 12) };
  log("대책 기사 " + out.policy.news.length + " · 교통 " + out.transit.news.length + " · 대출 " + out.loans.news.length);

  /* ⑥ 수동 목록 자동 점검 → data/manual/_inbox.json */
  var prevInbox = readJson(INBOX_P, { items: [] }), inbox = { v: 1, builtAt: out.builtAt, asOf: out.asOf, items: [] };
  function ymd(d) { var t = new Date(d); if (!isFinite(t)) return ""; t = new Date(t.getTime() + 9 * 3600000); return t.toISOString().slice(0, 10); }
  function normT(x) { return String(x || "").toLowerCase().replace(/[\s·ㆍ,.()\[\]「」『』'"‘’“”\-~]/g, ""); }
  function similar(a, b) {
    a = normT(a); b = normT(b); if (!a || !b) return false;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
    var ga = {}, n = 0, t = 0; for (var i = 0; i < a.length - 1; i++) ga[a.substr(i, 2)] = 1;
    for (var j = 0; j < b.length - 1; j++) { t++; if (ga[b.substr(j, 2)]) n++; }
    return t > 0 && n / t >= 0.6;
  }
  /* 6-1 새 대책: 보도자료 60일 + 기사 중 '대책·방안' 제목인데 policy.json 에 없는 것 */
  var pItems = out.policy.manual.items || [], pLast = pItems.map(function (x) { return x.date || ""; }).sort().pop() || "";
  var polCand = merge(pressPick(/(대책|방안|관리\s*강화|규제지역|토지거래허가|조정대상|투기과열|지정|해제)/, 60, 40), out.policy.news, 60)
    .filter(function (x) { return /(대책|방안|관리\s*강화|규제지역|토지거래허가|조정대상지역|투기과열지구|지정|해제)/.test(x.t) && /(주택|부동산|시장|가계부채|대출|규제|공급|분양|지역)/.test(x.t); })
    .filter(function (x) { return !/(해설|Q&A|설명자료|카드뉴스|브리핑 영상|팩트체크|오보|반박)/.test(x.t); });
  var artN = 0;
  polCand.forEach(function (x) {
    if (!x.o && /(임박|예고|검토|전망|촉구|가능성|될까|앞두|촉각|주목|논란|반발|우려)/.test(x.t)) return;
    if (!x.o && artN >= 3) return;                                                   /* 기사발 후보는 3건까지 (보도자료는 제한 없음) */
    var d = ymd(x.d); if (pLast && d && d <= pLast && !x.o) return;              /* 수동 목록 최신 발표일보다 오래된 기사는 넘김(보도자료는 예외) */
    if (pItems.some(function (it) { return similar(it.title, x.t) || (it.points || []).some(function (pt) { return similar(pt, x.t); }); })) return;
    if (!x.o && !/^\s*\S*\d+[·.]\d+/.test(x.t) && !/(발표|시행|내놓|확정|단행)/.test(x.t)) return;  /* 기사는 '발표·시행' 류만, 보도자료는 그대로 */
    if (!x.o) artN++;
    inbox.items.push({ kind: "policy", date: d, title: x.t, url: x.u, src: x.s, official: !!x.o, todo: "data/manual/policy.json 맨 위에 발표일·시행일·요점 2~4줄을 적어 주세요" });
  });
  /* 6-2 노선 소식: transit.json 의 각 노선 이름으로 개통·착공·연기 소식 */
  var tLines = out.transit.manual.lines || [], tNews = merge(pressPick(T_RE, 30, 30), out.transit.news, 60);
  tLines.forEach(function (l) {
    var keys = (l.keys && l.keys.length ? l.keys : [String(l.name).split(/[\s(]/)[0]]).filter(function (k) { return k && k.length >= 3; });
    tNews.forEach(function (x) {
      if (!keys.some(function (k) { return x.t.indexOf(k) >= 0; })) return;
      var kind = null;
      if (l.status !== "개통" && /개통/.test(x.t) && !/(예정|앞두|연기|지연|언제|목표|추진)/.test(x.t)) kind = "개통 소식";
      else if ((l.status === "계획" || l.status === "착공예정") && /착공/.test(x.t) && !/(예정|앞두|연기|지연|목표)/.test(x.t)) kind = "착공 소식";
      else if (/(연기|지연|늦어|차질|재검토)/.test(x.t)) kind = "일정 변경";
      if (!kind) return;
      inbox.items.push({ kind: "transit", line: l.name, what: kind, date: ymd(x.d), title: x.t, url: x.u, src: x.s, official: !!x.o, todo: "data/manual/transit.json 에서 '" + l.name + "' 의 status·open·note 를 확인해 주세요" });
    });
  });
  /* 6-3 정책대출: 기금e든든 안내 페이지에서 연 x~y% 범위를 읽어 수동값과 비교 (src 가 있는 상품만) */
  out.loans.auto = {};
  var progs = out.loans.manual.programs || [];
  for (var li = 0; li < progs.length; li++) {
    var pg = progs[li]; if (!pg.src) continue;
    try {
      var html = (await getText(pg.src)).replace(/<[^>]+>/g, " "), rr = /연\s*([0-9]\.[0-9]{1,2})\s*%?\s*[~∼～]\s*(?:연\s*)?([0-9]\.[0-9]{1,2})\s*%/g, mm, lo = null, hi = null, cnt = 0;
      while ((mm = rr.exec(html))) { var a = Number(mm[1]), b = Number(mm[2]); if (!(a >= 0.5 && b <= 9 && a < b)) continue; cnt++; lo = lo == null ? a : Math.min(lo, a); hi = hi == null ? b : Math.max(hi, b); }
      if (!cnt) { log("대출 금리 페이지에서 범위를 못 찾음: " + pg.name); continue; }
      var found = lo.toFixed(2) + "~" + hi.toFixed(2), man = String(pg.rate || "").replace(/\s/g, "");
      out.loans.auto[pg.name] = { rate: found, t: out.asOf, src: pg.src, n: cnt };
      var same = man.split("~").map(Number).join("~") === found.split("~").map(Number).join("~");
      log("대출 금리 공고 " + pg.name + " 연 " + found + "% (" + cnt + "곳" + (same ? ", 수동값과 같음)" : ", 수동값 " + man + " 과 다름)"));
      if (!same) inbox.items.push({ kind: "loan", name: pg.name, manual: pg.rate, found: found, date: String(out.asOf).replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3"), title: pg.name + " 금리 공고 연 " + found + "% (수동 " + pg.rate + "%)", url: pg.src, src: "기금e든든", official: true, todo: "data/manual/loans.json 의 rate 와 asOf 를 고쳐 주세요 (카드에는 공고값을 먼저 보여 줍니다)" });
    } catch (e) { log("대출 금리 페이지 실패 " + pg.name + ": " + e.message); }
  }
  /* 대출 조건 변경 기사(14일) */
  out.loans.news.filter(function (x) { return /(디딤돌|보금자리|버팀목|신생아)/.test(x.t) && /(금리|한도|인상|인하|조정|개편|강화|완화|중단|재개)/.test(x.t) && !/(예정|검토|전망|촉구|요구)/.test(x.t); }).slice(0, 4)
    .forEach(function (x) { inbox.items.push({ kind: "loan", date: ymd(x.d), title: x.t, url: x.u, src: x.s, official: !!x.o, todo: "data/manual/loans.json 의 조건(소득·집값·한도·금리)을 확인해 주세요" }); });
  /* 같은 제목 중복 제거, 전에 없던 항목 표시 */
  var seenI = {}, prevKeys = {};
  (prevInbox.items || []).forEach(function (x) { prevKeys[normT(x.title)] = x.firstSeen || prevInbox.asOf || ""; });
  inbox.items = inbox.items.filter(function (x) { var k = normT(x.title); if (seenI[k]) return false; seenI[k] = 1; return true; })
    .map(function (x) { x.firstSeen = prevKeys[normT(x.title)] || String(out.asOf).replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3"); x.isNew = !prevKeys[normT(x.title)]; return x; })
    .sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); }).slice(0, 30);
  var newOnes = inbox.items.filter(function (x) { return x.isNew; });
  fs.mkdirSync(path.dirname(INBOX_P), { recursive: true });
  fs.writeFileSync(INBOX_P, JSON.stringify(inbox, null, 1));
  log("확인 필요 " + inbox.items.length + "건 (새로 생긴 것 " + newOnes.length + "건) → data/manual/_inbox.json");
  try { fs.unlinkSync(INBOX_NOTE); } catch (e) {}
  if (newOnes.length) {
    var md = ["TrackApt 자동 점검에서 수동 목록(data/manual)에 반영할 만한 소식을 찾았습니다. 확인 뒤 해당 파일을 고치면 다음 날 목록에서 사라집니다.", ""];
    newOnes.forEach(function (x) { md.push("- [" + ({ policy: "대책", transit: "교통", loan: "대출" }[x.kind] || x.kind) + "] " + (x.date || "") + " " + x.title + (x.url ? " — " + x.url : "") + "\n  - 할 일: " + x.todo); });
    fs.writeFileSync(INBOX_NOTE, md.join("\n"));
  }

  out.calls = CALLS;
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(OUT_P, JSON.stringify(out));
  fs.writeFileSync(CODES_P, JSON.stringify(CODES, null, 1));
  DBG.codes = CODES; DBG.errors = out.errors;
  fs.writeFileSync(DEBUG_P, JSON.stringify(DBG, null, 1));
  log("완료 — 호출 " + CALLS + "회 · 오류 " + out.errors.length + "건 · " + Math.round(fs.statSync(OUT_P).size / 1024) + "KB");
})().catch(function (e) { console.error(e); process.exit(1); });
