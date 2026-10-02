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
/* 시험용 — 가짜 서버로 돌릴 때만 바꾼다 */
var ECOS_BASE = process.env.ECOS_BASE || "https://ecos.bok.or.kr/api/", KOSIS_BASE = process.env.KOSIS_BASE || "https://kosis.kr/openapi/", GNEWS_BASE = process.env.GNEWS_BASE || "https://news.google.com/rss/search";

async function getText(url) {
  CALLS++;
  var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 25000);
  try {
    var r = await fetch(url, { signal: ac.signal, headers: { "user-agent": "TrackApt-macro-build/1.0" } });
    return await r.text();
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
      if (it) { CODES[key] = { stat: tries[i].stat, item: it.ITEM_CODE, cycle: it.CYCLE || tries[i].cycle, nm: it.STAT_NAME + " · " + it.ITEM_NAME, how: "기본 코드" }; return CODES[key]; }
      var byName = items.filter(function (r) { return hit(r.ITEM_NAME, want.item[0], want.item[1], want.item[2]) && (!want.cycle || r.CYCLE === want.cycle); })[0];
      if (byName) { CODES[key] = { stat: tries[i].stat, item: byName.ITEM_CODE, cycle: byName.CYCLE, nm: byName.STAT_NAME + " · " + byName.ITEM_NAME, how: "기본 표 안에서 이름으로" }; return CODES[key]; }
    } catch (e) { log(key + " 기본 코드 확인 실패: " + e.message); }
  }
  var tabs = (await ecosTables()).filter(function (r) { return hit(r.STAT_NAME, want.table[0], want.table[1], want.table[2]) && (!want.cycle || r.CYCLE === want.cycle); });
  log(key + " 이름으로 찾은 통계표 " + tabs.length + "개: " + tabs.slice(0, 5).map(function (r) { return r.STAT_CODE + " " + r.STAT_NAME; }).join(" / "));
  for (var k = 0; k < Math.min(tabs.length, 6); k++) {
    try {
      items = await ecosItems(tabs[k].STAT_CODE);
      var cand = items.filter(function (r) { return hit(r.ITEM_NAME, want.item[0], want.item[1], want.item[2]) && (!want.cycle || r.CYCLE === want.cycle) && Number(r.DATA_CNT || 1) > 0; });
      if (cand.length) { CODES[key] = { stat: tabs[k].STAT_CODE, item: cand[0].ITEM_CODE, cycle: cand[0].CYCLE, nm: tabs[k].STAT_NAME + " · " + cand[0].ITEM_NAME, how: "통계표 목록에서 이름으로" }; return CODES[key]; }
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
  if (!rows.length) { log(key + ": 자료 0건 (" + c.stat + "/" + c.item + ")"); delete CODES[key]; return null; }
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
async function kosisWages() {
  if (!KOSIS) return null;
  var c = CODES.kosisWage;
  if (!c) {
    var found = await getJson(kosisUrl("statisticsSearch.do", { method: "getList", searchNm: "상용근로자 임금총액" }));
    var list = Array.isArray(found) ? found : (found && found.list) || [];
    DBG.kosisSearch = list.slice(0, 10);
    var pick = list.filter(function (r) { return /임금/.test(r.TBL_NM || "") && /사업체노동력/.test((r.STAT_NM || "") + (r.TBL_NM || "")); })[0] || list[0];
    if (!pick) { log("KOSIS 검색 결과 없음: " + JSON.stringify(found).slice(0, 200)); return null; }
    c = { orgId: pick.ORG_ID, tblId: pick.TBL_ID, nm: pick.TBL_NM };
    log("KOSIS 표 선택: " + c.orgId + "/" + c.tblId + " " + c.nm);
  }
  var q = { method: "getList", orgId: c.orgId, tblId: c.tblId, itmId: "ALL", objL1: "ALL", objL2: "ALL", objL3: "ALL", objL4: "ALL", prdSe: "M", newEstPrdCnt: "30" };
  var j = await getJson(kosisUrl("statisticsParameterData.do", q));
  if (!Array.isArray(j)) { log("KOSIS 자료 응답 이상: " + JSON.stringify(j).slice(0, 200)); DBG.kosisRaw = j; return null; }
  DBG.kosisSample = j.slice(0, 5);
  var rows = j.filter(function (r) { return /임금총액|월평균임금|월급여/.test(r.ITM_NM || "") && /전산업|전체|계$/.test(r.C1_NM || "전체") && !/임시|일용/.test([r.C2_NM, r.C3_NM, r.ITM_NM].join(" ")); });
  if (!rows.length) rows = j.filter(function (r) { return /임금/.test(r.ITM_NM || ""); });
  if (!rows.length) { log("KOSIS 임금 행을 고르지 못함 (항목 이름 확인 필요)"); return null; }
  /* 같은 (C1,C2,...) 조합 중 가장 많은 달을 가진 것 */
  var g = {};
  rows.forEach(function (r) { var k = [r.ITM_NM, r.C1_NM, r.C2_NM, r.C3_NM].join("|"); (g[k] = g[k] || []).push(r); });
  var best = Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; })[0], arr = g[best];
  var hist = arr.map(function (r) { return [Number(r.PRD_DE), num(r.DT)]; }).filter(function (x) { return x[1] != null; }).sort(function (a, b) { return a[0] - b[0]; });
  if (!hist.length) return null;
  CODES.kosisWage = c;
  var unit = arr[0].UNIT_NM || "원", scale = /천원/.test(unit) ? 1000 : /만원/.test(unit) ? 10000 : 1;
  hist = hist.map(function (x) { return [x[0], x[1] * scale]; });
  return { v: hist[hist.length - 1][1], t: hist[hist.length - 1][0], unit: "원", name: "KOSIS " + c.nm + " · " + best.replace(/\|/g, " "), how: "KOSIS", hist: hist };
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
      ["base", { stat: "722Y001", item: "0101000", cycle: "D" }, { table: [["기준금리"]], item: [["기준금리"]], cycle: "D" }, 60],
      ["kb3y", { stat: "817Y002", item: "010200000", cycle: "D" }, { table: [["시장금리"], ["일별"]], item: [["국고채"], ["3년"]], cycle: "D" }, 36],
      ["mortgage", { stat: "121Y006", item: "BECBLA0302", cycle: "M" }, { table: [["가중평균금리"], ["신규취급액"], ["잔액"]], item: [["주택담보대출"]], cycle: "M" }, 36],
      ["cofix", { stat: "121Y006", item: "BECBLA01", cycle: "M" }, { table: [["가중평균금리"], ["신규취급액"], ["잔액"]], item: [["저축성수신"]], cycle: "M" }, 36]
    ];
    for (var i = 0; i < specs.length; i++) {
      try { out.rates[specs[i][0]] = await ecosSeries(specs[i][0], specs[i][1], specs[i][2], specs[i][3]); if (out.rates[specs[i][0]]) log(specs[i][0] + " ✓ " + out.rates[specs[i][0]].name + " = " + out.rates[specs[i][0]].v); }
      catch (e) { out.errors.push(specs[i][0] + ": " + e.message); log(specs[i][0] + " 실패: " + e.message); }
    }
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
