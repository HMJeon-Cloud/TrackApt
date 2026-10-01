/* scripts/brief_build.js — '지금 시장' 데이터를 매일 새벽에 만드는 스크립트 (v6.2)
   GitHub Actions(.github/workflows/brief.yml)가 매일 03:00 KST에 돌려 brief_data.json 을 저장소에 커밋한다.
   커밋되면 Vercel이 다시 배포하고, 앱은 정적 파일 brief_data.json 만 읽는다 (서버 함수 없음).

   실거래는 배포된 사이트의 /api/trades 를 통해 받는다 — 국토부 API 키는 Vercel 환경변수에만 있다.
   환경변수 SITE (기본 https://track-apt.vercel.app) 로 대상 사이트를 바꿀 수 있다.

   한 지역당 매매 4개월 + 전월세 2개월 = 6번(+ 1,000건 넘는 달은 쪽 넘김) → 253곳 ≈ 1,700회. 동시 3개 · 실패 시 2회 재시도.
   node 18+ (fetch 내장) */
var fs = require("fs"), path = require("path");
var SITE = (process.env.SITE || "https://track-apt.vercel.app").replace(/\/$/, "");
var CONC = Number(process.env.CONC || 3);
var ROOT = path.join(__dirname, "..");

/* ── 지역 목록: market_core.json 의 시군구 코드 (없으면 LAWD 표를 index.html 에서 뽑는다) ── */
function regionCodes() {
  try {
    var mc = JSON.parse(fs.readFileSync(path.join(ROOT, "market_core.json"), "utf8"));
    var codes = Object.keys(mc.regions || {});
    if (codes.length) return codes;
  } catch (e) {}
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var m = html.match(/var LAWD_GROUPS = (\[[\s\S]*?\n\]);/);
  var groups = eval(m[1]);          /* 우리 파일이라 eval 로 충분하다 */
  var out = [];
  groups.forEach(function (g) { g.items.forEach(function (it) { out.push(String(it[1]).split(":")[0]); }); });
  return out;
}

/* ── 월별 저장본(market_core.json)의 마지막 달·시도 — '최신 보정'의 기준 (v6.51) ──
   월별 저장본은 손으로 갈아 끼우는 파일이라 한두 달 늦다. 그 마지막 3개월(M-2~M) ㎡당 중위가와
   최근 90일 ㎡당 중위가를 같은 실거래(아파트만)로 다시 재서 그 비율을 앱에 넘긴다.
   앱은 저장본 지수의 마지막 값 × 비율 = '지금' 값으로 MDD·갈아타기를 매일 새로 계산한다. */
var MC_LAST = null, MC_SD = {};
(function () {
  try {
    var mc = JSON.parse(fs.readFileSync(path.join(ROOT, "market_core.json"), "utf8"));
    var y = Number(String(mc.m0).slice(0, 4)), m = Number(String(mc.m0).slice(4)), t = y * 12 + m - 1 + mc.months - 1;
    MC_LAST = Math.floor(t / 12) * 100 + (t % 12) + 1;
    Object.keys(mc.regions || {}).forEach(function (c) { MC_SD[c] = mc.regions[c].sd; });
  } catch (e) { MC_LAST = null; }
})();
var FRESH_MIN = 20, FRESH_POOL = {};

/* ── 날짜 ── */
function dayN(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function shiftDay(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function ymOf(d) { return d.getFullYear() * 100 + (d.getMonth() + 1); }
function ymPrev(ym) { var y = Math.floor(ym / 100), m = ym % 100 - 1; return m === 0 ? (y - 1) * 100 + 12 : y * 100 + m; }
function band(area) { return area < 45 ? 36 : area < 55 ? 46 : area < 70 ? 59 : area < 95 ? 84 : area < 120 ? 101 : 135; }
function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
function dnum(t) { var ym = Number(t.ym || 0) || t._ym; return ym * 100 + (Number(t.day) || 1); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ── 호출 (동시 3개 · 재시도) ── */
var active = 0, queue = [];
function slot() { return new Promise(function (res) { if (active < CONC) { active++; res(); } else queue.push(res); }); }
function release() { active--; if (queue.length) { active++; queue.shift()(); } }
var CALLS = 0, FAILS = 0;
async function getJson(url, tries) {
  await slot();
  try {
    for (var i = 0; i <= (tries || 2); i++) {
      try {
        CALLS++;
        var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 25000);
        var r = await fetch(url, { signal: ac.signal, headers: { "user-agent": "TrackApt-brief-build/1.0" } });
        clearTimeout(t);
        var j = await r.json();
        var busy = r.status === 502 || r.status === 429 || r.status === 503 || /제한|초과|LIMIT|BUSY|TRAFFIC|일시/i.test((j.error || "") + (j.msg || ""));
        if (busy && i < (tries || 2)) { await sleep(800 * (i + 1)); continue; }
        return j;
      } catch (e) { if (i >= (tries || 2)) { FAILS++; return { error: String(e.message || e) }; } await sleep(800 * (i + 1)); }
    }
  } finally { release(); }
}
/* ── 아파트만 남기기 (v6.41) ────────────────────────────────────────────
   국토부 '아파트' 실거래에는 오피스텔·빌라(연립·다세대)는 없지만 도시형생활주택(원룸형)과
   통째로 넘어간 거래(일괄 매각·임대 분양전환)가 섞여 있다. 둘 다 시세와 무관해 뺀다.
     ⓞ 토지임대부 아파트(landLeaseholdGbn=Y) → 땅값이 빠진 가격이라 시세와 섞지 않는다 (v6.6)
     ① 전용 30㎡ 미만 → 도시형생활주택(원룸형) 추정 (매매·전월세 공통)
     ② 한 단지에서 같은 날 5건 이상, 그중 60% 이상이 직거래 → 일괄 거래 추정 (매매만)
        (2021.11 이전 신고는 거래유형이 비어 있어 같은 날 8건 이상이면 일괄로 본다)
     ③ 한 단지에서 한 달 직거래 10건 이상이고 그 단지 거래의 70% 이상 → 일괄·분양전환 추정 (그 직거래만)
   items 는 같은 시군구·같은 달 목록이어야 한다. 반환: { items, dropped:[{…t, why:"small"|"bulk"}] } */
var APT_MIN_AREA = 30;
function aptOnly(items, kind) {
  var keep = [], dropped = [];
  items.forEach(function (t) {
    if (/^(Y|1|토지)/i.test(t.landLease || "")) dropped.push(Object.assign({}, t, { why: "lease" }));      /* 토지임대부 — 땅값이 빠진 가격 */
    else if (t.area > 0 && t.area < APT_MIN_AREA) dropped.push(Object.assign({}, t, { why: "small" })); else keep.push(t);
  });
  if (kind !== "sale") return { items: keep, dropped: dropped };
  function isDirect(t) { return /직거래/.test(t.dealingGbn || ""); }
  function known(t) { return /거래/.test(t.dealingGbn || ""); }
  var byDay = {}, byApt = {};
  keep.forEach(function (t) {
    var a = t.dong + "|" + t.apt, d = a + "|" + t.ym + "|" + t.day;
    (byDay[d] = byDay[d] || []).push(t);
    var g = byApt[a] || (byApt[a] = { n: 0, direct: 0 }); g.n++; if (isDirect(t)) g.direct++;
  });
  var bad = new Set();
  Object.keys(byDay).forEach(function (d) {
    var L = byDay[d]; if (L.length < 5) return;
    var kn = L.filter(known).length, dr = L.filter(isDirect).length;
    if (kn ? dr / L.length >= 0.6 : L.length >= 8) L.forEach(function (t) { bad.add(t); });
  });
  keep.forEach(function (t) {
    var g = byApt[t.dong + "|" + t.apt];
    if (isDirect(t) && g.direct >= 10 && g.direct / g.n >= 0.7) bad.add(t);
  });
  return {
    items: keep.filter(function (t) { return !bad.has(t); }),
    dropped: dropped.concat(keep.filter(function (t) { return bad.has(t); }).map(function (t) { return Object.assign({}, t, { why: "bulk" }); }))
  };
}

/* 직거래는 가족 간 거래처럼 시세와 먼 값이 섞여 가격 계산(중위가·최고가·신고가)에서 뺀다. 건수에는 넣는다. */
function priced(t) { return !/직거래/.test(t.dealingGbn || ""); }

/* 한 달치를 끝까지 (1,000건씩 쪽 넘김) 받은 뒤 아파트만 남긴다. 뺀 거래는 list.dropped 에 */
async function trades(lawd, kind, ym) {
  var all = [];
  for (var page = 1; page <= 8; page++) {
    var j = await getJson(SITE + "/api/trades?raw=1&numOfRows=1000&pageNo=" + page + "&kind=" + kind + "&lawd=" + lawd + "&ym=" + ym);
    if (j.error) throw new Error(j.error);
    var got = j.items || [];
    all = all.concat(got);
    if (!j.totalCount || page * 1000 >= j.totalCount || got.length < 1000) break;
  }
  all = all.filter(function (t) {
    t._ym = ym;
    return !t.canceled && t.area > 0 && (kind === "sale" ? t.amount > 0 : (t.deposit > 0 || t.rent > 0));
  });
  var f = aptOnly(all, kind);
  f.items.dropped = f.dropped;
  return f.items;
}

function topDeals(list, n) {
  return list.slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, n).map(function (t) {
    return { apt: t.apt, dong: t.dong, amount: t.amount, area: t.area, floor: t.floor, d: dnum(t), buildYear: t.buildYear };
  });
}
function key(t) { return t.dong + "|" + t.apt + "|" + band(t.area); }
/* 신고가는 '같은 단지 · 같은 전용면적(㎡ 반올림)'끼리만 견준다 — 74㎡와 84㎡를 한 평형대로 묶으면
   넓은 집이 팔린 것만으로 신고가처럼 보인다 (v6.6) */
function tkey(t) { return t.dong + "|" + t.apt + "|" + Math.round(t.area); }
function ymNext(ym) { var y = Math.floor(ym / 100), m = ym % 100 + 1; return m === 13 ? (y + 1) * 100 + 1 : y * 100 + m; }

/* ── 역대 최고가 장부 data/highs/{lawd}.json (v6.4) ──────────────────────
   '역대 신고가'를 가리려면 그 단지·평형대가 예전에 얼마까지 팔렸는지 알아야 한다.
   월별 집계 저장본은 중위값만 있어 최고가를 모른다 → 실거래를 한 번씩 훑어 최고가만 모아 둔다.
     · 봉인 구간: 최근 4개월보다 앞선 달들 (신고·해제가 거의 끝난 달). 달이 바뀌면 한 달씩 앞으로 봉인한다.
     · 과거로 넓히기: 매일 밤 지역마다 BACKFILL_MONTHS(기본 12)개월씩 2020.01까지 거슬러 올라간다.
       253곳 × 12개월 ≈ 3,000회가 더 들고, 약 7일이면 2020년까지 다 채운다. 그 뒤로는 달이 바뀔 때 1회.
   모양: { v:2, from:YYYYMM, to:YYYYMM, m:{ "동|단지": { "85": [금액, YYYYMMDD, 층] } } }
   v2(v6.6): 열쇠가 평형대 → 전용면적(㎡ 반올림), 직거래 제외. v1 장부는 버리고 다시 쌓는다. */
var HI_DIR = path.join(ROOT, "data", "highs"), HI_START = 202001;
var BACKFILL = Number(process.env.BACKFILL_MONTHS == null ? 12 : process.env.BACKFILL_MONTHS);
function loadHi(lawd) { try { var h = JSON.parse(fs.readFileSync(path.join(HI_DIR, lawd + ".json"), "utf8")); return h && h.v === 2 ? h : null; } catch (e) { return null; } }
function saveHi(lawd, h) { fs.mkdirSync(HI_DIR, { recursive: true }); fs.writeFileSync(path.join(HI_DIR, lawd + ".json"), JSON.stringify(h)); }
function foldHi(h, list) {
  list.forEach(function (t) {
    if (!priced(t)) return;
    var ak = t.dong + "|" + t.apt, b = String(Math.round(t.area));
    var row = h.m[ak] || (h.m[ak] = {}), cur = row[b];
    if (!cur || t.amount > cur[0]) row[b] = [t.amount, dnum(t), Number(t.floor) || 0];
  });
}
function hiGet(h, k) {
  if (!h) return null;
  var i = k.lastIndexOf("|"), row = h.m[k.slice(0, i)];
  return row ? row[k.slice(i + 1)] || null : null;
}
var HI_CALLS = 0;
async function updateHi(lawd, sealTo) {
  var h = loadHi(lawd) || { v: 2, from: null, to: null, m: {} };
  try {
    if (h.to == null) { foldHi(h, await trades(lawd, "sale", sealTo)); HI_CALLS++; h.from = h.to = sealTo; }
    else while (h.to < sealTo) { var nx = ymNext(h.to); foldHi(h, await trades(lawd, "sale", nx)); HI_CALLS++; h.to = nx; }
    for (var i = 0; i < BACKFILL && h.from > HI_START; i++) {
      var pm = ymPrev(h.from);
      foldHi(h, await trades(lawd, "sale", pm)); HI_CALLS++; h.from = pm;
    }
  } catch (e) { /* 실패한 달은 넘기지 않는다 — 다음 밤에 거기서 다시 */ }
  saveHi(lawd, h);
  return h;
}
/* ── 한 지역 요약 (최근 30일 창) ── */
async function summarize(lawd, today) {
  var d0 = dayN(shiftDay(today, -30)), d1 = dayN(shiftDay(today, -60)), d2 = dayN(shiftDay(today, -90)), d7 = dayN(shiftDay(today, -7));
  var ym = ymOf(today), months = [ym, ymPrev(ym), ymPrev(ymPrev(ym)), ymPrev(ymPrev(ymPrev(ym)))];
  var sale = [], rent = [];
  var sp = await Promise.all(months.map(function (m) { return trades(lawd, "sale", m); }));
  var drop = [];
  sp.forEach(function (a) { sale = sale.concat(a); drop = drop.concat(a.dropped || []); });
  var rp = await Promise.all(months.slice(0, 2).map(function (m) { return trades(lawd, "rent", m).catch(function () { return []; }); }));
  rp.forEach(function (a) { rent = rent.concat(a); });
  /* 최신 보정 — 저장본 마지막 3개월이 위 4개월 밖이면 그 달만 더 받는다 */
  var fresh = null;
  if (MC_LAST && MC_LAST >= ymPrev(ymPrev(ymPrev(ymPrev(ymPrev(ymPrev(ym))))))) {
    var B = [ymPrev(ymPrev(MC_LAST)), ymPrev(MC_LAST), MC_LAST];
    var extra = B.filter(function (m) { return months.indexOf(m) < 0; });
    var ep = await Promise.all(extra.map(function (m) { return trades(lawd, "sale", m).catch(function () { return null; }); }));
    if (ep.every(Boolean)) {
      var pool = sale; ep.forEach(function (a) { pool = pool.concat(a); });
      var bp = pool.filter(function (t) { return B.indexOf(t._ym) >= 0 && priced(t); }).map(function (t) { return t.amount / t.area; });
      var np = sale.filter(function (t) { return dnum(t) > d2 && priced(t); }).map(function (t) { return t.amount / t.area; });
      FRESH_POOL[lawd] = { b: bp, n: np };
      fresh = { m: MC_LAST, b: bp.length ? Math.round(median(bp) * 10) / 10 : null, bn: bp.length,
                n: np.length ? Math.round(median(np) * 10) / 10 : null, nn: np.length };
    }
  }

  var cur = sale.filter(function (t) { return dnum(t) > d0; });
  var prv = sale.filter(function (t) { var d = dnum(t); return d > d1 && d <= d0; });
  var base = sale.filter(function (t) { var d = dnum(t); return d > d2 && d <= d0; });
  var rentAll = rent.filter(function (t) { return dnum(t) > d0; });
  var rentCur = rentAll.filter(function (t) { return t.jeonse && t.deposit > 0; });   /* 전세 */
  var wolCur = rentAll.filter(function (t) { return !t.jeonse; });                    /* 월세(반전세 포함) */
  /* 많이 거래된 단지 — 전세 · 월세 (단지·평형대별) */
  function busyRent(list, wol) {
    var m = {};
    list.forEach(function (t) {
      var k = key(t), g = m[k] || (m[k] = { apt: t.apt, dong: t.dong, band: band(t.area), n: 0, dep: [], rent: [], max: 0 });
      g.n++; g.dep.push(t.deposit); if (wol) g.rent.push(t.rent); if (t.deposit > g.max) g.max = t.deposit;
    });
    return Object.keys(m).map(function (k) {
      var g = m[k], o = { apt: g.apt, dong: g.dong, band: g.band, n: g.n, med: median(g.dep) };
      if (wol) o.rentMed = median(g.rent); else o.max = g.max;
      return o;
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
  }
  var week = cur.filter(function (t) { return dnum(t) > d7; }).length;
  /* 역대 최고가 장부 — 최근 4개월 바로 앞 달까지 봉인 */
  var hi = await updateHi(lawd, ymPrev(months[3]));
  /* 많이 거래된 단지·갭 — 단지·평형대별. 건수는 전부, 가격(중위·최고)은 직거래 뺀 거래로 */
  var byK = {};
  cur.forEach(function (t) {
    var k = key(t), g = byK[k] || (byK[k] = { apt: t.apt, dong: t.dong, band: band(t.area), n: 0, max: null, prices: [], je: [] });
    g.n++;
    if (!priced(t)) return;
    g.prices.push(t.amount);
    if (!g.max || t.amount > g.max.amount) g.max = { amount: t.amount, floor: t.floor, area: t.area, d: dnum(t) };
  });
  rentCur.forEach(function (t) { var g = byK[key(t)]; if (g) g.je.push(t.deposit); });
  var groups = Object.keys(byK).map(function (k) {
    var g = byK[k];
    g.med = g.prices.length ? median(g.prices) : null; g.jeMed = g.je.length >= 2 ? median(g.je) : null; g.jeN = g.je.length;
    g.gap = (g.jeMed != null && g.med != null && g.prices.length >= 2) ? g.med - g.jeMed : null;
    delete g.prices; delete g.je;
    return g;
  }).filter(function (g) { return g.max; });
  /* 신고가 — 같은 단지·같은 전용면적, 직거래 제외 */
  var freshMax = {};                                  /* 봉인 뒤 ~ 30일 창 직전의 거래 (장부에 아직 안 들어간 부분) */
  sale.forEach(function (t) {
    if (dnum(t) > d0 || !priced(t)) return;
    var k = tkey(t); if (!freshMax[k] || t.amount > freshMax[k][0]) freshMax[k] = [t.amount, dnum(t), Number(t.floor) || 0];
  });
  var baseMax = {}, baseN = {};
  base.forEach(function (t) { if (!priced(t)) return; var k = tkey(t); baseN[k] = (baseN[k] || 0) + 1; if (!baseMax[k] || t.amount > baseMax[k]) baseMax[k] = t.amount; });
  var byT = {};
  cur.forEach(function (t) {
    if (!priced(t)) return;
    var k = tkey(t), g = byT[k] || (byT[k] = { apt: t.apt, dong: t.dong, band: band(t.area), area: Math.round(t.area), n: 0, max: null });
    g.n++;
    if (!g.max || t.amount > g.max.amount) g.max = { amount: t.amount, floor: t.floor, area: t.area, d: dnum(t) };
  });
  var highs = Object.keys(byT).map(function (k) {
    var g = byT[k];
    g.baseMax = baseMax[k] || null; g.baseN = baseN[k] || 0;
    g.up = (g.baseMax && g.baseN >= 2) ? Math.round((g.max.amount / g.baseMax - 1) * 1000) / 10 : null;
    /* 30일 창 이전의 모든 기록 중 최고 (장부 + 봉인 안 된 최근분) */
    var a = hiGet(hi, k), f = freshMax[k], pa = (a && f) ? (f[0] > a[0] ? f : a) : (a || f);
    g.allPrev = pa || null;
    g.upAll = pa ? Math.round((g.max.amount / pa[0] - 1) * 1000) / 10 : null;
    return g;
  });
  var curP = cur.filter(priced), prvP = prv.filter(priced);
  return {
    count: cur.length, prevCount: prv.length, weekCount: week, rentCount: rentCur.length, wolCount: wolCur.length,
    busyJ: busyRent(rentCur, false), busyW: busyRent(wolCur, true),
    pm: median(curP.map(function (t) { return t.amount / t.area; })),
    prevPm: median(prvP.map(function (t) { return t.amount / t.area; })),
    top: topDeals(curP, 5),
    /* 평형대별 최고가 — S 소형(55㎡ 미만) · 59 · 84 · L 대형(95㎡ 이상) */
    topB: { S: topDeals(curP.filter(function (t) { return t.area < 55; }), 3),
            59: topDeals(curP.filter(function (t) { return band(t.area) === 59; }), 3),
            84: topDeals(curP.filter(function (t) { return band(t.area) === 84; }), 3),
            L: topDeals(curP.filter(function (t) { return t.area >= 95; }), 3) },
    /* 평형대별 건수·㎡당 중위 (범위 합산용) */
    bands: (function () {
      var o = {};
      [["S", function (t) { return t.area < 55; }], ["59", function (t) { return band(t.area) === 59; }],
       ["84", function (t) { return band(t.area) === 84; }], ["L", function (t) { return t.area >= 95; }]].forEach(function (p) {
        var a = cur.filter(p[1]), b = prv.filter(p[1]);
        var ap = a.filter(priced), bp2 = b.filter(priced);
        o[p[0]] = { n: a.length, pn: b.length, pm: median(ap.map(function (t) { return t.amount / t.area; })), ppm: median(bp2.map(function (t) { return t.amount / t.area; })) };
      });
      return o;
    })(),
    busy: groups.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 12),
    /* 신고가 — 평형대별로 골라 볼 수 있게 넉넉히 20곳 */
    newHigh: highs.filter(function (g) { return g.up != null && g.up > 0; }).sort(function (a, b) { return b.up - a.up; }).slice(0, 20),
    /* 역대 신고가 — 장부가 덮는 기간(hiFrom~) 안에서 가장 높았던 값을 넘긴 단지 */
    newHighAll: highs.filter(function (g) { return g.upAll != null && g.upAll > 0; }).sort(function (a, b) { return b.upAll - a.upAll; }).slice(0, 20),
    hiFrom: hi.from, hiTo: hi.to,
    fresh: fresh,
    /* 최근 30일 창에서 뺀 거래 — 도시형생활주택 추정(small) · 일괄 거래 추정(bulk) · 많이 뺀 단지 3곳(bulkApts) */
    excl: (function () {
      var w = drop.filter(function (t) { return dnum(t) > d0; }), by = {};
      w.forEach(function (t) { var a = t.dong + "|" + t.apt; by[a] = by[a] || { apt: t.apt, dong: t.dong, n: 0 }; by[a].n++; });
      return { small: w.filter(function (t) { return t.why === "small"; }).length, bulk: w.filter(function (t) { return t.why === "bulk"; }).length,
               lease: w.filter(function (t) { return t.why === "lease"; }).length,
               bulkApts: Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 3) };
    })(),
    gaps: groups.filter(function (g) { return g.gap != null && g.gap > 0; }).sort(function (a, b) { return a.gap - b.gap; }).slice(0, 5)
  };
}

/* ── 뉴스 제목 (구글 뉴스 RSS) ── */
var FEEDS = [
  "https://news.google.com/rss/search?q=" + encodeURIComponent("아파트 실거래") + "&hl=ko&gl=KR&ceid=KR:ko",
  "https://news.google.com/rss/search?q=" + encodeURIComponent("부동산 규제 OR 대출 OR 분양") + "&hl=ko&gl=KR&ceid=KR:ko"
];
var STOP = ["아파트", "부동산", "서울", "기자", "뉴스", "오늘", "이번", "지난", "관련", "위해", "대한", "통해", "것으로", "있다", "했다", "한다", "된다",
  "등", "및", "더", "vs", "속", "중", "전", "후", "년", "월", "일", "억", "만", "곳", "명"];
function unesc(s) {
  return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]+>/g, "").trim();
}
async function news() {
  var all = [], seen = {};
  for (var i = 0; i < FEEDS.length; i++) {
    try {
      var xml = await (await fetch(FEEDS[i], { headers: { "user-agent": "TrackApt-brief-build/1.0" } })).text();
      var re = /<item>([\s\S]*?)<\/item>/g, m;
      while ((m = re.exec(xml))) {
        var it = m[1];
        var title = unesc((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]).replace(/\s*-\s*[^-]+$/, "");
        if (!title || seen[title.replace(/\s/g, "")]) continue;
        seen[title.replace(/\s/g, "")] = 1;
        all.push({ t: title, u: unesc((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]),
          d: unesc((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]), s: unesc((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]) });
      }
    } catch (e) { console.warn("뉴스 피드 실패:", e.message); }
  }
  all.sort(function (a, b) { return new Date(b.d) - new Date(a.d); });
  var week = Date.now() - 7 * 86400000;
  var recent = all.filter(function (it) { var d = new Date(it.d); return !isFinite(d) || d >= week; });
  var cnt = {};
  recent.forEach(function (it) {
    var seenW = {};
    it.t.replace(/[^가-힣A-Za-z0-9 ]/g, " ").split(/\s+/).forEach(function (w) {
      w = w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|도|만|까지|부터|보다|와|과)$/, "");
      if (w.length < 2 || /^\d+$/.test(w) || STOP.indexOf(w) >= 0 || seenW[w]) return;
      seenW[w] = 1; cnt[w] = (cnt[w] || 0) + 1;
    });
  });
  return { items: recent.slice(0, 30), keywords: Object.keys(cnt).map(function (k) { return [k, cnt[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 14) };
}

/* ── 실행 ── */
(async function main() {
  var today = new Date(Date.now() + 9 * 3600000);        /* KST 기준 날짜 */
  today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var codes = regionCodes(), t0 = Date.now();
  console.log("지역 " + codes.length + "곳 · 기준일 " + dayN(today) + " · " + SITE);
  var out = { v: 1, asOf: dayN(today), builtAt: new Date().toISOString(), window: [dayN(shiftDay(today, -30)), dayN(today)],
              regions: {}, failed: [], news: null };
  var done = 0;
  await Promise.all(codes.map(async function (c) {
    try { out.regions[c] = await summarize(c, today); }
    catch (e) { out.failed.push(c); console.warn(c, "실패:", e.message); }
    done++;
    if (done % 25 === 0) console.log(done + "/" + codes.length + " · 호출 " + CALLS + " · " + Math.round((Date.now() - t0) / 1000) + "초");
  }));
  out.news = await news();
  /* 하루치 요약 기록 data/brief_hist.json (v6.52) — 최근 30일은 신고 기한(30일)이 남아 늘 적게 잡힌다.
     '직전 30일'과 견주면 거래가 줄어든 것처럼 보이므로, 30일 전에 같은 방식으로 잰 값을 꺼내
     같은 신고 지연끼리 비교할 수 있게 한다. { "YYYYMMDD": { 코드: [건수, ㎡당 중위] } }, 120일 보관 */
  (function () {
    var HP = path.join(ROOT, "data", "brief_hist.json"), hist = {};
    try { hist = JSON.parse(fs.readFileSync(HP, "utf8")); } catch (e) {}
    var row = {};
    Object.keys(out.regions).forEach(function (c) { var r = out.regions[c]; row[c] = [r.count, r.pm == null ? null : Math.round(r.pm * 10) / 10]; });
    hist[String(out.asOf)] = row;
    var keep = dayN(shiftDay(today, -120));
    Object.keys(hist).forEach(function (k) { if (Number(k) < keep) delete hist[k]; });
    fs.mkdirSync(path.dirname(HP), { recursive: true });
    fs.writeFileSync(HP, JSON.stringify(hist));
    var want = shiftDay(today, -30), snap = null;
    [0, -1, 1, -2, 2, -3, 3].some(function (o) { var k = String(dayN(shiftDay(want, o))); if (hist[k]) { snap = k; return true; } return false; });
    out.snap30 = snap ? Number(snap) : null;
    if (snap) Object.keys(out.regions).forEach(function (c) { var v = hist[snap][c]; if (v) out.regions[c].snap = { n: v[0], pm: v[1] }; });
    console.log("하루 기록 " + Object.keys(hist).length + "일치 · 30일 전 비교 기준 " + (snap || "아직 없음"));
  })();
  /* 최신 보정 — 시도·전국 묶음은 거래를 모아 다시 중위값 (지역 중위값의 평균이 아니다) */
  if (MC_LAST) {
    var G = { "전국": { b: [], n: [] } };
    Object.keys(FRESH_POOL).forEach(function (c) {
      var sd = MC_SD[c], f = FRESH_POOL[c];
      [G["전국"], sd ? (G[sd] = G[sd] || { b: [], n: [] }) : null].forEach(function (g) { if (g) { Array.prototype.push.apply(g.b, f.b); Array.prototype.push.apply(g.n, f.n); } });
    });
    var groups = {};
    Object.keys(G).forEach(function (k) {
      var g = G[k];
      groups[k] = { m: MC_LAST, b: g.b.length ? Math.round(median(g.b) * 10) / 10 : null, bn: g.b.length, n: g.n.length ? Math.round(median(g.n) * 10) / 10 : null, nn: g.n.length };
    });
    out.fresh = { m: MC_LAST, min: FRESH_MIN, from: dayN(shiftDay(today, -89)), to: dayN(today), groups: groups };
    console.log("최신 보정 — 저장본 " + MC_LAST + " · 묶음 " + Object.keys(groups).length + "개 · 전국 기준 " + groups["전국"].bn + "건 / 최근 90일 " + groups["전국"].nn + "건");
  }
  var froms = Object.keys(out.regions).map(function (c) { return out.regions[c].hiFrom || 999999; });
  out.hiFrom = Math.max.apply(null, froms.length ? froms : [0]);     /* 가장 덜 채운 지역 기준 */
  out.hiStart = HI_START;
  out.hiDone = froms.filter(function (f) { return f <= HI_START; }).length;
  fs.writeFileSync(path.join(ROOT, "brief_data.json"), JSON.stringify(out));
  var size = fs.statSync(path.join(ROOT, "brief_data.json")).size;
  console.log("역대 장부 — 2020.01까지 채운 지역 " + out.hiDone + "/" + froms.length + "곳 · 가장 덜 채운 곳 " + out.hiFrom + "부터 · 장부 호출 " + HI_CALLS);
  console.log("완료 — 지역 " + Object.keys(out.regions).length + "곳 · 실패 " + out.failed.length + "곳 · 호출 " + CALLS +
    " · 실패호출 " + FAILS + " · " + Math.round(size / 1024) + "KB · " + Math.round((Date.now() - t0) / 1000) + "초");
  /* 절반 넘게 실패했으면 어제 파일을 덮어쓰지 않는다 */
  if (out.failed.length > codes.length / 2) { console.error("실패가 너무 많아 커밋하지 않습니다"); process.exit(2); }
})().catch(function (e) { console.error(e); process.exit(1); });
