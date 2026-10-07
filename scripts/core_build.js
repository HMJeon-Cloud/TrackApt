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
