/* scripts/school_build.js — 학교알리미 공시자료(CSV)를 학군 화면용 school_data.json 으로 바꾼다 (v9.0)
   입력: data/school/ 폴더의 CSV (학교알리미 schoolinfo.go.kr → 공시자료 다운로드 → 엑셀을 CSV 로 저장해 올린 것)
     · 파일 이름에 "성취" 또는 "achieve" 가 들어가면  교과별(학년별) 학업성취 사항  (중·고 공통: 과목별 평균·성취도 A~E 비율)
     · 파일 이름에 "진로" 또는 "career"  가 들어가면  졸업생의 진로 현황              (중학교: 과학고·외고·국제고·자사고·영재학교 진학자 수)
     · 파일 이름에 "학교" 또는 "school"  가 들어가면  학교 기본정보                    (주소 → 동 이름, 학생 수)  — 없어도 됨(성취 파일의 주소/지역으로 대신)
   열 이름은 다운로드 시점마다 조금씩 달라서 '학교명' '평균' '과목' 처럼 핵심 낱말로 찾는다. UTF-8 · EUC-KR(엑셀 기본) 둘 다 읽는다.
   ※ 국가수준 학업성취도평가의 학교별 결과는 2017년 이후 공개되지 않는다. 여기 '평균' 은 학교알리미에 공시된 학교 내신(지필+수행) 평균이라
      학교끼리 시험 난이도가 달라 절대 비교는 어렵다. 그래서 A 비율·특목고 진학률을 함께 둔다. 앱 설명에도 같은 문장을 적는다. */
/* v9.1 학교알리미 OpenAPI(무료 인증키, 환경변수 SCHOOLINFO_API_KEY): 학교 기본정보(주소·좌표)와 학년별 학생수·학급수는 자동으로 받는다.
   교과별 학업성취 사항·졸업생의 진로 현황은 OpenAPI 미제공 항목(화면은 캡차 보호)이라 CSV 로만 들어온다 — 둘을 학교코드/학교명으로 합친다. */
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, ".."), DIR = path.join(ROOT, "data", "school"), OUT = path.join(ROOT, "school_data.json");
var API_KEY = (process.env.SCHOOLINFO_API_KEY || "").trim(), API_BASE = process.env.SCHOOLINFO_BASE || "https://www.schoolinfo.go.kr/openApi.do";
var API_SIDO = { "11": "서울", "26": "부산", "27": "대구", "28": "인천", "29": "광주", "30": "대전", "31": "울산", "36": "세종", "41": "경기", "43": "충북", "44": "충남", "47": "경북", "48": "경남", "50": "제주", "51": "강원", "52": "전북", "46": "전남" };
var API_SGG = { "36": "36110" };
async function apiCall(item, kind, sido, year) {
  var q = { apiKey: API_KEY, apiType: item, pbanYr: year, schulKndCode: kind, sidoCode: sido, sggCode: API_SGG[sido] || sido + "000" };
  var url = API_BASE + "?" + Object.keys(q).map(function (k) { return k + "=" + encodeURIComponent(q[k]); }).join("&");
  for (var i = 0; i < 3; i++) {
    try {
      var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 120000);
      var r = await fetch(url, { signal: ac.signal }); clearTimeout(t);
      var d = await r.json();
      if (d.resultCode === "success") return d.list || [];
      if (/공시되지 않은|존재하지/.test(d.resultMsg || "")) return null;
      throw new Error(d.resultMsg || "응답 오류");
    } catch (e) { if (i === 2) { console.warn("  ! apiType=" + item + " kind=" + kind + " sido=" + sido + " " + year + ": " + e.message); return []; } await new Promise(function (res) { setTimeout(res, 1500 * (i + 1)); }); }
  }
}
async function apiFetch(item, kind, sido) {
  var y = new Date().getFullYear();
  for (var k = 0; k < 3; k++) { var rows = await apiCall(item, kind, sido, y - k); if (rows === null) continue; return { year: y - k, rows: rows }; }
  return { year: null, rows: [] };
}
/* 학교 기본정보(0) + 학년별 학생수(09) → { 코드: {n, k, addr, region, lat, lng, st, cls, per} } */
async function apiSchools(log) {
  if (!API_KEY) { log.push("SCHOOLINFO_API_KEY 없음 — 학교알리미 OpenAPI 는 건너뜀(주소·학생수는 CSV 의 지역 글자로만)"); return {}; }
  var out = {}, calls = 0, years = {};
  var sidos = Object.keys(API_SIDO), kinds = [["03", "중"], ["04", "고"]];
  for (var i = 0; i < sidos.length; i++) for (var j = 0; j < kinds.length; j++) {
    var base = await apiFetch("0", kinds[j][0], sidos[i]); calls++;
    var stu = await apiFetch("09", kinds[j][0], sidos[i]); calls++;
    if (base.year) years["기본정보"] = base.year; if (stu.year) years["학생수"] = stu.year;
    base.rows.forEach(function (r) { if (!r.SCHUL_CODE || r.ABSCH_YN === "Y" || r.CLOSE_YN === "Y") return; out[r.SCHUL_CODE] = { n: r.SCHUL_NM, k: kinds[j][1], addr: r.SCHUL_RDNMA || r.ADRES_BRKDN || "", region: r.ADRCD_NM || "", lat: num(r.LTTUD), lng: num(r.LGTUD) }; });
    stu.rows.forEach(function (r) { var o = out[r.SCHUL_CODE]; if (!o) return; o.st = num(r.COL_S_SUM); o.cls = num(r.COL_C_SUM); o.per = num(r.COL_SUM); });
    if (calls % 8 === 0) await new Promise(function (res) { setTimeout(res, 1200); });     /* 분당 60회 제한 */
  }
  log.push("학교알리미 OpenAPI: 호출 " + calls + "회 · 학교 " + Object.keys(out).length + "곳 · 연도 " + JSON.stringify(years));
  return out;
}
function readCsv(p) {
  var buf = fs.readFileSync(p), txt;
  try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder("euc-kr").decode(buf); }
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  var rows = [], row = [], cell = "", q = false;
  for (var i = 0; i < txt.length; i++) {
    var ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
}
/* 머리글 행 찾기: '학교명' 이 들어 있는 첫 행 */
function table(rows) {
  var hi = rows.findIndex(function (r) { return r.some(function (c) { return /학교명|학교 명/.test(c); }); });
  if (hi < 0) return null;
  var head = rows[hi].map(function (c) { return String(c).replace(/\s+/g, ""); });
  return { head: head, body: rows.slice(hi + 1).map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = (r[i] == null ? "" : String(r[i])).trim(); }); return o; }) };
}
function col(head, res) { for (var i = 0; i < res.length; i++) { var h = head.find(function (x) { return res[i].test(x); }); if (h) return h; } return null; }
function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/,/g, "").replace(/%/g, "")); return isFinite(n) ? n : null; }
var SIDO = { "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기", "강원특별자치도": "강원", "강원도": "강원", "충청북도": "충북", "충청남도": "충남", "전북특별자치도": "전북", "전라북도": "전북", "전라남도": "전남", "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주" };
var MC = (function () { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "market_core.json"), "utf8")); } catch (e) { return null; } })();
var REG = MC ? Object.keys(MC.regions).map(function (c) { return { c: c, nm: MC.regions[c].nm }; }) : [];
/* "서울특별시 강남구 대치동 …" → { lawd, dong } */
function place(addr, region) {
  var s = String(addr || region || "").replace(/\s+/g, " ").trim(); if (!s) return {};
  var parts = s.split(" "), sd = SIDO[parts[0]] || parts[0].replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, "");
  var best = null;
  REG.forEach(function (r) {
    if (r.nm.indexOf(sd) !== 0) return;
    var tail = r.nm.slice(sd.length).trim().split(" ");           /* "수원시 영통구" → ["수원시","영통구"] */
    if (tail.every(function (t) { return s.indexOf(t) >= 0; })) { if (!best || tail.length > best.n) best = { c: r.c, n: tail.length }; }
  });
  var m = s.match(/\s([가-힣0-9]+(?:동|읍|면))(?:\s|$|\d)/), dong = m ? m[1].replace(/\d+$/, "") : "";
  return { lawd: best ? best.c : null, dong: dong, sido: sd };
}
async function main() {
  var files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(function (f) { return /\.csv$/i.test(f); }) : [];
  if (!files.length && !API_KEY) { console.log("data/school 에 CSV 가 없고 SCHOOLINFO_API_KEY 도 없습니다 — 건너뜁니다."); process.exit(0); }
  var S = {}, log = [];
  var API = await apiSchools(log), byName = {};
  Object.keys(API).forEach(function (c) { var a = API[c]; byName[a.n + "|" + (a.region || "").split(" ").slice(-1)[0]] = c; byName[a.n] = byName[a.n] || c; });
  function sch(code, name) {
    var k = code || byName[name] || name;
    if (!S[k]) S[k] = { c: code || byName[name] || "", n: name, k: /고등학교$|고$/.test(name) ? "고" : /중학교$|중$/.test(name) ? "중" : "", a: {}, A: {}, s: null };
    return S[k];
  }
  var SUBJ = { "국어": "ko", "영어": "en", "수학": "ma" };
  files.forEach(function (f) {
    var T = table(readCsv(path.join(DIR, f))); if (!T) { log.push(f + ": 머리글(학교명) 못 찾음"); return; }
    var H = T.head, cName = col(H, [/^학교명$/, /학교명/]), cCode = col(H, [/학교코드|정보공시학교코드/]), cAddr = col(H, [/주소|소재지/]), cReg = col(H, [/^지역$/, /시군구|행정구역/]), cKind = col(H, [/학교급/]);
    if (/성취|achieve/i.test(f)) {
      var cGr = col(H, [/학년/]), cSem = col(H, [/학기/]), cSub = col(H, [/^과목$/, /교과/]), cAvg = col(H, [/^평균$/, /평균/]), cA = col(H, [/^A$/, /A\(?비율|A등급|성취도A|우수/]);
      if (!cName || !cSub || !cAvg) { log.push(f + ": 필요한 열(학교명·과목·평균) 못 찾음 — 머리글: " + H.slice(0, 12).join("|")); return; }
      var n = 0, byKey = {};
      T.body.forEach(function (r) {
        var nm = r[cName]; if (!nm) return;
        var sub = String(r[cSub] || "").replace(/\s/g, ""), sk = null; Object.keys(SUBJ).forEach(function (s0) { if (sub.indexOf(s0) === 0) sk = SUBJ[s0]; }); if (!sk) return;
        var avg = num(r[cAvg]); if (avg == null) return;
        var o = sch(r[cCode], nm); if (cKind && r[cKind]) o.k = /고/.test(r[cKind]) ? "고" : /중/.test(r[cKind]) ? "중" : o.k;
        if (!o.pl && (cAddr || cReg)) o.pl = place(cAddr ? r[cAddr] : "", cReg ? r[cReg] : "");
        var gr = num(cGr ? r[cGr] : null) || 0, sem = num(cSem ? r[cSem] : null) || 0, key = o.n + "|" + sk, prev = byKey[key];
        if (prev && (prev.gr > gr || (prev.gr === gr && prev.sem > sem))) return;        /* 가장 높은 학년·최근 학기만 */
        byKey[key] = { gr: gr, sem: sem }; o.a[sk] = avg; o.A[sk] = num(cA ? r[cA] : null); o.gr = gr; o.sem = sem; n++;
      });
      log.push(f + ": 성취 " + n + "행 (" + (cA ? "A 비율 포함" : "A 비율 열 없음") + ")");
    } else if (/진로|career/i.test(f)) {
      var cGrad = col(H, [/졸업자|졸업생수|졸업생\(?계/]), cSci = col(H, [/과학고/]), cFl = col(H, [/외국어고|외고|국제고/]), cAr = col(H, [/자율형사립|자사고|자율고/]), cGift = col(H, [/영재/]);
      if (!cName || !cGrad) { log.push(f + ": 필요한 열(학교명·졸업자) 못 찾음 — 머리글: " + H.slice(0, 12).join("|")); return; }
      var n2 = 0;
      T.body.forEach(function (r) {
        var nm = r[cName], grad = num(r[cGrad]); if (!nm || !grad) return;
        var o = sch(r[cCode], nm); if (!o.pl && (cAddr || cReg)) o.pl = place(cAddr ? r[cAddr] : "", cReg ? r[cReg] : "");
        var fl = 0; H.filter(function (h) { return /외국어고|외고|국제고/.test(h); }).forEach(function (h) { fl += num(r[h]) || 0; });
        o.s = { grad: grad, sci: num(cSci ? r[cSci] : null) || 0, fl: fl, ar: num(cAr ? r[cAr] : null) || 0, gift: num(cGift ? r[cGift] : null) || 0 }; n2++;
      });
      log.push(f + ": 진로 " + n2 + "행");
    } else if (/학교|school/i.test(f)) {
      var cStu = col(H, [/학생수|학생\s*수|전체학생/]);
      var n3 = 0;
      T.body.forEach(function (r) { var nm = r[cName]; if (!nm) return; var o = sch(r[cCode], nm); if (cAddr || cReg) o.pl = place(cAddr ? r[cAddr] : "", cReg ? r[cReg] : ""); if (cStu) o.st = num(r[cStu]); n3++; });
      log.push(f + ": 기본정보 " + n3 + "행");
    } else log.push(f + ": 파일 이름으로 종류를 알 수 없음(성취/진로/학교 중 하나를 이름에 넣어 주세요)");
  });
  /* OpenAPI 학교를 합친다 — CSV 에 없는 학교도 주소·학생수만으로 들어간다(동네 상세용) */
  Object.keys(API).forEach(function (c) {
    var a = API[c], o = S[c] || (S[c] = { c: c, n: a.n, k: a.k, a: {}, A: {}, s: null });
    if (!o.k) o.k = a.k;
    var pl = place(a.addr, a.region); if (pl.lawd || !o.pl) o.pl = pl;
    if (a.st) o.st = a.st; if (a.cls) o.cls = a.cls; if (a.per) o.per = a.per; if (a.lat) { o.lat = a.lat; o.lng = a.lng; }
  });
  var out = { v: 1, built: new Date().toISOString().slice(0, 10), src: "학교알리미 공시자료(schoolinfo.go.kr)" + (files.length ? " · " + files.join(", ") : "") + (API_KEY ? " · OpenAPI 기본정보·학생수" : ""), schools: [] }, miss = 0;
  Object.keys(S).forEach(function (k) {
    var o = S[k], pl = o.pl || {}; if (!pl.lawd) miss++;
    var ks = Object.keys(o.a);
    var rec = { c: o.c, n: o.n, k: o.k, l: pl.lawd || null, d: pl.dong || "", sd: pl.sido || "" };
    if (ks.length) { rec.a = o.a; rec.A = o.A; rec.gr = o.gr; rec.sem = o.sem; rec.avg = Math.round(ks.reduce(function (s, x) { return s + o.a[x]; }, 0) / ks.length * 10) / 10; var As = ks.map(function (x) { return o.A[x]; }).filter(function (v) { return v != null; }); if (As.length) rec.Aavg = Math.round(As.reduce(function (s, v) { return s + v; }, 0) / As.length * 10) / 10; }
    if (o.s) { rec.s = o.s; rec.sp = Math.round((o.s.sci + o.s.fl + o.s.gift) / o.s.grad * 1000) / 10; rec.spA = Math.round((o.s.sci + o.s.fl + o.s.gift + o.s.ar) / o.s.grad * 1000) / 10; }
    if (o.st) rec.st = o.st; if (o.cls) rec.cls = o.cls; if (o.per) rec.per = o.per; if (o.lat) { rec.lat = o.lat; rec.lng = o.lng; }
    if (rec.avg != null || rec.sp != null || rec.st != null) out.schools.push(rec);
  });
  out.schools.sort(function (a, b) { return (b.avg || 0) - (a.avg || 0); });
  out.n = { mid: out.schools.filter(function (s) { return s.k === "중"; }).length, high: out.schools.filter(function (s) { return s.k === "고"; }).length, noRegion: miss,
    withAch: out.schools.filter(function (s) { return s.avg != null; }).length, withCareer: out.schools.filter(function (s) { return s.sp != null; }).length, withStu: out.schools.filter(function (s) { return s.st != null; }).length };
  out.log = log;
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(log.join("\n")); console.log("school_data.json — 중 " + out.n.mid + " · 고 " + out.n.high + " · 지역 못 찾음 " + miss + " · " + Math.round(fs.statSync(OUT).size / 1024) + "KB");
}
main().catch(function (e) { console.error(e); process.exit(1); });
