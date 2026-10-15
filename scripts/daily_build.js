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
var KOSIS = process.env.KOSIS_KEY || "", RONE = process.env.RONE_KEY || "", DATAGO = process.env.DATA_GO_KEY || "", FSS = process.env.FSS_KEY || "";
var FSS_BASE = process.env.FSS_BASE || "https://finlife.fss.or.kr/finlifeapi/";
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
  for (var n = 1; n <= 5; n++) { var j = await getJson(kosisUrl("Param/statisticsParameterData.do", q(n))); var a = kArr(j); if (a && a.length) return { rows: a, nLev: n, q: q }; if (!/objL/.test(kErr(j))) log("KOSIS " + c.nm + " 탐색 " + n + "단계: " + kErr(j)); }   /* objL 누락은 분류 단수를 더듬는 정상 과정 */
  return null;
}
/* 표 찾기: 기억한 코드 → 기본 코드 → 이름 검색 후보 순으로 1개월치를 받아 보고, validate 를 통과하는 첫 표를 쓴다 */
var DEF_SEARCH = { unsold: ["미분양주택현황", /미분양주택현황/], unsoldDone: ["공사완료후 미분양", /공사완료후.*미분양|준공.*미분양/], idxSale: ["아파트 매매가격지수", /매매가격지수/], idxRent: ["아파트 전세가격지수", /전세가격지수/] };
async function kosisFind(key, validate) {
  var cands = []; if (CODES[key]) cands.push(CODES[key]); cands.push(DEF[key]);
  var tried = {};
  for (var pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      var sr = DEF_SEARCH[key], found = await getJson(kosisUrl("statisticsSearch.do", { method: "getList", searchNm: sr[0] }));
      var list = (kArr(found) || []).filter(function (x) { return sr[1].test(x.TBL_NM || ""); });
      var score = function (x) { var nm = x.TBL_NM || ""; return (String(x.ORG_ID) === String(DEF[key].orgId) ? 4 : 0) + (/아파트/.test(nm) ? 2 : 0) + (/시도|시·도|지역별/.test(nm) ? 1 : 0) - (/주간|연령|규모|변동률|증감률|월세|전환율|통합|평균가격|중위/.test(nm) ? 8 : 0); };
      list.sort(function (a, b) { return score(b) - score(a); });
      DBG[key + "Search"] = list.slice(0, 10).map(function (x) { return x.ORG_ID + "/" + x.TBL_ID + " " + x.TBL_NM; });
      if (!list.length) log("KOSIS 검색 결과 없음 " + sr[0] + ": " + kErr(found));
      cands = list.slice(0, 8).map(function (x) { return { orgId: x.ORG_ID, tblId: x.TBL_ID, nm: x.TBL_NM }; });
    }
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i], id = c.orgId + "/" + c.tblId; if (tried[id]) continue; tried[id] = 1;
      var p = await kosisProbe(c, 1); if (!p) continue;
      if (validate && !validate(p.rows)) { log("KOSIS " + key + " 표 " + id + " 는 모양이 다름 — " + p.rows.slice(0, 4).map(function (r) { return r.ITM_NM + "/" + kNames(r); }).join(", ")); continue; }
      if (!CODES[key] || CODES[key].tblId !== c.tblId) log("KOSIS 표 선택 " + key + ": " + id + " " + c.nm);
      CODES[key] = c; return { c: c, p: p };
    }
  }
  return null;
}
function seriesOf(rows, filt) {
  var m = {}; rows.filter(filt).forEach(function (r) { var t = Number(r.PRD_DE), v = num(r.DT); if (t && v != null) m[t] = v; });
  return Object.keys(m).map(Number).sort().map(function (t) { return [t, m[t]]; });
}
async function kosisSeries(key, validate, months, narrow) {
  var f = await kosisFind(key, validate); if (!f) { log("KOSIS " + key + " 쓸 수 있는 표를 못 찾음"); return null; }
  var over = { newEstPrdCnt: String(months) }, nr = narrow ? narrow(f.p.rows) : null; if (nr) Object.keys(nr).forEach(function (k) { over[k] = nr[k]; });
  var rows = null, tries = [months, 12, 6];
  for (var ti = 0; ti < tries.length && !rows; ti++) {
    over.newEstPrdCnt = String(tries[ti]);
    var j = await getJson(kosisUrl("Param/statisticsParameterData.do", f.p.q(f.p.nLev, over)));
    rows = kArr(j); if (!rows) { log("KOSIS " + key + " 2차(" + tries[ti] + "개월) 실패: " + kErr(j)); if (!/40,000|셀/.test(kErr(j))) break; }
  }
  if (!rows) return null;
  DBG[key + "Sample"] = rows.slice(0, 3);
  return { rows: rows, nm: f.c.nm };
}
/* 행 고르기: C1 = 지역, 나머지 분류(부문·규모·주택유형 등)는 '총합·계·소계·종합·아파트' 같은 전체 행만 */
function c1(r) { return String(r.C1_NM || "").trim(); }
function restAll(r) { return [r.C2_NM, r.C3_NM, r.C4_NM].filter(Boolean).every(function (x) { return /^(총합|계|합계|소계|전체|종합|아파트)$/.test(String(x).trim()); }); }
function isTotalRow(r) { return /^(전국|계|합계|총계)$/.test(c1(r)) && restAll(r); }
function levelRow(r, nm) { return c1(r) === nm && restAll(r); }
function sumSeries(list) { var m = {}, cnt = {}; list.forEach(function (s) { (s || []).forEach(function (p) { m[p[0]] = (m[p[0]] || 0) + p[1]; cnt[p[0]] = (cnt[p[0]] || 0) + 1; }); }); return Object.keys(m).filter(function (t) { return cnt[t] === list.length; }).map(Number).sort().map(function (t) { return [t, m[t]]; }); }

async function unsold() {
  if (!KOSIS) { log("KOSIS_KEY 없음 → 미분양 건너뜀"); return null; }
  var out = {};
  var tot = await kosisSeries("unsold", function (rows) { return rows.some(isTotalRow) && !rows.some(function (r) { return /준공|완료/.test(r.ITM_NM || ""); }); }, 25);
  if (tot) {
    var R = tot.rows, g = function (f) { var s = seriesOf(R, f); return s.length ? s : null; };
    out.all = g(isTotalRow); out.seoul = g(function (r) { return levelRow(r, "서울") || levelRow(r, "서울특별시"); }); out.gg = g(function (r) { return levelRow(r, "경기") || levelRow(r, "경기도"); });
    var ic = g(function (r) { return levelRow(r, "인천") || levelRow(r, "인천광역시"); });
    out.cap = g(function (r) { return levelRow(r, "수도권"); }) || (out.seoul && out.gg && ic ? sumSeries([out.seoul, out.gg, ic]) : null);
    out.src = tot.nm;
  }
  var SIDO = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/;
  var sidoTot = function (r) { return SIDO.test(c1(r)) && !/\s(계|합계|소계)$/.test(c1(r)) ? (r.C2_NM != null && restAll(r)) : (SIDO.test(c1(r)) && /\s(계|합계|소계)$/.test(c1(r)) && restAll(r)); };
  var done = await kosisSeries("unsoldDone", function (rows) { return rows.some(isTotalRow) || rows.some(sidoTot); }, 25, function (rows) {
    var r = rows.filter(function (x) { return x.C2 && /^(계|합계|소계|총합)$/.test(String(x.C2_NM || "").trim()); })[0];
    return r ? { objL2: r.C2 } : null;   /* 시군구 표: 2단은 '계' 코드만 받아 40,000셀 제한을 피한다 */
  });
  if (done) {
    var ds = seriesOf(done.rows, isTotalRow);
    if (!ds.length) { var by = {}; done.rows.filter(sidoTot).forEach(function (r) { by[c1(r)] = 1; }); ds = sumSeries(Object.keys(by).map(function (nm) { return seriesOf(done.rows, function (r) { return c1(r) === nm && restAll(r); }); })); log("준공 후 미분양: 시도 " + Object.keys(by).length + "곳 합산"); }
    if (ds.length) out.done = ds;
    var sd = seriesOf(done.rows, function (r) { return /^서울/.test(c1(r)) && (isTotalRow(r) || sidoTot(r)); }); if (sd.length) out.doneSeoul = sd;
  }
  return Object.keys(out).length ? out : null;
}
async function priceIndex() {
  if (!KOSIS) return null;
  var out = {};
  for (var kk = 0; kk < 2; kk++) {
    var key = kk ? "idxRent" : "idxSale", re = kk ? /전세가격지수/ : /매매가격지수/;
    var s = await kosisSeries(key, function (rows) { return String(rows[0].PRD_DE || "").length === 6 && rows.some(function (r) { return /^(전국|수도권)$/.test(c1(r)) && re.test(r.ITM_NM || "") && !/증감|변동|평균|중위/.test(r.ITM_NM || "") && restAll(r); }); }, 26);
    if (!s) continue;
    var R = s.rows, idxRow = function (nm) { return function (r) { return c1(r) === nm && restAll(r) && re.test(r.ITM_NM || "") && !/증감|변동/.test(r.ITM_NM || ""); }; };
    var g = function (nm) { var a = seriesOf(R, idxRow(nm)); return a.length ? a : null; };
    out[kk ? "rent" : "sale"] = { all: g("전국"), cap: g("수도권"), seoul: g("서울"), gg: g("경기"), src: s.nm };
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
/* 청약홈 (선택) — APT 분양 + 무순위·잔여세대 + 주택형별 분양가 + 경쟁률. 일정은 '미리' 알아야 하므로 공고일 기준 과거 45일 ~ 앞으로의 것을 모두 담는다 */
function dn(v) { var n = num(String(v || "").replace(/-/g, "").slice(0, 8)); return n && n > 19000000 ? n : null; }
function dateIn(s) { var m = String(s || "").match(/(\d{4})-?(\d{2})-?(\d{2})/); return m ? Number(m[1] + m[2] + m[3]) : null; }
async function odc(path, q) {
  var all = [], page = 1;
  while (page <= 4) {
    var j = await getJson(ODC_BASE + path + "?page=" + page + "&perPage=500&serviceKey=" + encodeURIComponent(DATAGO) + "&returnType=JSON" + (q || ""));
    var d = j.data || []; if (!d.length) { if (page === 1) { log("청약 " + path.split("/").pop() + ": " + JSON.stringify(j).slice(0, 160)); DBG["odc_" + path.split("/").pop()] = j; } break; }
    all = all.concat(d); if (d.length < 500) break; page++;
  }
  return all;
}
/* 최근 것 위주로 받기 — 첫 쪽으로 전체 건수를 보고, 2,000건이 넘으면 마지막 쪽(최근일 가능성)도 받는다. 최대 4회 */
async function odcRecent(path) {
  var url = function (pg) { return ODC_BASE + path + "?page=" + pg + "&perPage=500&serviceKey=" + encodeURIComponent(DATAGO) + "&returnType=JSON"; };
  var j = await getJson(url(1)), d = j.data || [], nm = path.split("/").pop();
  if (!d.length) { log("청약 " + nm + ": " + JSON.stringify(j).slice(0, 160)); DBG["odc_" + nm] = j; return []; }
  var total = Number(j.totalCount || j.matchCount || d.length), last = Math.ceil(total / 500), pages = [];
  if (last <= 4) for (var p = 2; p <= last; p++) pages.push(p); else pages = [2, last - 1, last];
  for (var i = 0; i < pages.length; i++) { var k = await getJson(url(pages[i])); d = d.concat(k.data || []); }
  DBG["odcTotal_" + nm] = total;
  return d;
}
async function subs() {
  if (!DATAGO) { log("DATA_GO_KEY 없음 → 청약 건너뜀"); return null; }
  var today = kst(), from = today - 0; var fromD = new Date(Date.UTC(Math.floor(today / 10000), Math.floor(today / 100) % 100 - 1, today % 100) - 45 * 86400000); var since = fromD.getUTCFullYear() * 10000 + (fromD.getUTCMonth() + 1) * 100 + fromD.getUTCDate();
  var out = { asOf: today, items: [], results: [], src: "청약홈(공공데이터포털)" };
  try {
    /* 1 APT 분양 공고 */
    var apt = await odc("ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail");
    DBG.subsSample = apt.slice(0, 1);
    var NAME = {};   /* 경쟁률 API 에는 단지명이 없어 공고 전체(기간 무관)에서 관리번호 → 이름·지역을 만든다 */
    apt.forEach(function (r) { NAME[String(r.HOUSE_MANAGE_NO)] = { nm: r.HOUSE_NM, area: r.SUBSCRPT_AREA_CODE_NM, notice: dn(r.RCRIT_PBLANC_DE), win: dn(r.PRZWNER_PRESNATN_DE), b: dn(r.RCEPT_BGNDE) }; });
    apt.forEach(function (r) {
      var it = { kind: "apt", no: r.HOUSE_MANAGE_NO, pno: r.PBLANC_NO, nm: r.HOUSE_NM, type: r.HOUSE_SECD_NM || r.HOUSE_DTL_SECD_NM, rent: r.RENT_SECD_NM, area: r.SUBSCRPT_AREA_CODE_NM, addr: r.HSSPLY_ADRES, zip: r.HSSPLY_ZIP, n: num(r.TOT_SUPLY_HSHLDCO),
        notice: dn(r.RCRIT_PBLANC_DE), spB: dn(r.SPSPLY_RCEPT_BGNDE), spE: dn(r.SPSPLY_RCEPT_ENDDE), r1: dateIn(r.GNRL_RNK1_CRSPAREA_RCPTDE || r.GNRL_RNK1_CRSPAREA_RCEPT_PD), r1x: dateIn(r.GNRL_RNK1_ETC_AREA_RCPTDE), r1g: dateIn(r.GNRL_RNK1_ETC_GG_RCPTDE), r2g: dateIn(r.GNRL_RNK2_ETC_GG_RCPTDE), r2: dateIn(r.GNRL_RNK2_CRSPAREA_RCPTDE || r.GNRL_RNK2_CRSPAREA_RCEPT_PD), r2x: dateIn(r.GNRL_RNK2_ETC_AREA_RCPTDE),
        b: dn(r.RCEPT_BGNDE), e: dn(r.RCEPT_ENDDE), win: dn(r.PRZWNER_PRESNATN_DE), cB: dn(r.CNTRCT_CNCLS_BGNDE), cE: dn(r.CNTRCT_CNCLS_ENDDE), move: r.MVN_PREARNGE_YM,
        cap: r.PARCPRC_ULS_AT === "Y", hot: r.SPECLT_RDN_EARTH_AT === "Y", adj: r.MDAT_TRGET_AREA_SECD === "Y", pub: r.PUBLIC_HOUSE_EARTH_AT === "Y", big: r.LRSCL_BLDLND_AT === "Y", redev: r.IMPRMN_BSNS_AT === "Y", pubLaw: r.PUBLIC_HOUSE_SPCLW_APPLC_AT === "Y", npln: r.NPLN_PRVOPR_PUBLIC_HOUSE_AT === "Y", dtl: r.HOUSE_DTL_SECD_NM, builder: r.CNSTRCT_ENTRPS_NM, owner: r.BSNS_MBY_NM, tel: r.MDHS_TELNO, url: r.PBLANC_URL, home: r.HMPG_ADRES };
      var last = Math.max(it.win || 0, it.e || 0, it.cE || 0, it.notice || 0);
      if (last >= since) out.items.push(it);
    });
    /* 2 무순위·잔여세대 */
    try {
      var rem = await odc("ApplyhomeInfoDetailSvc/v1/getRemndrLttotPblancDetail");
      DBG.remSample = rem.slice(0, 1);
      rem.forEach(function (r) {
        var it = { kind: "rem", no: r.HOUSE_MANAGE_NO, pno: r.PBLANC_NO, nm: r.HOUSE_NM, type: r.HOUSE_SECD_NM || "무순위", sub: r.HOUSE_DTL_SECD_NM, area: r.SUBSCRPT_AREA_CODE_NM, addr: r.HSSPLY_ADRES, n: num(r.TOT_SUPLY_HSHLDCO), notice: dn(r.RCRIT_PBLANC_DE), b: dn(r.SUBSCRPT_RCEPT_BGNDE || r.RCEPT_BGNDE), e: dn(r.SUBSCRPT_RCEPT_ENDDE || r.RCEPT_ENDDE), win: dn(r.PRZWNER_PRESNATN_DE), cB: dn(r.CNTRCT_CNCLS_BGNDE), cE: dn(r.CNTRCT_CNCLS_ENDDE), url: r.PBLANC_URL, home: r.HMPG_ADRES, tel: r.MDHS_TELNO };
        var last = Math.max(it.win || 0, it.e || 0, it.notice || 0);
        if (last >= since) out.items.push(it);
      });
    } catch (e) { log("무순위 실패: " + e.message); }
    /* 3 주택형별 분양가·공급 수 (APT) — 담은 단지만 */
    try {
      var mdl = await odc("ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancMdl");
      DBG.mdlSample = mdl.slice(0, 1);
      var byNo = {}; mdl.forEach(function (m) { var k = String(m.HOUSE_MANAGE_NO); (byNo[k] = byNo[k] || []).push(m); });
      out.items.forEach(function (it) {
        if (it.kind !== "apt") return;
        var L = byNo[String(it.no)] || []; if (!L.length) return;
        it.types = L.map(function (m) { return { ty: m.HOUSE_TY, n: num(m.SUPLY_HSHLDCO), sp: num(m.SPSPLY_HSHLDCO), top: num(m.LTTOT_TOP_AMOUNT), area: num(m.SUPLY_AR),
          spd: (function () { var g = function (a, b) { var v = num(m[a]); return v != null ? v : num(m[b]); }; return { 다자녀: g("MNYCH_HSHLDCO", "MNYCH_SPSPLY_HSHLDCO"), 신혼부부: g("NWWDS_HSHLDCO", "NWWDS_SPSPLY_HSHLDCO"), 생애최초: g("LFE_FRST_HSHLDCO", "LFE_FRST_SPSPLY_HSHLDCO"), 노부모: g("OLD_PARNTS_SUPORT_HSHLDCO", "OLD_PARNTS_SUPORT_SPSPLY_HSHLDCO"), 기관추천: g("INSTT_RECOMEND_HSHLDCO", "INSTT_RECOMEND_SPSPLY_HSHLDCO"), 청년: g("YGMN_HSHLDCO", "YGMN_SPSPLY_HSHLDCO"), 신생아: g("NWBB_HSHLDCO", "NWBB_SPSPLY_HSHLDCO"), 이전기관: g("TRANSR_INSTT_ENFSN_HSHLDCO", "TRANSR_INSTT_ENFSN_SPSPLY_HSHLDCO"), 기타: g("ETC_HSHLDCO", "ETC_SPSPLY_HSHLDCO") }; })() }; }).filter(function (t) { return t.ty; }).sort(function (a, b) { return (a.area || 0) - (b.area || 0); }).slice(0, 12);
        var tops = it.types.filter(function (t) { return t.top; });
        if (tops.length) { it.pMin = Math.min.apply(null, tops.map(function (t) { return t.top; })); it.pMax = Math.max.apply(null, tops.map(function (t) { return t.top; })); var t84 = tops.filter(function (t) { return t.area && t.area >= 80 && t.area <= 86; })[0]; if (t84) it.p84 = t84.top; }
      });
    } catch (e) { log("주택형별 분양가 실패: " + e.message); }
    /* 4 경쟁률 (최근 공고 기준) */
    try {
      var cr = await odcRecent("ApplyhomeInfoCmpetRtSvc/v1/getAPTLttotPblancCmpet");
      DBG.cmpetSample = cr.slice(0, 1);
      /* 행 = 주택형 × 순위(1·2) × 거주구분(해당·기타·경기). 공급 세대수(SUPLY_HSHLDCO)는 주택형마다 같은 값이 행마다 반복되므로 한 번만 센다.
         1순위 경쟁률 = 주택형 1순위 신청 합(해당+기타) ÷ 주택형 일반공급. CMPET_RATE 의 "(△n)" 은 n세대 미달. */
      var H = {};
      cr.forEach(function (r) {
        var k = String(r.HOUSE_MANAGE_NO || ""); if (!k) return;
        var h = H[k] || (H[k] = { no: k, ty: {} });
        var tk = String(r.MODEL_NO || r.HOUSE_TY), t = h.ty[tk] || (h.ty[tk] = { ty: r.HOUSE_TY, sup: 0, r1: 0, r2: 0, r1here: 0, r1rate: null, short: false });
        var sup = num(r.SUPLY_HSHLDCO) || 0, req = num(r.REQ_CNT) || 0, rank = Number(r.SUBSCRPT_RANK_CODE), here = /해당/.test(String(r.RESIDE_SENM || "")) || String(r.RESIDE_SECD) === "01";
        if (sup > t.sup) t.sup = sup;
        if (rank === 2) t.r2 += req; else { t.r1 += req; if (here) t.r1here += req; }
        if (/△/.test(String(r.CMPET_RATE || ""))) t.short = true;
      });
      var R = Object.keys(H).map(function (k) {
        var h = H[k], T = Object.keys(h.ty).map(function (x) { return h.ty[x]; }).filter(function (t) { return t.sup > 0; });
        if (!T.length) return null;
        var sup = 0, r1 = 0, r1h = 0, r2 = 0, max = null, maxTy = "", shortN = 0;
        T.forEach(function (t) { sup += t.sup; r1 += t.r1; r1h += t.r1here; r2 += t.r2; var rt = t.r1 / t.sup; if (max == null || rt > max) { max = rt; maxTy = t.ty; } if (t.r1 + t.r2 < t.sup) shortN++; });
        var nm = NAME[k] || {};
        return { no: k, nm: nm.nm || null, area: nm.area || "", notice: nm.notice || null, win: nm.win || null, b: nm.b || null,
          sup: sup, req: r1, reqHere: r1h, req2: r2, rate: Math.round(r1 / sup * 100) / 100, rateHere: Math.round(r1h / sup * 100) / 100, max: Math.round(max * 100) / 100, maxTy: maxTy,
          types: T.length, shortTypes: shortN, status: r1 >= sup && !T.some(function (t) { return t.r1 < t.sup; }) ? "1순위 마감" : (r1 + r2 >= sup && shortN === 0 ? "2순위 마감" : "미달 " + shortN + "개 주택형") };
      }).filter(Boolean);
      R.sort(function (a, b) { return (b.b || b.notice || 0) - (a.b || a.notice || 0) || b.rate - a.rate; });
      /* 4-1 당첨 가점 (v9.29) — 주택형 × 거주구분별 최저·평균·최고. 가점제 물량(주로 민영 85㎡ 이하)에만 있다 */
      try {
        var sc = await odcRecent("ApplyhomeInfoCmpetRtSvc/v1/getAptLttotPblancScore");
        DBG.scoreSample = sc.slice(0, 2);
        var S = {};
        sc.forEach(function (r) {
          var k = String(r.HOUSE_MANAGE_NO || ""), lo = num(r.LWET_SCORE), av = num(r.AVRG_SCORE), hi = num(r.TOP_SCORE); if (!k || !(lo > 0)) return;   /* 0점 행 = 그 거주구분에 가점 당첨자가 없음(추첨·미달 등) → 빼고 센다 */
          (S[k] = S[k] || []).push({ ty: r.HOUSE_TY, rs: String(r.RESIDE_SENM || "").replace(/지역$/, "") || "", lo: lo, avg: av, hi: hi });
        });
        R.forEach(function (x) { var L = S[x.no]; if (!L) return; x.sc = L.slice(0, 30); var here = L.filter(function (t) { return /해당/.test(t.rs); }); var B = here.length ? here : L; x.scLo = Math.min.apply(null, B.map(function (t) { return t.lo; })); x.scHi = Math.max.apply(null, B.map(function (t) { return t.hi != null ? t.hi : t.lo; })); x.scRs = here.length ? "해당지역" : (B[0].rs || ""); });
        log("당첨 가점 행 " + sc.length + " → 단지 " + Object.keys(S).length + " (경쟁률 단지와 겹침 " + R.filter(function (x) { return x.sc; }).length + ")");
      } catch (e) { log("당첨 가점 실패: " + e.message); }
      /* 4-2 보관 — API 에서 빠진 지난 단지도 '최근 경쟁률·가점'에 남게 data/subs_hist.json 에 쌓는다(최근 200) */
      try {
        var HP = path.join(ROOT, "data", "subs_hist.json"), HS = readJson(HP, { v: 1, items: {} });
        R.forEach(function (x) { if (x.nm) HS.items[x.no] = Object.assign({}, HS.items[x.no] || {}, x, { at: today }); });
        var keys = Object.keys(HS.items).sort(function (a, b) { var A = HS.items[a], B = HS.items[b]; return (B.win || B.b || B.notice || 0) - (A.win || A.b || A.notice || 0); });
        keys.slice(200).forEach(function (k) { delete HS.items[k]; });
        fs.mkdirSync(path.join(ROOT, "data"), { recursive: true }); fs.writeFileSync(HP, JSON.stringify(HS));
        var have = {}; R.forEach(function (x) { have[x.no] = 1; });
        keys.slice(0, 200).forEach(function (k) { if (!have[k] && HS.items[k] && HS.items[k].nm) R.push(HS.items[k]); });
        R.sort(function (a, b) { return (b.win || b.b || b.notice || 0) - (a.win || a.b || a.notice || 0) || b.rate - a.rate; });
      } catch (e) { log("청약 보관 실패: " + e.message); }
      out.results = R.slice(0, 80);
      log("경쟁률 행 " + cr.length + " → 단지 " + R.length + " (이름 붙은 곳 " + R.filter(function (x) { return x.nm; }).length + ")");
      var RB = {}; R.forEach(function (x) { RB[x.no] = x; });
      out.items.forEach(function (it) { var o = RB[String(it.no)]; if (o) { it.rate = o.rate; it.req = o.req; it.maxRate = o.max; it.maxTy = o.maxTy; it.rstat = o.status; it.rateHere = o.rateHere; } });
    } catch (e) { log("경쟁률 실패: " + e.message); }
    /* 5 분양가 vs 주변 실거래 (v9.29) — 추가 호출 없음. 공급 주소의 시군구 → brief_data(최근 30일 84㎡대 ㎡당 중위) · market_core(3개월 이동 중위 평당가) */
    try { subsCompare(out.items); } catch (e) { log("분양가 비교 실패: " + e.message); }
    out.items.sort(function (a, b) { return (a.b || a.notice || 0) - (b.b || b.notice || 0); });
    /* 요약(카드용) */
    var openN = out.items.filter(function (i) { return i.b && i.e && i.b <= today && today <= i.e; }).length, soonN = out.items.filter(function (i) { return i.b && i.b > today; }).length;
    out.open = out.items.filter(function (i) { return i.kind === "apt" && i.b && i.e && i.b <= today && today <= i.e; }).slice(0, 10);
    out.soon = out.items.filter(function (i) { return i.kind === "apt" && i.b && i.b > today; }).slice(0, 10);
    log("청약 공고 " + out.items.length + "건(접수 중 " + openN + " · 예정 " + soonN + ") · 경쟁률 " + out.results.length + " · 분양가 있는 단지 " + out.items.filter(function (i) { return i.pMax; }).length);
  } catch (e) { log("청약 실패: " + e.message); }
  return out;
}

var SIDO = { "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기", "강원도": "강원", "강원특별자치도": "강원", "충청북도": "충북", "충청남도": "충남", "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남", "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주" };
/* 주소 → 시군구 코드. 이름이 정확히 맞을 때만(애매하면 null — 틀린 비교를 하지 않는다) */
function subsCode(addr, byName) {
  var t = String(addr || "").trim().split(/\s+/), sd = SIDO[t[0]] || (Object.keys(SIDO).map(function (k) { return SIDO[k]; }).indexOf(t[0]) >= 0 ? t[0] : null); if (!sd) return null;
  if (sd === "세종") return byName["세종 세종특별자치시"] || null;
  var a = t[1] || "", b = t[2] || "";
  if (/[시군]$/.test(a) && /구$/.test(b) && byName[sd + " " + a + " " + b]) return byName[sd + " " + a + " " + b];
  return byName[sd + " " + a] || null;
}
function subsCompare(items) {
  var MC = readJson(path.join(ROOT, "market_core.json"), null), BD = readJson(path.join(ROOT, "brief_data.json"), null);
  if (!MC || !MC.regions) { log("분양가 비교: market_core.json 없음"); return; }
  var byName = {}; Object.keys(MC.regions).forEach(function (k) { byName[MC.regions[k].nm] = k; });
  var ym = function (i) { var m = Number(MC.m0), y = Math.floor(m / 100), mo = m % 100 - 1 + i; return (y + Math.floor(mo / 12)) * 100 + (mo % 12) + 1; };
  var n = 0, miss = [];
  items.forEach(function (it) {
    if (it.kind !== "apt" || !it.types || !it.types.length) return;
    if (/임대/.test(String(it.rent || "") + String(it.type || "") + String(it.nm || ""))) return;   /* 임대·분양전환은 분양가가 아니라서 비교하지 않는다 */
    var T = it.types.filter(function (t) { return t.top && parseFloat(t.ty) > 0; }); if (!T.length) return;
    var t84 = T.slice().sort(function (a, b) { return Math.abs(parseFloat(a.ty) - 84) - Math.abs(parseFloat(b.ty) - 84); })[0], ex = parseFloat(t84.ty);
    var code = subsCode(it.addr, byName); if (!code) { miss.push(it.nm); return; }
    var R = MC.regions[code], c = { code: code, gu: R.nm, ty: t84.ty, ex: Math.round(ex * 100) / 100, sale: t84.top, saleM2: Math.round(t84.top / ex * 10) / 10 };
    /* ① 최근 30일 같은 면적대(59·84) ㎡당 중위(brief_data · 10건 이상일 때만). 다른 면적대면 ②만 쓴다 */
    var band = ex >= 80 && ex <= 88 ? "84" : ex >= 55 && ex <= 63 ? "59" : null; c.band = band;
    var B = band && BD && BD.regions && BD.regions[code] && BD.regions[code].bands && BD.regions[code].bands[band];
    if (B && B.n >= 10 && B.pm) { c.m30 = Math.round(B.pm * 10) / 10; c.m30n = B.n; c.m30w = BD.window; }
    /* ② 3개월 이동 중위 평당가(market_core) — 마지막으로 값이 있는 달 */
    var p3 = R.s && R.s.p3 || [], nn = R.s && R.s.n || [];
    for (var i = p3.length - 1; i >= 0; i--) if (p3[i]) { var cnt = (nn[i] || 0) + (nn[i - 1] || 0) + (nn[i - 2] || 0); if (cnt >= 10) { c.p3 = p3[i]; c.p3ym = ym(i); c.p3n = cnt; } break; }
    if (c.m30 == null && c.p3 == null) { miss.push(it.nm + "(거래 적음)"); return; }
    var base = c.m30 != null ? c.m30 : c.p3 / 3.3058;   /* ㎡당(전용) */
    c.diff = Math.round((c.saleM2 / base - 1) * 1000) / 10; c.basis = c.m30 != null ? "m30" : "p3";
    /* ③ 같은 시군구 84㎡ 대장(최근 거래가) — 신축 비교용 참고 */
    var L = band && BD && BD.regions && BD.regions[code] && BD.regions[code].leaders && BD.regions[code].leaders[band];
    if (L && L[0] && L[0].p) c.lead = { apt: L[0].apt, dong: L[0].dong, by: L[0].by, ar: L[0].ar, price: L[0].p[0], d: L[0].p[1] };
    it.cmp = c; n++;
  });
  log("분양가 비교 " + n + "단지" + (miss.length ? " · 못 맞춘 곳 " + miss.length + " (" + miss.slice(0, 5).join(", ") + ")" : ""));
}
/* ── ④ 금리 비교 (v9.30) — 금감원 금융상품한눈에 오픈API (FSS_KEY). 주 1회(월요일 새벽, 또는 지난 수집이 6일 넘었을 때)만 부른다.
   주담대(아파트 담보, 은행·보험) · 전세대출(은행) · 정기예금·적금 12개월(은행·저축은행). 금융사별 최저·최고, 지난주 대비 변화. 공시 금리라 회사가 바꿔 올려야 바뀐다. */
var RATES_P = path.join(ROOT, "data", "rates_hist.json");
function rnum(v) { var n = num(v); return n != null && n > 0 && n < 30 ? n : null; }
async function fssAll(svc, grp) {
  var base = [], opt = [], page = 1, max = 1;
  do {
    var j = await getJson(FSS_BASE + svc + ".json?auth=" + encodeURIComponent(FSS) + "&topFinGrpNo=" + grp + "&pageNo=" + page);
    var r = j && j.result; if (!r || (r.err_cd && r.err_cd !== "000")) { log("금리 " + svc + "/" + grp + ": " + JSON.stringify(r || j).slice(0, 160)); DBG["fss_" + svc + grp] = r || j; break; }
    base = base.concat(r.baseList || []); opt = opt.concat(r.optionList || []); max = Number(r.max_page_no) || 1; page++;
  } while (page <= max && page <= 15);
  DBG["fssPages_" + svc + grp] = { pages: page - 1, max: max, base: base.length, opt: opt.length };
  return { base: base, opt: opt };
}
function fssByCo(D, pick) {   /* pick(option, base) → {lo, hi} 또는 null. 금융사별로 모은다 */
  var B = {}; D.base.forEach(function (b) { B[b.fin_co_no + "|" + b.fin_prdt_cd] = b; });
  var C = {};
  D.opt.forEach(function (o) {
    var b = B[o.fin_co_no + "|" + o.fin_prdt_cd]; if (!b) return; var v = pick(o, b); if (!v) return;
    var k = String(o.fin_co_no), c = C[k] || (C[k] = { co: b.kor_co_nm, no: k, lo: null, hi: null, n: 0, prd: {}, dcls: b.dcls_month });
    if (v.lo != null && (c.lo == null || v.lo < c.lo)) { c.lo = v.lo; c.loPrd = b.fin_prdt_nm; c.loT = v.t || ""; }
    if (v.hi != null && (c.hi == null || v.hi > c.hi)) { c.hi = v.hi; c.hiPrd = b.fin_prdt_nm; c.hiT = v.t || ""; }
    c.prd[b.fin_prdt_cd] = 1; if (b.dcls_month > (c.dcls || "")) c.dcls = b.dcls_month;
  });
  return Object.keys(C).map(function (k) { var c = C[k]; c.n = Object.keys(c.prd).length; delete c.prd; return c; }).filter(function (c) { return c.lo != null || c.hi != null; });
}
async function rates() {
  if (!FSS) { log("FSS_KEY 없음 → 금리 비교 건너뜀"); return null; }
  var H = readJson(RATES_P, { v: 1, snaps: [] }), today = kst(), last = H.snaps.length ? H.snaps[H.snaps.length - 1] : null;
  var dDiff = function (a, b) { var f = function (n) { return Date.UTC(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100); }; return Math.round((f(a) - f(b)) / 86400000); };
  var wd = new Date(Date.now() + 9 * 3600000).getUTCDay();
  var stale = last && !(last.v >= 2);   /* v9.30.1 이전 수집분(5쪽 한도로 잘렸을 수 있음)은 한 번 다시 받는다 */
  if (last && !stale && last.at !== today && !(wd === 1 || dDiff(today, last.at) >= 7) && !process.env.RATES_FORCE) { log("금리 비교: 이번 주 수집분 유지(" + last.at + ")"); return rSummary(H); }
  if (last && !stale && last.at === today && !process.env.RATES_FORCE) return rSummary(H);
  var snap = { at: today, v: 2, src: "금융감독원 금융상품한눈에" };
  try {
    var mg = [await fssAll("mortgageLoanProductsSearch", "020000"), await fssAll("mortgageLoanProductsSearch", "050000")];
    DBG.fssMortgageSample = { base: mg[0].base.slice(0, 1), opt: mg[0].opt.slice(0, 2) };
    var apt = function (o) { return /아파트/.test(o.mrtg_type_nm || "") && !/외/.test(o.mrtg_type_nm || "") ? { lo: rnum(o.lend_rate_min), hi: rnum(o.lend_rate_max), t: (o.lend_rate_type_nm || "") + (o.rpay_type_nm ? "·" + o.rpay_type_nm : "") } : null; };
    snap.mortgage = fssByCo(mg[0], apt).map(function (c) { c.grp = "은행"; return c; }).concat(fssByCo(mg[1], apt).map(function (c) { c.grp = "보험"; return c; }));
    var rh = await fssAll("rentHouseLoanProductsSearch", "020000");
    DBG.fssRentSample = { base: rh.base.slice(0, 1), opt: rh.opt.slice(0, 2) };
    snap.jeonse = fssByCo(rh, function (o) { return { lo: rnum(o.lend_rate_min), hi: rnum(o.lend_rate_max), t: (o.lend_rate_type_nm || "") + (o.rpay_type_nm ? "·" + o.rpay_type_nm : "") }; }).map(function (c) { c.grp = "은행"; return c; });
    var dep = function (o) { return Number(o.save_trm) === 12 ? { lo: rnum(o.intr_rate), hi: rnum(o.intr_rate2) || rnum(o.intr_rate), t: o.intr_rate_type_nm || "" } : null; };
    var dp = [await fssAll("depositProductsSearch", "020000"), await fssAll("depositProductsSearch", "030300")];
    DBG.fssDepositSample = { base: dp[0].base.slice(0, 1), opt: dp[0].opt.slice(0, 2) };
    snap.deposit = fssByCo(dp[0], dep).map(function (c) { c.grp = "은행"; return c; }).concat(fssByCo(dp[1], dep).map(function (c) { c.grp = "저축은행"; return c; }));
    var sv = [await fssAll("savingProductsSearch", "020000"), await fssAll("savingProductsSearch", "030300")];
    snap.saving = fssByCo(sv[0], dep).map(function (c) { c.grp = "은행"; return c; }).concat(fssByCo(sv[1], dep).map(function (c) { c.grp = "저축은행"; return c; }));
  } catch (e) { log("금리 수집 실패: " + e.message); }
  var ok = ["mortgage", "jeonse", "deposit", "saving"].filter(function (k) { return snap[k] && snap[k].length; });
  log("금리 비교: " + ok.map(function (k) { return k + " " + snap[k].length + "곳"; }).join(" · "));
  if (!ok.length) return last ? rSummary(H) : null;   /* 실패하면 지난 수집분을 그대로 쓴다 */
  H.snaps = H.snaps.filter(function (x) { return x.at !== today; }); H.snaps.push(snap); H.snaps = H.snaps.slice(-13);
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true }); fs.writeFileSync(RATES_P, JSON.stringify(H));
  return rSummary(H);
}
/* 최신 수집 + 6일 이상 앞선 수집과 금융사별 비교 → 앱·카드용 요약 */
function rSummary(H) {
  var S = H.snaps, cur = S[S.length - 1]; if (!cur) return null;
  var prev = null; for (var i = S.length - 2; i >= 0; i--) { if ((S[i].v || 1) !== (cur.v || 1)) continue;   /* 수집 방식이 다른 회차끼리는 비교하지 않는다(잘못된 변화 방지) */ var a = cur.at, b = S[i].at, d = (Date.UTC(Math.floor(a / 10000), Math.floor(a / 100) % 100 - 1, a % 100) - Date.UTC(Math.floor(b / 10000), Math.floor(b / 100) % 100 - 1, b % 100)) / 86400000; if (d >= 6) { prev = S[i]; break; } }
  var out = { asOf: cur.at, prevAt: prev ? prev.at : null, src: cur.src };
  ["mortgage", "jeonse", "deposit", "saving"].forEach(function (k) {
    var L = (cur[k] || []).map(function (c) { var o = Object.assign({}, c); return o; }), P = {}; ((prev && prev[k]) || []).forEach(function (c) { P[c.no] = c; });
    L.forEach(function (c) { var p = P[c.no]; if (!p) return; if (c.lo != null && p.lo != null) c.dLo = Math.round((c.lo - p.lo) * 100) / 100; if (c.hi != null && p.hi != null) c.dHi = Math.round((c.hi - p.hi) * 100) / 100; });
    out[k] = L;
  });
  return out;
}
if (require.main !== module) module.exports = { subsCompare: subsCompare, subsCode: subsCode, rSummary: rSummary, fssByCo: fssByCo };

if (require.main === module) (async function () {
  var out = { v: 1, builtAt: new Date().toISOString(), asOf: kst(), errors: [] };
  async function step(nm, fn) { try { var r = await fn(); if (r) out[nm] = r; log(nm + (r ? " OK" : " 없음")); } catch (e) { out.errors.push(nm + ": " + e.message); log(nm + " 실패: " + e.message); } }
  await step("unsold", unsold);
  await step("index", priceIndex);
  await step("weekly", weekly);
  await step("subs", subs);
  await step("rates", rates);
  out.calls = CALLS;
  fs.writeFileSync(OUT_P, JSON.stringify(out));
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(CODES_P, JSON.stringify(CODES, null, 1));
  DBG.errors = out.errors; fs.writeFileSync(DEBUG_P, JSON.stringify(DBG, null, 1));
  log("완료 — 호출 " + CALLS + "회 · 오류 " + out.errors.length + "건");
})().catch(function (e) { console.error(e); process.exit(1); });
