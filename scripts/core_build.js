/* scripts/core_build.js — 월별 저장본(market_core.json)을 자동으로 잇는다 (v7.5)
   · 과거분: data/market_core_base.json (예전에 수집기로 만든 market_core.json 을 그대로 둔 것. 없으면 지금 market_core.json 을 복사해 만든다)
   · 그 뒤 달: data/monthly/{lawd}.json (brief_build.js 가 매일 쌓는 월별 집계 장부) 로 이어 붙인다.
   · 시·도·전국 묶음은 옛 규칙대로 개별 거래를 다시 모아 중위를 낸다(raw 가 있는 달). 확정된 묶음 달은 data/monthly/_groups.json 에 남긴다.
   · 최근 두 달은 신고가 덜 끝나 '잠정'(prov)으로 표시하고 매일 다시 계산한다.
   결과 market_core.json 에는 auto:true 가 붙어, 앱과 brief_build 가 '자동 봉인본'임을 안다. */
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var BASE_P = path.join(ROOT, "data", "market_core_base.json"), OUT_P = path.join(ROOT, "market_core.json");
var MO_DIR = path.join(ROOT, "data", "monthly"), GRP_P = path.join(MO_DIR, "_groups.json");
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; } }
function med3(a) { if (!a || a.length < 3) return null; var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length, h = n >> 1; return n % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2); }
function ymIdx(ym) { return Math.floor(ym / 100) * 12 + (ym % 100) - 1; }
function idxYm(i) { return Math.floor(i / 12) * 100 + (i % 12) + 1; }
function kstYm() { var d = new Date(Date.now() + 9 * 3600000); return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1; }

var base = readJson(BASE_P);
if (!base) {
  var cur = readJson(OUT_P);
  if (!cur || cur.auto) { console.error("data/market_core_base.json 이 없고, market_core.json 도 과거분으로 쓸 수 없습니다. 예전 market_core.json 을 data/market_core_base.json 으로 올려 주세요."); process.exit(2); }
  fs.mkdirSync(path.dirname(BASE_P), { recursive: true });
  fs.writeFileSync(BASE_P, JSON.stringify(cur));
  base = cur;
  console.log("과거분 보관: market_core.json → data/market_core_base.json (" + base.m0 + " ~ " + base.months + "개월)");
}
var m0i = ymIdx(Number(base.m0)), baseLast = m0i + base.months - 1, nowI = ymIdx(kstYm());
if (!fs.existsSync(MO_DIR)) { console.log("월별 장부(data/monthly)가 아직 없습니다 — 과거분 그대로 둡니다."); process.exit(0); }

/* 장부 읽기 */
var ledger = {}, lastI = baseLast;
fs.readdirSync(MO_DIR).forEach(function (f) {
  if (!/^\d{5}\.json$/.test(f)) return;
  var L = readJson(path.join(MO_DIR, f)); if (!L || !L.m) return;
  ledger[f.slice(0, 5)] = L;
  Object.keys(L.m).forEach(function (ym) { lastI = Math.max(lastI, ymIdx(Number(ym))); });
});
lastI = Math.min(lastI, nowI);
var M = lastI - m0i + 1, added = lastI - baseLast;
if (added <= 0) { console.log("장부에 저장본 뒤 달이 없습니다 (저장본 " + idxYm(baseLast) + "까지)."); }
var groupsLedger = readJson(GRP_P) || { v: 1, m: {} };
/* v9.5: 경계 2개월의 묶음 p3 가 1개월 중위로 봉인돼 있었다 → 한 번 지우고 다시 계산 */
if (!groupsLedger.v95) {
  var fixYms = [idxYm(baseLast + 1), idxYm(baseLast + 2)];
  Object.keys(groupsLedger.m).forEach(function (g) { fixYms.forEach(function (ym) { if (groupsLedger.m[g][ym]) delete groupsLedger.m[g][ym]; }); });
  groupsLedger.v95 = true;
  console.log("경계 달 묶음 값 다시 계산: " + fixYms.join(", "));
}

/* p3: 그 달과 앞 두 달의 평당가 raw 를 모아 중위.
   v9.5: 앞 달이 저장본 달(raw 없음)이면 '1개월 중위'로 떨어져 경계에서 가짜 급락이 생겼다 →
         3개월 raw 가 다 있으면 합쳐서 중위, 하나라도 없으면 세 달 월 중위값(p)을 건수로 가중 평균한다(근사, 경계 2개월만 해당). */
function p3Of(rawByYm, ymI, monthly) {
  var pool = [], full = true;
  for (var k = 0; k < 3; k++) { var r = rawByYm[idxYm(ymI - k)]; if (r && r.p && r.p.length) pool = pool.concat(r.p); else full = false; }
  if (full && pool.length) return med3(pool);
  if (!monthly) return pool.length ? med3(pool) : null;
  var sw = 0, sv = 0;
  for (var k2 = 0; k2 < 3; k2++) { var mm = monthly(ymI - k2); if (mm && mm.p != null && mm.n) { sw += mm.n; sv += mm.p * mm.n; } }
  return sw ? Math.round(sv / sw) : (pool.length ? med3(pool) : null);
}
function extend(series, M0, fill) {           /* {o, 배열들} 을 M 길이까지 늘린다 */
  var out = {}; Object.keys(series).forEach(function (k) {
    if (k === "o") { out.o = series.o; return; }
    var arr = series[k].slice();
    while (series.o + arr.length < M) arr.push(fill(k, series.o + arr.length));
    out[k] = arr;
  });
  return out;
}
var regions = {}, prov = [], pool = {};        /* pool[sd][ym] = {n, p[], a84[], a59[], rn, j, d84[], d59[]} */
for (var i = baseLast + 1; i <= lastI; i++) prov.push(idxYm(i));
var finalSet = {};
Object.keys(base.regions).forEach(function (code) {
  var b = base.regions[code], L = ledger[code], sd = b.sd, rec = { nm: b.nm, sd: sd };
  function cell(ym) { return L && L.m[ym] ? L.m[ym] : null; }
  var rawByYm = (L && L.raw) || {};
  if (b.s) rec.s = extend(b.s, M, function (k, idx) {
    var ym = idxYm(m0i + idx), c = cell(ym);
    if (!c || c.n == null) return k === "n" ? 0 : null;
    if (k === "n") return c.n; if (k === "p") return c.p; if (k === "a84") return c.a84; if (k === "a59") return c.a59;
    if (k === "p3") return c.p3 != null ? c.p3 : p3Of(rawByYm, m0i + idx, function (ii) {
      if (ii <= baseLast) { var j = ii - m0i - b.s.o; return j >= 0 ? { p: b.s.p[j], n: b.s.n[j] } : null; }
      var cc = cell(idxYm(ii)); return cc ? { p: cc.p, n: cc.n } : null;
    });
    return null;
  });
  if (b.r) rec.r = extend(b.r, M, function (k, idx) {
    var ym = idxYm(m0i + idx), c = cell(ym);
    if (!c || c.rn == null) return k === "n" || k === "j" ? 0 : null;
    if (k === "n") return c.rn; if (k === "j") return c.j; if (k === "d84") return c.d84; if (k === "d59") return c.d59;
    return null;
  });
  regions[code] = rec;
  /* 묶음용 풀 */
  for (var ii = baseLast + 1; ii <= lastI; ii++) {
    var ym = idxYm(ii), c2 = cell(ym), r2 = rawByYm[ym];
    if (!c2) continue;
    ["전국", sd].forEach(function (g) {
      if (!g) return;
      var P = pool[g] || (pool[g] = {}), q = P[ym] || (P[ym] = { n: 0, p: [], a84: [], a59: [], rn: 0, j: 0, d84: [], d59: [], hasS: false, hasR: false });
      if (c2.n != null) { q.n += c2.n; q.hasS = true; if (r2) { q.p = q.p.concat(r2.p || []); q.a84 = q.a84.concat(r2.a84 || []); q.a59 = q.a59.concat(r2.a59 || []); } }
      if (c2.rn != null) { q.rn += c2.rn; q.j += c2.j; q.hasR = true; if (r2) { q.d84 = q.d84.concat(r2.d84 || []); q.d59 = q.d59.concat(r2.d59 || []); } }
    });
    if (c2.final) finalSet[ym] = 1;
  }
});
/* 묶음 — 확정 달은 장부에 남기고, 그 뒤부터는 장부 값 우선 */
var groups = {};
Object.keys(base.groups).forEach(function (g) {
  var b = base.groups[g], rec = { nm: b.nm }, P = pool[g] || {};
  function gm(ym) { return (groupsLedger.m[g] && groupsLedger.m[g][ym]) || null; }
  function compute(ym) {
    var q = P[ym]; if (!q) return null;
    var o = { n: q.hasS ? q.n : null, p: med3(q.p), a84: med3(q.a84), a59: med3(q.a59), rn: q.hasR ? q.rn : null, j: q.hasR ? q.j : null, d84: med3(q.d84), d59: med3(q.d59) };
    var pool3 = [], full3 = true;
    for (var k = 0; k < 3; k++) { var qq = P[idxYm(ymIdx(ym) - k)]; if (qq && qq.p.length) pool3 = pool3.concat(qq.p); else full3 = false; }
    if (full3 && pool3.length) o.p3 = med3(pool3);
    else {   /* v9.5 경계 달: 저장본 달의 월 중위값과 건수로 가중 평균 */
      var sw = 0, sv = 0;
      for (var k2 = 0; k2 < 3; k2++) {
        var ii = ymIdx(ym) - k2, pv = null, nv = null;
        if (ii <= baseLast) { var j = ii - m0i - b.s.o; if (j >= 0) { pv = b.s.p[j]; nv = b.s.n[j]; } }
        else if (k2 === 0) { pv = o.p; nv = o.n; }
        else { var q2 = P[idxYm(ii)]; if (q2) { pv = med3(q2.p); nv = q2.n; } }
        if (pv != null && nv) { sw += nv; sv += pv * nv; }
      }
      o.p3 = sw ? Math.round(sv / sw) : (pool3.length ? med3(pool3) : null);
    }
    return o;
  }
  var vals = {};
  for (var ii = baseLast + 1; ii <= lastI; ii++) {
    var ym = idxYm(ii), v = gm(ym) || compute(ym);
    if (v) { vals[ym] = v; if (finalSet[ym] && !gm(ym)) { groupsLedger.m[g] = groupsLedger.m[g] || {}; groupsLedger.m[g][ym] = v; } }
  }
  if (b.s) rec.s = extend(b.s, M, function (k, idx) { var v = vals[idxYm(m0i + idx)]; if (!v || v.n == null) return k === "n" ? 0 : null; return k === "n" ? v.n : v[k]; });
  if (b.r) rec.r = extend(b.r, M, function (k, idx) { var v = vals[idxYm(m0i + idx)]; if (!v || v.rn == null) return k === "n" || k === "j" ? 0 : null; return k === "n" ? v.rn : v[k]; });
  groups[g] = rec;
});
/* 잠정 달 = 아직 final 아닌 뒤쪽 달 */
prov = prov.filter(function (ym) { return !finalSet[ym]; });

/* 규칙 일치 점검 — 저장본 마지막 달을 장부도 갖고 있으면 평당가 중위를 견준다 */
var chk = [], lastYm = idxYm(baseLast);
Object.keys(ledger).forEach(function (code) {
  var c = ledger[code].m[lastYm], b = base.regions[code];
  if (!c || !b || !b.s || c.p == null) return;
  var bp = b.s.p[baseLast - m0i - b.s.o];
  if (bp) chk.push(Math.abs(c.p / bp - 1));
});
if (chk.length) { chk.sort(function (a, b) { return a - b; }); console.log("규칙 일치 점검(" + lastYm + " 평당가 중위, " + chk.length + "곳): 중간 차이 " + (chk[chk.length >> 1] * 100).toFixed(1) + "% · 최대 " + (chk[chk.length - 1] * 100).toFixed(1) + "%"); }

var out = { v: 1, built: new Date().toISOString().slice(0, 10), src: (base.src || "국토부 실거래") + " + 자동 봉인(brief_build 월별 장부)", rule: base.rule, m0: base.m0, months: M,
  auto: true, baseLast: lastYm, prov: prov, stat: base.stat, regions: regions, groups: groups };
fs.writeFileSync(OUT_P, JSON.stringify(out));
fs.writeFileSync(GRP_P, JSON.stringify(groupsLedger));
console.log("market_core.json — " + base.m0 + " ~ " + idxYm(lastI) + " (" + M + "개월, 저장본 " + lastYm + " + 자동 " + added + "개월, 잠정 " + prov.join("·") + ") · " + Math.round(fs.statSync(OUT_P).size / 1024) + "KB");


/* ══ v13.0 대장 단지 vs 전체 단지 — 연도별 84㎡·59㎡ 중위가를 같은 저장본(trades/{시군구}.json)에서 뽑아 data/monthly/_lead.json 에 쓴다 ══
   대장 = brief_build 의 대장아파트(면적대마다 3곳: 500세대 이상·준공 20년 안을 먼저, 그 안에서 최근 거래 ㎡당가 높은 순). 지금의 대장 명단을 과거 연도에도 그대로 적용한다
   (새 단지는 준공 뒤 해부터 값이 생김 — 해마다 값이 있는 대장 수를 ln 에 적는다).
   전체 = 그 시군구 모든 단지의 그 면적대 연 중위가를 거래 건수로 가중한 중위. 대장·전체가 같은 자료·같은 규칙이라 그대로 견줄 수 있다.
   실거래 호출 없음(파일만 읽음). 실패해도 본 작업(market_core.json)에는 영향이 없다. */
(function leadBuild() {
  try {
    var B = readJson(path.join(ROOT, "brief_data.json")), TR = path.join(ROOT, "trades"); if (!B || !B.regions || !fs.existsSync(TR)) { console.log("대장 비교: brief_data.json 또는 trades/ 없음 — 건너뜀"); return; }
    var norm = function (x) { return String(x || "").replace(/\s+/g, "").replace(/아파트$/, ""); };
    var wmed = function (vals) { vals = vals.filter(function (v) { return v[0] != null && v[1] > 0; }).sort(function (a, b) { return a[0] - b[0]; }); var tot = vals.reduce(function (a, v) { return a + v[1]; }, 0); if (!tot) return null; var acc = 0; for (var i = 0; i < vals.length; i++) { acc += vals[i][1]; if (acc >= tot / 2) return vals[i][0]; } return vals[vals.length - 1][0]; };
    var at = function (ser, i) { if (!ser) return [null, 0]; var j = i - (ser.o || 0); return j >= 0 && j < ser.p.length ? [ser.p[j], (ser.c && ser.c[j]) || 0] : [null, 0]; };
    var out = { v: 1, built: new Date().toISOString().slice(0, 10), rule: "연 중위가(만원) · 전체 = 모든 단지의 연 중위를 건수로 가중한 중위 · 대장 = 대장 3곳의 연 중위 평균(값이 있는 곳만) · 대장 명단은 그날의 brief_data", y0: null, years: null, r: {} }, nReg = 0, nMatch = 0, nLead = 0;
    Object.keys(B.regions).forEach(function (code) {
      var L = B.regions[code].leaders; if (!L) return; var T = readJson(path.join(TR, code + ".json")); if (!T || !T.cx) return;
      if (out.y0 == null) { out.y0 = T.y0; out.years = T.years; } var Y = T.years, idx = {}; T.cx.forEach(function (c) { idx[norm(c.d) + "|" + norm(c.n)] = c; });
      var o = {}, any = false;
      ["84", "59"].forEach(function (bk) {
        var LL = (L[bk] || []).slice(0, 3); if (!LL.length) return; var bands = (T.bands || []).map(Number);
        var M = LL.map(function (x) { nLead++; var c = idx[norm(x.dong) + "|" + norm(x.apt)];
          /* v13.3 읍·면 지역 — 요약에는 "봉담읍 상리", 저장본에는 "상리"로 적혀 있어 못 맞추던 것. 동 이름의 마지막 토막(리)으로 한 번 더 찾고, 그래도 없으면 '시군구 안에 그 단지명이 하나뿐'일 때만 받는다 */
          if (!c) { var dl = norm(String(x.dong || "").trim().split(/\s+/).pop()), nx = norm(x.apt), C1 = T.cx.filter(function (q) { return norm(q.n) === nx && norm(String(q.d || "").trim().split(/\s+/).pop()) === dl; }); if (C1.length === 1) c = C1[0]; else if (!C1.length) { var C2 = T.cx.filter(function (q) { return norm(q.n) === nx; }); if (C2.length === 1) c = C2[0]; } }
          if (!c) { var nd = norm(x.dong), na = norm(String(x.apt).replace(/\(.*?\)/g, "")), C = T.cx.filter(function (q) { if (norm(q.d) !== nd) return false; var nq = norm(String(q.n).replace(/\(.*?\)/g, "")); return nq && na && (nq === na || (na.length >= 4 && nq.indexOf(na) === 0) || (nq.length >= 4 && na.indexOf(nq) === 0)); }); if (C.length === 1) c = C[0]; }   /* 괄호(동 번호 등)만 다른 이름은 같은 동 안에서 하나로 정해질 때만 */ if (!c) return null; var ks = bands.slice().sort(function (a, b) { return Math.abs(a - x.ar) - Math.abs(b - x.ar); }), key = null; for (var k = 0; k < ks.length && k < 2; k++) if (c.s && c.s[String(ks[k])]) { key = String(ks[k]); break; } if (!key) return null; nMatch++; return { x: x, s: c.s[key], r: c.r && c.r[key] }; });
        var a = [], l = [], ln = [], ra = [], rl = [], an = [];
        for (var i = 0; i < Y; i++) {
          var sv = [], rv = []; T.cx.forEach(function (c) { if (c.s && c.s[bk]) sv.push(at(c.s[bk], i)); if (c.r && c.r[bk]) rv.push(at(c.r[bk], i)); });
          a.push(wmed(sv)); ra.push(wmed(rv)); an.push(sv.reduce(function (q, v) { return q + (v[0] != null ? v[1] : 0); }, 0));
          var lv = M.filter(Boolean).map(function (m) { return at(m.s, i)[0]; }).filter(function (v) { return v != null; }), lr = M.filter(Boolean).map(function (m) { return at(m.r, i)[0]; }).filter(function (v) { return v != null; });
          l.push(lv.length ? Math.round(lv.reduce(function (q, v) { return q + v; }, 0) / lv.length) : null); ln.push(lv.length); rl.push(lr.length ? Math.round(lr.reduce(function (q, v) { return q + v; }, 0) / lr.length) : null);
        }
        if (l.some(function (v) { return v != null; })) { o[bk] = { a: a, l: l, ln: ln, an: an, ra: ra, rl: rl, nm: LL.map(function (x, k) { return x.apt + (M[k] ? "" : "*"); }) }; any = true; }
      });
      if (any) { out.r[code] = o; nReg++; }
    });
    /* ── v13.1 대장 실거래 지수(월) — data/highs/lead/{시군구}.json 의 거래 한 건 한 건으로 만든다 ──
       단지마다 그 달 거래의 ㎡당가 중위 → 거래 없는 달은 직전 값 유지 → 지수는 '두 달 모두 값이 있는 단지'들의 전월 대비 평균을 이어 붙인다(단지가 바뀌어도 수준이 튀지 않게).
       lv = 지금 대장 3곳의 최근 값 평균 × 면적(84 또는 59) · ix = 이어 붙인 지수(마지막 달 = 100) · n = 그 달 실제 거래 수 · k = 값이 있는 대장 수 · rc = 최근 거래 8건 */
    try {
      var LDIR = path.join(ROOT, "data", "highs", "lead"), nowYm = kstYm(), mN = 0, mTrades = 0, lb = function (a) { return a < 55 ? "S" : a < 70 ? "59" : a < 95 ? "84" : "L"; }, med = function (A) { A = A.slice().sort(function (x, y) { return x - y; }); var h = A.length >> 1; return A.length % 2 ? A[h] : (A[h - 1] + A[h]) / 2; };
      if (fs.existsSync(LDIR)) Object.keys(B.regions).forEach(function (code) {
        var G = readJson(path.join(LDIR, code + ".json")), L = B.regions[code].leaders; if (!G || G.v !== 2 || !G.t || !L) return; var from = G.from || nowYm, i0 = ymIdx(from), N = ymIdx(nowYm) - i0 + 1; if (N < 3) return;
        var M = {};
        ["84", "59", "S", "L", "P"].forEach(function (bk) {   /* v13.5 소형·대형·평단가(P = 평형 가리지 않고 ㎡당가) 대장도 같은 방법으로 */
          var LL = (L[bk] || []).slice(0, 3).map(function (x) { return x.dong + "|" + x.apt; }); if (!LL.length) return;
          var per = LL.map(function (ak) { var by = {}; (G.t[ak] || []).forEach(function (r) { if (bk !== "P" && lb(r[2]) !== bk) return; var i = ymIdx(Math.floor(r[0] / 100)) - i0; if (i < 0 || i >= N) return; (by[i] = by[i] || []).push(r[1] / r[2]); }); var raw = [], ff = [], last = null; for (var i = 0; i < N; i++) { raw.push(by[i] ? med(by[i]) : null); if (by[i]) last = raw[i]; ff.push(last); } return { raw: raw, ff: ff, n: by }; });
          var ix = [], n = [], k = [], cur = 100; for (var i = 0; i < N; i++) { var cnt = 0, kk = 0; per.forEach(function (p) { if (p.n[i]) cnt += p.n[i].length; if (p.ff[i] != null) kk++; }); n.push(cnt); k.push(kk);
            if (i > 0) { var R = per.filter(function (p) { return p.ff[i] != null && p.ff[i - 1] != null; }).map(function (p) { return p.ff[i] / p.ff[i - 1]; }); if (R.length) cur *= R.reduce(function (a, v) { return a + v; }, 0) / R.length; } ix.push(kk ? cur : null); }
          var lastV = per.map(function (p) { return p.ff[N - 1]; }).filter(function (v) { return v != null; }); if (!lastV.length) return; var base = ix[N - 1];
          var rc = []; LL.forEach(function (ak) { (G.t[ak] || []).forEach(function (r) { if (bk === "P" || lb(r[2]) === bk) rc.push([r[0], ak.split("|")[1], r[2], r[3], r[1]]); }); }); rc.sort(function (a, b) { return b[0] - a[0]; });
          M[bk] = { lv: Math.round(lastV.reduce(function (a, v) { return a + v; }, 0) / lastV.length * (bk === "84" || bk === "59" ? Number(bk) : 3.3058)), u: bk === "84" || bk === "59" ? "amt" : "py",   /* 59·84 = 그 면적 환산 금액 · 소형·대형·평단가 = 평당가(만원/평) */ ix: ix.map(function (v) { return v == null ? null : Math.round(v / base * 10000) / 100; }), n: n, k: k, rc: rc.slice(0, 8), tot: n.reduce(function (a, v) { return a + v; }, 0) }; mTrades += M[bk].tot;
        });
        if (Object.keys(M).length) { (out.r[code] = out.r[code] || {}).m = { from: from, b: M }; mN++; }
      });
      out.v = 2; out.mrule = "월 지수 = 대장 3곳의 실거래(직거래 제외) ㎡당가 월 중위를 단지별로 잇고, 두 달 모두 값이 있는 단지의 전월 대비 평균을 이어 붙임 · 거래 없는 달은 직전 값";
      console.log("대장 실거래 지수(월) — 지역 " + mN + "곳 · 거래 " + mTrades + "건" + (fs.existsSync(LDIR) ? "" : " · 장부(data/highs/lead) 아직 없음"));
    } catch (e) { console.log("대장 실거래 지수 만들기 실패: " + e.message); }
    fs.mkdirSync(MO_DIR, { recursive: true }); fs.writeFileSync(path.join(MO_DIR, "_lead.json"), JSON.stringify(out));
    console.log("대장 비교(_lead.json) — 지역 " + nReg + "곳 · 대장 " + nMatch + "/" + nLead + "곳을 저장본과 이름으로 맞춤 · " + Math.round(fs.statSync(path.join(MO_DIR, "_lead.json")).size / 1024) + "KB");
  } catch (e) { console.log("대장 비교 만들기 실패(본 작업과 무관): " + e.message); }
})();
