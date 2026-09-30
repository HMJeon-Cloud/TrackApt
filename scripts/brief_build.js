/* scripts/brief_build.js — '지금 시장' 데이터를 매일 새벽에 만드는 스크립트 (v6.2)
   GitHub Actions(.github/workflows/brief.yml)가 매일 03:00 KST에 돌려 brief_data.json 을 저장소에 커밋한다.
   커밋되면 Vercel이 다시 배포하고, 앱은 정적 파일 brief_data.json 만 읽는다 (서버 함수 없음).

   실거래는 배포된 사이트의 /api/trades 를 통해 받는다 — 국토부 API 키는 Vercel 환경변수에만 있다.
   환경변수 SITE (기본 https://track-apt.vercel.app) 로 대상 사이트를 바꿀 수 있다.

   한 지역당 매매 4개월 + 전세 2개월 = 6번 → 253곳 ≈ 1,500회. 동시 3개 · 실패 시 2회 재시도.
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
async function trades(lawd, kind, ym) {
  var j = await getJson(SITE + "/api/trades?kind=" + kind + "&lawd=" + lawd + "&ym=" + ym);
  if (j.error) throw new Error(j.error);
  return (j.items || []).filter(function (t) {
    t._ym = ym;
    return !t.canceled && t.area > 0 && (kind === "sale" ? t.amount > 0 : (t.jeonse && t.deposit > 0));
  });
}

/* ── 한 지역 요약 (최근 30일 창) ── */
async function summarize(lawd, today) {
  var d0 = dayN(shiftDay(today, -30)), d1 = dayN(shiftDay(today, -60)), d2 = dayN(shiftDay(today, -90)), d7 = dayN(shiftDay(today, -7));
  var ym = ymOf(today), months = [ym, ymPrev(ym), ymPrev(ymPrev(ym)), ymPrev(ymPrev(ymPrev(ym)))];
  var sale = [], rent = [];
  var sp = await Promise.all(months.map(function (m) { return trades(lawd, "sale", m); }));
  sp.forEach(function (a) { sale = sale.concat(a); });
  var rp = await Promise.all(months.slice(0, 2).map(function (m) { return trades(lawd, "rent", m).catch(function () { return []; }); }));
  rp.forEach(function (a) { rent = rent.concat(a); });

  var cur = sale.filter(function (t) { return dnum(t) > d0; });
  var prv = sale.filter(function (t) { var d = dnum(t); return d > d1 && d <= d0; });
  var base = sale.filter(function (t) { var d = dnum(t); return d > d2 && d <= d0; });
  var rentCur = rent.filter(function (t) { return dnum(t) > d0; });
  var week = cur.filter(function (t) { return dnum(t) > d7; }).length;
  function key(t) { return t.dong + "|" + t.apt + "|" + band(t.area); }
  var baseMax = {}, baseN = {};
  base.forEach(function (t) { var k = key(t); baseN[k] = (baseN[k] || 0) + 1; if (!baseMax[k] || t.amount > baseMax[k]) baseMax[k] = t.amount; });
  var byK = {};
  cur.forEach(function (t) {
    var k = key(t), g = byK[k] || (byK[k] = { apt: t.apt, dong: t.dong, band: band(t.area), n: 0, max: null, prices: [], je: [] });
    g.n++; g.prices.push(t.amount);
    if (!g.max || t.amount > g.max.amount) g.max = { amount: t.amount, floor: t.floor, area: t.area, d: dnum(t) };
  });
  rentCur.forEach(function (t) { var g = byK[key(t)]; if (g) g.je.push(t.deposit); });
  var groups = Object.keys(byK).map(function (k) {
    var g = byK[k];
    g.med = median(g.prices); g.jeMed = g.je.length >= 2 ? median(g.je) : null; g.jeN = g.je.length;
    g.gap = (g.jeMed != null && g.n >= 2) ? g.med - g.jeMed : null;
    g.baseMax = baseMax[k] || null; g.baseN = baseN[k] || 0;
    g.up = (g.baseMax && g.baseN >= 2) ? Math.round((g.max.amount / g.baseMax - 1) * 1000) / 10 : null;
    delete g.prices; delete g.je;
    return g;
  });
  return {
    count: cur.length, prevCount: prv.length, weekCount: week, rentCount: rentCur.length,
    pm: median(cur.map(function (t) { return t.amount / t.area; })),
    prevPm: median(prv.map(function (t) { return t.amount / t.area; })),
    top: cur.slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, 5).map(function (t) {
      return { apt: t.apt, dong: t.dong, amount: t.amount, area: t.area, floor: t.floor, d: dnum(t), buildYear: t.buildYear };
    }),
    busy: groups.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 5),
    newHigh: groups.filter(function (g) { return g.up != null && g.up > 0; }).sort(function (a, b) { return b.up - a.up; }).slice(0, 8),
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
  fs.writeFileSync(path.join(ROOT, "brief_data.json"), JSON.stringify(out));
  var size = fs.statSync(path.join(ROOT, "brief_data.json")).size;
  console.log("완료 — 지역 " + Object.keys(out.regions).length + "곳 · 실패 " + out.failed.length + "곳 · 호출 " + CALLS +
    " · 실패호출 " + FAILS + " · " + Math.round(size / 1024) + "KB · " + Math.round((Date.now() - t0) / 1000) + "초");
  /* 절반 넘게 실패했으면 어제 파일을 덮어쓰지 않는다 */
  if (out.failed.length > codes.length / 2) { console.error("실패가 너무 많아 커밋하지 않습니다"); process.exit(2); }
})().catch(function (e) { console.error(e); process.exit(1); });
