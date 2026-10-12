/* scripts/daily_build.js — '오늘 한 장' 카드에 들어갈 보조 지표를 매일 새벽에 모은다 (v9.19)
   GitHub Actions 가 macro_build.js 다음에 돌려 daily_data.json 을 커밋한다. 앱의 '오늘 한 장' 카드가 읽는다. 없는 항목은 카드에서 그 줄만 빠진다.

   ① 미분양      — 통계청 KOSIS Open API (KOSIS_KEY) · 국토부 '미분양주택현황보고' 월별 (전국·수도권·서울 + 준공 후 미분양)
   ② 가격지수    — KOSIS 에 올라오는 한국부동산원 '전국주택가격동향조사' 아파트 매매·전세가격지수 월별 (전국·수도권·서울)
                   주간 지수는 부동산원 R-ONE Open API 키(RONE_KEY, 선택)가 있을 때만 (data/daily_codes.json 의 roneWeekly 표 ID 사용)
   ③ 청약        — 공공데이터포털 청약홈 분양정보 API (DATA_GO_KEY, 선택). 접수 중·예정 단지와 최근 경쟁률.
                   국토부 실거래 키와 같은 data.go.kr 계정이면 '한국부동산원_청약홈 분양정보 조회 서비스' 활용신청 후 같은 키를 GitHub Secret 으로 넣으면 된다.
   통계표 코드는 기본값을 먼저 쓰고, 안 맞으면 이름으로 찾아 data/daily_codes.json 에 기억한다. 무엇을 받았고 어디서 막혔는지는 data/daily_debug.json.
   node 18+ */
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var KOSIS = process.env.KOSIS_KEY || "", RONE = process.env.RONE_KEY || "", DATAGO = process.env.DATA_GO_KEY || "";
var KOSIS_BASE = process.env.KOSIS_BASE || "https://kosis.kr/openapi/", RONE_BASE = process.env.RONE_BASE || "https://www.reb.or.kr/r-one/openapi/", ODC_BASE = process.env.ODC_BASE || "https://api.odcloud.kr/api/";
var CODES_P = path.join(ROOT, "data", "daily_codes.json"), DEBUG_P = path.join(ROOT, "data", "daily_debug.json"), OUT_P = path.join(ROOT, "daily_data.json");
var DBG = { builtAt: new Date().toISOString(), steps: [] }, CALLS = 0;
function log(s) { console.log(s); DBG.steps.push(String(s)); }
function readJson(p, d) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return d; } }
function num(v) { var n = Number(String(v == null ? "" : v).replace(/,/g, "")); return isFinite(n) ? n : null; }
function kst() { var d = new Date(Date.now() + 9 * 3600000); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
function ymd(n) { return String(n).replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3"); }
var CODES = readJson(CODES_P, {});
var DEF = {
  unsold: { orgId: "116", tblId: "DT_MLTM_2080", nm: "미분양주택현황보고" },
  unsoldDone: { orgId: "116", tblId: "DT_MLTM_2082", nm: "공사완료후 미분양현황" },
  idxSale: { orgId: "408", tblId: "DT_30404_N0010", nm: "아파트 매매가격지수" },
  idxRent: { orgId: "408", tblId: "DT_30404_N0012", nm: "아파트 전세가격지수" },
  roneWeekly: { sale: "A_2024_00901", nm: "주간아파트 매매가격지수" }
};
async function getText(url) {
  CALLS++;
  var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 25000);
  try { var r = await fetch(url, { signal: ac.signal, headers: { "user-agent": "Mozilla/5.0 (TrackApt-daily-build)" } }); return await r.text(); }
  finally { clearTimeout(t); }
}
async function getJson(url) { var t = await getText(url); try { return JSON.parse(t); } catch (e) { return { _raw: t.slice(0, 300) }; } }

/* ── KOSIS ──────────────────────────────────────────────────────────── */
function kosisUrl(svc, q) { var s = KOSIS_BASE + svc + "?method=" + q.method + "&apiKey=" + encodeURIComponent(KOSIS) + "&format=json&jsonVD=Y"; Object.keys(q).forEach(function (k) { if (k !== "method") s += "&" + k + "=" + encodeURIComponent(q[k]); }); return s; }
function kArr(j) { return Array.isArray(j) ? j : (j && Array.isArray(j.list) ? j.list : null); }
function kErr(j) { return j ? (j.errMsg || j.err || (j._raw ? j._raw.slice(0, 120) : JSON.stringify(j).slice(0, 120))) : "빈 응답"; }
function kNames(r) { return [r.C1_NM, r.C2_NM, r.C3_NM, r.C4_NM].filter(Boolean).join(" "); }
async function kosisProbe(c, months) {
  function q(n, over) { var o = { method: "getList", orgId: c.orgId, tblId: c.tblId, itmId: "ALL", prdSe: "M", newEstPrdCnt: String(months || 1) }; for (var k = 1; k <= n; k++) o["objL" + k] = "ALL"; Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; }); return o; }
  for (var n = 1; n <= 3; n++) { var j = await getJson(kosisUrl("Param/statisticsParameterData.do", q(n))); var a = kArr(j); if (a && a.length) return { rows: a, nLev: n, q: q }; log("KOSIS " + c.nm + " 탐색 " + n + "단계: " + kErr(j)); }
  return null;
}
async function kosisFind(key) {
  var c = CODES[key] || DEF[key];
  var p = await kosisProbe(c, 1);
  if (p) return { c: c, p: p };
  /* 이름으로 찾기 */
  var found = await getJson(kosisUrl("statisticsSearch.do", { method: "getList", searchNm: DEF[key].nm }));
  var list = kArr(found) || [];
  var pick = list.filter(function (x) { return (x.TBL_NM || "").indexOf(DEF[key].nm.slice(0, 4)) >= 0; })[0] || list[0];
  if (!pick) { log("KOSIS 검색 실패 " + DEF[key].nm + ": " + kErr(found)); return null; }
  c = { orgId: pick.ORG_ID, tblId: pick.TBL_ID, nm: pick.TBL_NM }; log("KOSIS 표 선택 " + key + ": " + c.orgId + "/" + c.tblId + " " + c.nm);
  p = await kosisProbe(c, 1); if (!p) return null;
  CODES[key] = c; return { c: c, p: p };
}
function seriesOf(rows, filt) {
  var m = {}; rows.filter(filt).forEach(function (r) { var t = Number(r.PRD_DE), v = num(r.DT); if (t && v != null) m[t] = v; });
  return Object.keys(m).map(Number).sort().map(function (t) { return [t, m[t]]; });
}
async function kosisSeries(key, pickRows, months) {
  var f = await kosisFind(key); if (!f) return null;
  var want = pickRows(f.p.rows); if (!want.length) { log("KOSIS " + key + " 행 선택 실패 — " + f.p.rows.slice(0, 6).map(function (r) { return r.ITM_NM + "/" + kNames(r); }).join(", ")); DBG[key + "Probe"] = f.p.rows.slice(0, 12); return null; }
  var j = await getJson(kosisUrl("Param/statisticsParameterData.do", f.p.q(f.p.nLev, { newEstPrdCnt: String(months) })));
  var rows = kArr(j); if (!rows) { log("KOSIS " + key + " 2차 실패: " + kErr(j)); return null; }
  DBG[key + "Sample"] = rows.slice(0, 3);
  return { rows: rows, nm: f.c.nm, picked: want };
}
function regionPick(rows, re, itmRe) { return rows.filter(function (r) { return re.test(kNames(r) || r.ITM_NM || "") && (!itmRe || itmRe.test(r.ITM_NM || "")); }); }

async function unsold() {
  if (!KOSIS) { log("KOSIS_KEY 없음 → 미분양 건너뜀"); return null; }
  var out = {};
  var tot = await kosisSeries("unsold", function (rows) { return regionPick(rows, /^(전국|계|합계)$/); }, 25);
  if (tot) {
    var R = tot.rows, grp = function (re) { var s = seriesOf(R, function (r) { return re.test((r.C1_NM || "").trim()) && !/준공|완료/.test(r.ITM_NM || ""); }); return s.length ? s : null; };
    out.all = grp(/^(전국|계|합계)$/); out.cap = grp(/^수도권$/); out.seoul = grp(/^서울/); out.gg = grp(/^경기/);
    out.src = tot.nm;
  }
  var done = await kosisSeries("unsoldDone", function (rows) { return regionPick(rows, /^(전국|계|합계)$/); }, 25);
  if (done) out.done = seriesOf(done.rows, function (r) { return /^(전국|계|합계)$/.test((r.C1_NM || "").trim()); }) || null;
  return Object.keys(out).length ? out : null;
}
async function priceIndex() {
  if (!KOSIS) return null;
  var out = {};
  for (var kk = 0; kk < 2; kk++) {
    var key = kk ? "idxRent" : "idxSale";
    var s = await kosisSeries(key, function (rows) { return regionPick(rows, /^(전국|수도권|서울)/); }, 26);
    if (!s) continue;
    var R = s.rows, g = function (re) { var a = seriesOf(R, function (r) { return re.test((r.C1_NM || "").trim()) && !/증감|변동/.test(r.ITM_NM || ""); }); return a.length ? a : null; };
    out[kk ? "rent" : "sale"] = { all: g(/^전국$/), cap: g(/^수도권$/), seoul: g(/^서울/), gg: g(/^경기/), src: s.nm };
  }
  return Object.keys(out).length ? out : null;
}
/* R-ONE 주간 지수 (선택) */
async function weekly() {
  if (!RONE) return null;
  var c = CODES.roneWeekly || DEF.roneWeekly;
  try {
    var j = await getJson(RONE_BASE + "SttsApiTblData.do?KEY=" + encodeURIComponent(RONE) + "&Type=json&pIndex=1&pSize=1000&STATBL_ID=" + c.sale + "&DTACYCLE_CD=WK");
    var rows = (j.SttsApiTblData && j.SttsApiTblData[1] && j.SttsApiTblData[1].row) || [];
    if (!rows.length) { log("R-ONE 주간: " + JSON.stringify(j).slice(0, 160)); DBG.rone = j; return null; }
    DBG.roneSample = rows.slice(0, 3);
    var out = { src: "한국부동산원 R-ONE " + c.nm }, pick = function (re) { var m = {}; rows.filter(function (r) { return re.test(r.CLS_NM || "") && /매매|지수|변동/.test((r.ITM_NM || "") + "지수"); }).forEach(function (r) { var t = Number(String(r.WRTTIME_IDTFR_ID || "").slice(0, 8)), v = num(r.DTA_VAL); if (t && v != null) m[t] = v; }); var a = Object.keys(m).map(Number).sort().map(function (t) { return [t, m[t]]; }); return a.length ? a.slice(-30) : null; };
    out.all = pick(/^전국$/); out.cap = pick(/^수도권$/); out.seoul = pick(/^서울$/); out.gg = pick(/^경기$/);
    return out;
  } catch (e) { log("R-ONE 실패: " + e.message); return null; }
}
/* 청약홈 (선택) */
async function subs() {
  if (!DATAGO) { log("DATA_GO_KEY 없음 → 청약 건너뜀"); return null; }
  var today = kst(), out = { open: [], soon: [], results: [], src: "청약홈(공공데이터포털)" };
  try {
    var j = await getJson(ODC_BASE + "ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail?page=1&perPage=300&serviceKey=" + encodeURIComponent(DATAGO) + "&returnType=JSON");
    var rows = j.data || [];
    if (!rows.length) { log("청약 분양정보: " + JSON.stringify(j).slice(0, 160)); DBG.subs = j; }
    DBG.subsSample = rows.slice(0, 2);
    rows.forEach(function (r) {
      var b = num(String(r.RCEPT_BGNDE || "").replace(/-/g, "")), e = num(String(r.RCEPT_ENDDE || "").replace(/-/g, ""));
      var it = { nm: r.HOUSE_NM, area: r.SUBSCRPT_AREA_CODE_NM, addr: r.HSSPLY_ADRES, n: num(r.TOT_SUPLY_HSHLDCO), b: b, e: e, win: num(String(r.PRZWNER_PRESNATN_DE || "").replace(/-/g, "")), url: r.PBLANC_URL, rent: r.RENT_SECD_NM };
      if (!b || !e) return;
      if (b <= today && today <= e) out.open.push(it);
      else if (b > today && b <= today + 14) out.soon.push(it);
    });
    out.open.sort(function (a, b) { return a.e - b.e; }); out.soon.sort(function (a, b) { return a.b - b.b; });
    var c = await getJson(ODC_BASE + "ApplyhomeInfoCmpetRtSvc/v1/getAPTLttotPblancCmpet?page=1&perPage=300&serviceKey=" + encodeURIComponent(DATAGO) + "&returnType=JSON");
    var cr = c.data || [], byHouse = {};
    DBG.cmpetSample = cr.slice(0, 2);
    cr.forEach(function (r) { var k = r.HOUSE_MANAGE_NO || r.HOUSE_NM; var rate = num(r.CMPET_RATE), req = num(r.REQ_CNT), sup = num(r.SUPLY_HSHLDCO); if (!k) return; var o = byHouse[k] || (byHouse[k] = { nm: r.HOUSE_NM, req: 0, sup: 0, max: null }); o.req += req || 0; o.sup += sup || 0; if (rate != null && (o.max == null || rate > o.max)) o.max = rate; });
    out.results = Object.keys(byHouse).map(function (k) { var o = byHouse[k]; o.rate = o.sup ? Math.round(o.req / o.sup * 10) / 10 : o.max; return o; }).filter(function (o) { return o.rate != null; }).slice(0, 40);
    log("청약 접수 중 " + out.open.length + " · 예정 " + out.soon.length + " · 경쟁률 " + out.results.length);
  } catch (e) { log("청약 실패: " + e.message); }
  return out;
}

(async function () {
  var out = { v: 1, builtAt: new Date().toISOString(), asOf: kst(), errors: [] };
  async function step(nm, fn) { try { var r = await fn(); if (r) out[nm] = r; log(nm + (r ? " OK" : " 없음")); } catch (e) { out.errors.push(nm + ": " + e.message); log(nm + " 실패: " + e.message); } }
  await step("unsold", unsold);
  await step("index", priceIndex);
  await step("weekly", weekly);
  await step("subs", subs);
  out.calls = CALLS;
  fs.writeFileSync(OUT_P, JSON.stringify(out));
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(CODES_P, JSON.stringify(CODES, null, 1));
  DBG.errors = out.errors; fs.writeFileSync(DEBUG_P, JSON.stringify(DBG, null, 1));
  log("완료 — 호출 " + CALLS + "회 · 오류 " + out.errors.length + "건");
})().catch(function (e) { console.error(e); process.exit(1); });
