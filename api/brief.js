/* /api/brief — 주간 브리핑용 서버 함수 (v6.1)
   두 가지 일을 한다. 둘 다 CDN 캐시를 걸어 하루에 몇 번만 실제로 돈다.

   ① kind=news  — 구글 뉴스 RSS에서 부동산 기사 제목을 모아 준다 (6시간 캐시).
                  요약·판단은 하지 않는다. 제목과 자주 나온 낱말만 센다.
   ② kind=region&lawd=11680 — 그 시·군·구의 이번 달·지난달 매매 실거래를 같은 배포의
                  /api/trades 로 받아 요약한다 (24시간 캐시): 최고가 거래, 거래 많은 단지,
                  지난달 최고가를 넘긴 단지(같은 평형대), 건수 변화.
                  한 호출이 실거래 API를 2번만 부르므로 시간 제한에 걸리지 않는다.
                  클라이언트가 지역을 돌며 부르고, 두 번째 사람부터는 CDN 캐시를 맞는다.

   국토부 API 키는 여기서 쓰지 않는다 — /api/trades 가 이미 감싸고 있다.

   ※ api/trades.js 가 `export default` 방식(ESM)이면 맨 아래 module.exports 줄을
      `export default handler;` 로 바꾸세요. */

var FEEDS = [
  "https://news.google.com/rss/search?q=" + encodeURIComponent("아파트 실거래") + "&hl=ko&gl=KR&ceid=KR:ko",
  "https://news.google.com/rss/search?q=" + encodeURIComponent("부동산 규제 OR 대출 OR 분양") + "&hl=ko&gl=KR&ceid=KR:ko"
];
var STOP = ["아파트", "부동산", "서울", "기자", "뉴스", "오늘", "이번", "지난", "관련", "위해", "대한", "통해", "것으로",
  "있다", "했다", "한다", "된다", "등", "및", "더", "vs", "속", "중", "전", "후", "년", "월", "일", "억", "만", "곳", "명"];

function fetchText(url, ms) {
  var ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  var t = ac ? setTimeout(function () { ac.abort(); }, ms || 8000) : null;
  return fetch(url, { signal: ac ? ac.signal : undefined, headers: { "user-agent": "TrackApt-brief/1.0" } })
    .then(function (r) { if (t) clearTimeout(t); return r.text(); });
}
function unesc(s) {
  return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "").trim();
}
function parseRss(xml) {
  var out = [], re = /<item>([\s\S]*?)<\/item>/g, m;
  while ((m = re.exec(xml))) {
    var it = m[1];
    var title = unesc((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    var link = unesc((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    var date = unesc((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
    var src = unesc((it.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
    if (!title) continue;
    title = title.replace(/\s*-\s*[^-]+$/, "");              /* 구글은 제목 끝에 " - 매체명"을 붙인다 */
    out.push({ t: title, u: link, d: date, s: src });
  }
  return out;
}
function keywords(items) {
  var cnt = {};
  items.forEach(function (it) {
    var seen = {};
    String(it.t).replace(/[^가-힣A-Za-z0-9 ]/g, " ").split(/\s+/).forEach(function (w) {
      w = w.replace(/(은|는|이|가|을|를|의|에|에서|으로|로|도|만|까지|부터|보다|와|과)$/, "");
      if (w.length < 2 || /^\d+$/.test(w) || STOP.indexOf(w) >= 0 || seen[w]) return;
      seen[w] = 1; cnt[w] = (cnt[w] || 0) + 1;
    });
  });
  return Object.keys(cnt).map(function (k) { return [k, cnt[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 14);
}

async function news(res) {
  var all = [], seen = {}, errs = 0;
  for (var i = 0; i < FEEDS.length; i++) {
    try {
      parseRss(await fetchText(FEEDS[i], 8000)).forEach(function (it) {
        var k = it.t.replace(/\s/g, "");
        if (seen[k]) return; seen[k] = 1; all.push(it);
      });
    } catch (e) { errs++; }
  }
  all.sort(function (a, b) { return new Date(b.d) - new Date(a.d); });
  var week = Date.now() - 7 * 86400000;
  var recent = all.filter(function (it) { var d = new Date(it.d); return !isFinite(d) || d >= week; });
  res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=3600");
  res.status(200).json({ items: recent.slice(0, 30), keywords: keywords(recent), fetchedAt: new Date().toISOString(),
    error: errs === FEEDS.length ? "뉴스 피드를 받지 못했습니다" : undefined });
}

function ymOf(d) { return d.getFullYear() * 100 + (d.getMonth() + 1); }
function ymPrev(ym) { var y = Math.floor(ym / 100), m = ym % 100 - 1; return m === 0 ? (y - 1) * 100 + 12 : y * 100 + m; }
function band(area) {
  return area < 45 ? 36 : area < 55 ? 46 : area < 70 ? 59 : area < 95 ? 84 : area < 120 ? 101 : 135;
}
async function tradesOf(host, lawd, ym) {
  var proto = /^(localhost|127\.)/.test(host) ? "http" : "https";
  var txt = await fetchText(proto + "://" + host + "/api/trades?kind=sale&lawd=" + lawd + "&ym=" + ym, 25000);
  var j; try { j = JSON.parse(txt); } catch (e) { throw new Error("실거래 응답 형식 오류"); }
  if (j.error) throw new Error(j.error);
  return (j.items || []).filter(function (t) { return !t.canceled && t.amount > 0 && t.area > 0; });
}
async function region(req, res, lawd) {
  var host = req.headers["x-forwarded-host"] || req.headers.host;
  var now = new Date(), ym = ymOf(now), pm = ymPrev(ym);
  /* 월초엔 이번 달 신고가 거의 없다 — 7일 이전이면 지난달을 '이번 달'로 본다 */
  if (now.getDate() < 7) { ym = pm; pm = ymPrev(pm); }
  var cur, prev;
  try { cur = await tradesOf(host, lawd, ym); prev = await tradesOf(host, lawd, pm); }
  catch (e) { res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ error: String(e.message || e), lawd: lawd }); }

  function key(t) { return t.dong + "|" + t.apt + "|" + band(t.area); }
  var byK = {}, prevMax = {}, prevCnt = 0;
  prev.forEach(function (t) { var k = key(t); if (!prevMax[k] || t.amount > prevMax[k]) prevMax[k] = t.amount; });
  prevCnt = prev.length;
  cur.forEach(function (t) {
    var k = key(t), g = byK[k] || (byK[k] = { apt: t.apt, dong: t.dong, band: band(t.area), n: 0, max: null, sum: 0, prices: [] });
    g.n++; g.sum += t.amount; g.prices.push(t.amount);
    if (!g.max || t.amount > g.max.amount) g.max = { amount: t.amount, floor: t.floor, day: t.day, area: t.area };
  });
  var groups = Object.keys(byK).map(function (k) {
    var g = byK[k]; g.prices.sort(function (a, b) { return a - b; });
    g.med = g.prices[Math.floor(g.prices.length / 2)];
    g.prevMax = prevMax[k] || null;
    g.up = g.prevMax ? (g.max.amount / g.prevMax - 1) * 100 : null;
    delete g.prices; delete g.sum;
    return g;
  });
  var top = cur.slice().sort(function (a, b) { return b.amount - a.amount; }).slice(0, 5).map(function (t) {
    return { apt: t.apt, dong: t.dong, amount: t.amount, area: t.area, floor: t.floor, day: t.day, buildYear: t.buildYear };
  });
  var busy = groups.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
  /* 지난달 같은 평형대 최고가를 넘긴 단지 — 지난달에도 거래(2건+)가 있어야 뜻이 있다 */
  var newHigh = groups.filter(function (g) { return g.prevMax && g.up > 0; })
    .sort(function (a, b) { return b.up - a.up; }).slice(0, 8);
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=43200");
  res.status(200).json({ lawd: lawd, ym: ym, prevYm: pm, count: cur.length, prevCount: prevCnt,
    top: top, busy: busy, newHigh: newHigh, fetchedAt: new Date().toISOString() });
}

async function handler(req, res) {
  var q = req.query || {};
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    if (q.kind === "news") return await news(res);
    if (q.kind === "region" && /^\d{5}$/.test(String(q.lawd || ""))) return await region(req, res, String(q.lawd));
    res.status(400).json({ error: "kind=news 또는 kind=region&lawd=5자리코드" });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ error: String(e && e.message || e) });
  }
}
module.exports = handler;
