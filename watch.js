"use strict";
/* ============================================================
   StockMind — 관심 종목 & 뉴스 탭
   - 관심 종목: 기기(localStorage)에 저장. 최근 종가·전일대비·전고점 대비를 한눈에.
   - 뉴스: 관심 종목별 기사 + 시장 뉴스(주요/해외/시황/환율/금리). 제목만 보여주고 클릭하면 원문.
   ============================================================ */

var WATCH_KEY = "stockmind.watch";
var watchState = { quotes: {}, news: {}, market: {}, filter: "", loading: false };

/* ---------- 저장소 ---------- */
function loadWatch() {
  try { return JSON.parse(localStorage.getItem(WATCH_KEY) || "[]"); } catch (e) { return []; }
}
function saveWatch(list) {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {}
}
function isWatched(sym) { return loadWatch().some(function (x) { return x.s === sym; }); }
function toggleWatch(sym, name) {
  var list = loadWatch();
  var i = list.findIndex(function (x) { return x.s === sym; });
  if (i >= 0) list.splice(i, 1);
  else {
    if (list.length >= 20) { setStatus("관심 종목은 최대 20개까지입니다.", true); return false; }
    list.push({ s: sym, n: name || sym, t: Date.now() });
    if (typeof popHit === "function") popHit(sym, "watch");
  }
  saveWatch(list);
  syncWatchBtn();
  if (typeof cloudDirty === "function") cloudDirty();
  return i < 0;
}
function syncWatchBtn() {
  var b = $("watchBtn");
  if (!b) return;
  var on = state.symbol && isWatched(state.symbol);
  b.classList.toggle("added", !!on);
  b.textContent = on ? "★" : "☆";
  b.title = !state.symbol ? "종목을 분석하면 관심 목록에 넣을 수 있습니다"
    : (on ? "관심 목록에서 빼기" : "관심 목록에 넣기") + " (" + loadWatch().length + "개)";
}

/* ---------- 시세 ---------- */
function fetchQuote(sym) {
  if (watchState.quotes[sym] && Date.now() - watchState.quotes[sym].at < 10 * 60 * 1000) {
    return Promise.resolve(watchState.quotes[sym]);
  }
  // 관심 종목 시세는 10년 데이터 중 최근 1년만 쓴다 (스냅샷·브라우저 저장을 그대로 재사용)
  return getChartData(sym, "10y")
    .then(function (p) {
      var rows = p.rows.slice(-260);
      if (rows.length < 2) throw new Error("데이터 부족");
      var last = rows[rows.length - 1], prev = rows[rows.length - 2];
      var hi = -Infinity, lo = Infinity, s = Math.max(0, rows.length - 252);
      for (var i = s; i < rows.length; i++) { if (rows[i].h > hi) hi = rows[i].h; if (rows[i].l < lo) lo = rows[i].l; }
      var eps = drawdownEpisodes(rows, 0.05);
      var peak = -Infinity;
      for (var k = 0; k < rows.length; k++) if (rows[k].c > peak) peak = rows[k].c;
      var q = {
        at: Date.now(), name: p.meta.shortName || p.meta.longName || sym, cur: p.meta.currency || "USD",
        last: last.c, chg: last.c / prev.c - 1, hi52: hi, lo52: lo,
        vsHi: last.c / hi - 1, vsPeak: last.c / peak - 1,
        m1: (function () { var r = returnOverDays(rows, 30); return r ? r.ret : null; })(),
        y1: rows[0] ? last.c / rows[0].c - 1 : null,
        dd: eps.length ? Math.min.apply(null, eps.map(function (e) { return e.dd; })) : 0,
        date: last.t
      };
      watchState.quotes[sym] = q;
      return q;
    });
}

/* ---------- 뉴스 ---------- */
function fetchNews(params) {
  var key = JSON.stringify(params);
  var cached = watchState.news[key];
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return Promise.resolve(cached.items);
  var qs = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
  return fetch("/api/news?" + qs)
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var items = (j && j.items) || [];
      watchState.news[key] = { at: Date.now(), items: items, reason: j && !j.ok ? (j.reason || "ERROR") : null, note: j && j.note };
      if (j && !j.ok) watchState.newsReason = { reason: j.reason, note: j.note };
      return items;
    })
    .catch(function () { return []; });
}

/* 제목에서 시장 영향 키워드를 태그로 뽑는다 */
var NEWS_TAGS = [
  ["금리", /금리|연준|Fed|FOMC|기준금리|인하|인상|한국은행|한은/i],
  ["전쟁·지정학", /전쟁|공습|미사일|이란|이스라엘|우크라|러시아|대만|북한|휴전|긴장/i],
  ["관세·무역", /관세|무역|수출|수입|제재|보복|협상/i],
  ["환율", /환율|달러|원화|엔화|위안|외환/i],
  ["유가·원자재", /유가|원유|OPEC|금값|구리|원자재|천연가스/i],
  ["실적", /실적|영업이익|매출|순이익|어닝|가이던스|컨센서스/i],
  ["반도체·AI", /반도체|HBM|AI|엔비디아|TSMC|파운드리|메모리/i],
  ["정책·정치", /정부|대통령|국회|선거|규제|법안|정책/i]
];
function tagNews(title) {
  var out = [];
  for (var i = 0; i < NEWS_TAGS.length; i++) if (NEWS_TAGS[i][1].test(title)) out.push(NEWS_TAGS[i][0]);
  return out;
}
function fmtNewsTime(s) {
  if (!s) return "";
  // 네이버 검색 API의 pubDate: "Fri, 04 Sep 2026 08:11:00 +0900"
  var d = new Date(s);
  if (!isNaN(d.getTime()) && /[A-Za-z]{3},/.test(String(s))) {
    var k = new Date(d.getTime() + 9 * 3600 * 1000);
    return String(k.getUTCMonth() + 1).padStart(2, "0") + "." + String(k.getUTCDate()).padStart(2, "0") + " " +
      String(k.getUTCHours()).padStart(2, "0") + ":" + String(k.getUTCMinutes()).padStart(2, "0");
  }
  var m = String(s).match(/(\d{4})[.\-\/]?(\d{2})[.\-\/]?(\d{2})[ T]?(\d{2})?:?(\d{2})?/);
  if (!m) return String(s).slice(0, 16);
  return m[2] + "." + m[3] + (m[4] ? " " + m[4] + ":" + (m[5] || "00") : "");
}
function newsItemHtml(it, sym) {
  var tags = tagNews(it.title);
  return '<li class="newsItem">' +
    '<a href="' + it.url + '" target="_blank" rel="noopener">' + it.title + "</a>" +
    '<div class="newsMeta">' +
    (sym ? '<span class="newsSym">' + cmpLabel(sym) + "</span>" : "") +
    (it.press ? "<span>" + it.press + "</span>" : "") +
    (it.time ? "<span>" + fmtNewsTime(it.time) + "</span>" : "") +
    tags.map(function (t) { return '<span class="newsTag">' + t + "</span>"; }).join("") +
    "</div></li>";
}

/* ---------- 렌더링 ---------- */
function renderWatchList() {
  var list = loadWatch();
  var box = $("watchList");
  if (!list.length) {
    box.innerHTML = '<div class="mentalNote" style="margin-top:0">관심 종목이 없습니다. <b>종목</b> 탭에서 종목을 조회한 뒤 ' +
      '<b>☆</b> 버튼을 누르면 여기에 쌓입니다. 최대 20개.</div>';
    $("watchNews").innerHTML = "";
    return;
  }
  var html = "<thead><tr><th>종목</th><th>최근 종가</th><th>전일 대비</th><th>1개월</th><th>1년</th>" +
    "<th>52주 최고 대비</th><th>1년 최대낙폭</th><th></th></tr></thead><tbody>";
  list.forEach(function (w) {
    var q = watchState.quotes[w.s];
    html += '<tr data-sym="' + w.s + '"><td style="text-align:left"><b>' + cmpLabel(w.s) + "</b><br><small style='color:var(--sub)'>" + w.s + "</small></td>";
    if (!q) {
      html += "<td colspan='6' style='color:var(--sub)'>불러오는 중...</td>";
    } else {
      var u = q.cur === "KRW" ? "원" : " " + q.cur;
      html += "<td>" + fmtPrice(q.last) + u + "<br><small style='color:var(--sub)'>" + fmtDate(q.date) + "</small></td>" +
        '<td class="' + pctCls(q.chg) + '">' + fmtPct(q.chg) + "</td>" +
        '<td class="' + pctCls(q.m1 || 0) + '">' + (q.m1 == null ? "-" : fmtPct(q.m1)) + "</td>" +
        '<td class="' + pctCls(q.y1 || 0) + '">' + (q.y1 == null ? "-" : fmtPct(q.y1)) + "</td>" +
        '<td class="' + pctCls(q.vsHi) + '">' + fmtPct(q.vsHi) + "</td>" +
        '<td class="neg">' + fmtPct(q.dd) + "</td>";
    }
    html += "<td style='white-space:nowrap'>" +
      '<button class="chip" data-open="' + w.s + '" title="분석 화면 열기">분석</button> ' +
      '<button class="chip" data-cart="' + w.s + '" title="장바구니 담기">🛒</button> ' +
      '<button class="chip" data-del="' + w.s + '" title="관심 목록에서 빼기">✕</button></td></tr>';
  });
  box.innerHTML = html + "</tbody>";

  Array.prototype.forEach.call(box.querySelectorAll("[data-open]"), function (b) {
    b.onclick = function () {
      var s = b.getAttribute("data-open");
      navTo("single", "analysis");
      $("searchInput").value = s;
      loadSymbol(s);
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll("[data-cart]"), function (b) {
    b.onclick = function () {
      var s = b.getAttribute("data-cart");
      if (cmpState.cart.indexOf(s) >= 0) { setWatchStatus(cmpLabel(s) + "은(는) 이미 장바구니에 있습니다."); return; }
      if (cmpState.cart.length >= 8) { setWatchStatus("장바구니는 최대 8개까지입니다.", true); return; }
      addToCart(s);
      setWatchStatus("장바구니에 담았습니다: " + cmpLabel(s) + " (현재 " + cmpState.cart.length + "개)");
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll("[data-del]"), function (b) {
    b.onclick = function () {
      toggleWatch(b.getAttribute("data-del"));
      renderWatchList();
      renderWatchNews();
    };
  });
}

function setWatchStatus(msg, isErr) {
  var el = $("watchStatus");
  el.textContent = msg || "";
  el.style.color = isErr ? "var(--up)" : "var(--sub)";
}

function loadWatchQuotes() {
  var list = loadWatch();
  if (!list.length) return Promise.resolve();
  setWatchStatus("시세 불러오는 중...");
  return Promise.all(list.map(function (w) {
    return fetchQuote(w.s).catch(function () { return null; });
  })).then(function () {
    setWatchStatus("");
    renderWatchList();
  });
}

function applyNewsFilter(items) {
  var f = watchState.filter;
  if (!f) return items;
  return items.filter(function (it) { return tagNews(it.title).indexOf(f) >= 0; });
}

function renderWatchNews() {
  var list = loadWatch();
  var box = $("watchNews");
  if (!list.length) { box.innerHTML = ""; return; }
  var html = "";
  list.forEach(function (w) {
    var key = JSON.stringify({ type: "stock", q: cmpLabel(w.s), size: 6 });
    var c = watchState.news[key];
    var items = c ? applyNewsFilter(c.items) : null;
    html += '<div class="newsGroup"><div class="newsGroupTitle">' + cmpLabel(w.s) +
      (c ? ' <small style="color:var(--sub)">' + c.items.length + "건</small>" : "") + "</div>";
    if (!c) html += "<div style='font-size:12px;color:var(--sub);padding:4px 0 8px'>불러오는 중...</div>";
    else if (!items.length) html += "<div style='font-size:12px;color:var(--sub);padding:4px 0 8px'>" + newsEmptyMsg(c) + "</div>";
    else html += "<ul class='newsList'>" + items.map(function (it) { return newsItemHtml(it, null); }).join("") + "</ul>";
    html += "</div>";
  });
  box.innerHTML = html;
}

function loadWatchNews() {
  var list = loadWatch();
  if (!list.length) return Promise.resolve();
  renderWatchNews();
  return Promise.all(list.map(function (w) {
    return fetchNews({ type: "stock", q: cmpLabel(w.s), size: 6 });
  })).then(renderWatchNews);
}

var MARKET_CATS = [
  { id: "main", label: "증시 마감", p: { type: "market", cat: "main", size: 15 } },
  { id: "world", label: "미국 증시", p: { type: "market", cat: "world", size: 15 } },
  { id: "market", label: "시황·전망", p: { type: "market", cat: "market", size: 15 } },
  { id: "fx", label: "환율", p: { type: "market", cat: "fx", size: 12 } },
  { id: "rate", label: "금리", p: { type: "market", cat: "rate", size: 12 } }
];
var marketCat = "main";

function newsEmptyMsg(c) {
  if (watchState.filter) return "이 키워드에 해당하는 기사가 없습니다.";
  if (c && c.reason === "NO_KEY") {
    return "<b>뉴스 기능이 아직 켜지지 않았습니다.</b> 운영자가 네이버 검색 API 키(무료)를 등록하면 표시됩니다. " +
      "<small>네이버 클라우드 플랫폼 → NAVER API HUB → Application 생성 → '검색' 추가 → " +
      "발급된 Key ID / Key를 Vercel 환경변수 <b>NAVER_HUB_KEY_ID</b> / <b>NAVER_HUB_KEY</b>로 등록 후 재배포</small>";
  }
  if (c && c.reason) return "기사를 불러오지 못했습니다" + (c.note ? " (" + c.note + ")" : "") + ". 잠시 후 새로고침해 주세요.";
  return "최근 기사가 없습니다.";
}

function renderMarketNews() {
  var cat = MARKET_CATS.filter(function (c) { return c.id === marketCat; })[0];
  var key = JSON.stringify(cat.p);
  var c = watchState.news[key];
  var box = $("marketNews");
  Array.prototype.forEach.call(document.querySelectorAll("#marketCats button"), function (b) {
    b.classList.toggle("active", b.getAttribute("data-cat") === marketCat);
  });
  if (!c) { box.innerHTML = "<div style='font-size:12px;color:var(--sub)'>불러오는 중...</div>"; return; }
  var items = applyNewsFilter(c.items);
  if (!items.length) { box.innerHTML = "<div style='font-size:12px;color:var(--sub)'>" + newsEmptyMsg(c) + "</div>"; return; }
  box.innerHTML = "<ul class='newsList'>" + items.map(function (it) { return newsItemHtml(it, null); }).join("") + "</ul>";
}

function loadMarketNews() {
  var cat = MARKET_CATS.filter(function (c) { return c.id === marketCat; })[0];
  renderMarketNews();
  return fetchNews(cat.p).then(renderMarketNews);
}

function renderNewsFilters() {
  var box = $("newsFilters");
  var tags = NEWS_TAGS.map(function (t) { return t[0]; });
  box.innerHTML = '<button class="chip' + (watchState.filter ? "" : " active") + '" data-f="">전체</button>' +
    tags.map(function (t) {
      return '<button class="chip' + (watchState.filter === t ? " active" : "") + '" data-f="' + t + '">' + t + "</button>";
    }).join("");
  Array.prototype.forEach.call(box.querySelectorAll("[data-f]"), function (b) {
    b.onclick = function () {
      watchState.filter = b.getAttribute("data-f");
      renderNewsFilters();
      renderWatchNews();
      renderMarketNews();
    };
  });
}

/* ---------- 전 종목 현재 위치 (recent.json 재활용 — 추가 API 호출 없음) ---------- */
var mapState = { rows: null, filter: "all", sortKey: "vsHi", sortAsc: true };

function classifySymbol(sym) {
  if (/\.KS$|\.KQ$/.test(sym)) return "kr";
  if (/^\^/.test(sym)) return "idx";
  if (/-USD$|=X$|=F$/.test(sym)) return "alt";
  if (/^(SPY|QQQ|VOO|VTI|IVV|DIA|IWM|GLD|SLV|TLT|IEF|SHY|BND|AGG|SCHD|JEPI|VNQ|EFA|EEM|ARKK|SOXX|SMH|XL[A-Z]|KODEX|TIGER|DBC|USO)/.test(sym)) return "idx";
  return "us";
}

function buildMarketRows(recent) {
  var out = [];
  Object.keys(recent.symbols || {}).forEach(function (sym) {
    var d = recent.symbols[sym];
    var c = d.c || [], v = d.v || [], n = c.length;
    if (n < 22 || c[n - 1] == null) return;
    var last = c[n - 1];
    var m1 = last / c[Math.max(0, n - 22)] - 1;
    var m3 = last / c[0] - 1;                                  // 90일 파일이라 사실상 약 3~4개월
    var hi = d.meta && d.meta.fiftyTwoWeekHigh;
    var vsHi = hi > 0 ? last / hi - 1 : null;
    var rsi = typeof rsiWilder === "function" && n > 15 ? rsiWilder(c, 14) : null;
    var v5 = 0, v20 = 0, i;
    for (i = n - 5; i < n; i++) v5 += v[i] || 0;
    for (i = Math.max(0, n - 25); i < n - 5; i++) v20 += v[i] || 0;
    v5 /= 5; v20 /= Math.max(1, Math.min(20, n - 5));
    out.push({
      sym: sym, name: (d.meta && (d.meta.shortName || d.meta.longName)) || sym,
      cur: (d.meta && d.meta.currency) || "", grp: classifySymbol(sym),
      last: last, m1: m1, m3: m3, vsHi: vsHi, rsi: rsi,
      volX: v20 > 0 ? v5 / v20 : null,
      lastT: (d.t && d.t.length ? d.t[d.t.length - 1] * 1000 : null)
    });
  });
  return out;
}

var MAP_COLS = [
  { k: "vsHi", label: "52주 최고 대비", asc: true },
  { k: "m1", label: "1개월", asc: false },
  { k: "m3", label: "3개월", asc: false },
  { k: "rsi", label: "RSI", asc: true },
  { k: "volX", label: "거래량", asc: false }
];

function renderMarketMap() {
  var box = $("marketMap");
  if (!box) return;
  var rows = mapState.rows;
  if (!rows) { box.innerHTML = ""; return; }
  var list = rows.filter(function (r) { return mapState.filter === "all" || r.grp === mapState.filter; });
  var k = mapState.sortKey, asc = mapState.sortAsc;
  list.sort(function (a, b) {
    var x = a[k], y = b[k];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return asc ? x - y : y - x;
  });
  var html = "<thead><tr><th>종목</th><th>최근 종가</th>" + MAP_COLS.map(function (c) {
    var on = c.k === mapState.sortKey;
    return '<th class="mapSort' + (on ? " on" : "") + '" data-sk="' + c.k + '">' + c.label + (on ? (mapState.sortAsc ? " ▲" : " ▼") : "") + "</th>";
  }).join("") + "<th></th></tr></thead><tbody>";
  list.forEach(function (r) {
    var u = r.cur === "KRW" ? "원" : (r.cur ? " " + r.cur : "");
    var rsiCls = r.rsi == null ? "" : r.rsi <= 30 ? "down" : r.rsi >= 70 ? "up" : "";
    html += '<tr><td style="text-align:left"><b>' + cmpLabel(r.sym) + "</b><br><small style='color:var(--sub)'>" + r.sym + "</small></td>" +
      "<td>" + fmtPrice(r.last) + u + "</td>" +
      '<td class="' + (r.vsHi == null ? "" : pctCls(r.vsHi)) + '"><b>' + (r.vsHi == null ? "-" : fmtPct(r.vsHi)) + "</b></td>" +
      '<td class="' + pctCls(r.m1) + '">' + fmtPct(r.m1) + "</td>" +
      '<td class="' + pctCls(r.m3) + '">' + fmtPct(r.m3) + "</td>" +
      '<td><span class="' + (rsiCls === "down" ? "pos" : rsiCls === "up" ? "neg" : "") + '">' + (r.rsi == null ? "-" : r.rsi.toFixed(0)) + "</span></td>" +
      "<td>" + (r.volX == null ? "-" : (r.volX >= 2 ? "<b class='neg'>" + r.volX.toFixed(1) + "배</b>" : r.volX.toFixed(1) + "배")) + "</td>" +
      "<td style='white-space:nowrap'><button class='chip' data-mopen='" + r.sym + "'>분석</button> " +
      '<button class="chip" data-mwatch="' + r.sym + '">' + (isWatched(r.sym) ? "★" : "☆") + "</button></td></tr>";
  });
  box.innerHTML = html + "</tbody>";
  $("mapStatus").textContent = list.length + "개 표시 · " +
    (mapState.rows._gen ? mapState.rows._gen.slice(0, 10) + " 기준" : "");

  Array.prototype.forEach.call(box.querySelectorAll(".mapSort"), function (th) {
    th.onclick = function () {
      var sk = th.getAttribute("data-sk");
      if (mapState.sortKey === sk) mapState.sortAsc = !mapState.sortAsc;
      else {
        mapState.sortKey = sk;
        var col = MAP_COLS.filter(function (c) { return c.k === sk; })[0];
        mapState.sortAsc = col ? col.asc : true;
      }
      renderMarketMap();
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll("[data-mopen]"), function (b) {
    b.onclick = function () {
      var s = b.getAttribute("data-mopen");
      navTo("single", "analysis");
      $("searchInput").value = s;
      loadSymbol(s);
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll("[data-mwatch]"), function (b) {
    b.onclick = function () {
      toggleWatch(b.getAttribute("data-mwatch"));
      b.textContent = isWatched(b.getAttribute("data-mwatch")) ? "★" : "☆";
      renderWatchList();
    };
  });
}

function loadMarketMap() {
  if (mapState.rows) { renderMarketMap(); return; }
  if (typeof fetchRecent !== "function") { $("mapStatus").textContent = "데이터 준비 중입니다."; return; }
  $("mapStatus").textContent = "전 종목 데이터 불러오는 중... (한 번만 받습니다)";
  dataReady().then(function () { return fetchRecent(); }).then(function (recent) {
    if (!recent || !recent.symbols) {
      $("mapStatus").textContent = "사전 수집 데이터가 아직 없습니다. 내일 아침 자동 수집 후 표시됩니다.";
      return;
    }
    var rows = buildMarketRows(recent);
    rows._gen = recent.generated || "";
    mapState.rows = rows;
    renderMarketMap();
  }).catch(function () {
    $("mapStatus").textContent = "데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.";
  });
}

Array.prototype.forEach.call(document.querySelectorAll("#mapFilters [data-mf]"), function (b) {
  b.onclick = function () {
    mapState.filter = b.getAttribute("data-mf");
    Array.prototype.forEach.call(document.querySelectorAll("#mapFilters [data-mf]"), function (x) {
      x.classList.toggle("active", x === b);
    });
    renderMarketMap();
  };
});

/* 관심 탭 하위 화면: 관심 종목 / 전체 종목 / 뉴스 */
var watchPane = "list";
function switchWatchPane(p, fromHistory) {
  if (["list", "map", "news"].indexOf(p) < 0) p = "list";
  if (!fromHistory && p !== watchPane && typeof pushPaneState === "function") pushPaneState({ wp: p });
  watchPane = p;
  ["list", "map", "news"].forEach(function (k) { $("wp-" + k).classList.toggle("hidden", k !== p); });
  Array.prototype.forEach.call(document.querySelectorAll("#watchTabs [data-wp]"), function (b) {
    b.classList.toggle("active", b.getAttribute("data-wp") === p);
  });
  // 보이는 화면의 데이터만 불러온다 (뉴스·전체 종목은 처음 열 때 한 번)
  if (p === "map") loadMarketMap();
  if (p === "news") { renderNewsFilters(); loadWatchNews(); loadMarketNews(); }
}
Array.prototype.forEach.call(document.querySelectorAll("#watchTabs [data-wp]"), function (b) {
  b.onclick = function () { switchWatchPane(b.getAttribute("data-wp")); window.scrollTo({ top: 0, behavior: "smooth" }); };
});

/* 탭 진입 시 */
function renderWatchTab(force) {
  renderNewsFilters();
  renderWatchList();
  if (force) { watchState.quotes = {}; watchState.news = {}; }
  loadWatchQuotes();
  if (force) mapState.rows = null;
  if (watchPane === "map") loadMarketMap();
  if (watchPane === "news") { loadWatchNews(); loadMarketNews(); }
}

/* ---------- 이벤트 ---------- */
$("marketCats").innerHTML = MARKET_CATS.map(function (c) {
  return '<button class="chip" data-cat="' + c.id + '">' + c.label + "</button>";
}).join("");
Array.prototype.forEach.call(document.querySelectorAll("#marketCats button"), function (b) {
  b.onclick = function () { marketCat = b.getAttribute("data-cat"); loadMarketNews(); };
});
$("watchRefresh").onclick = function () { renderWatchTab(true); };
$("watchExport").onclick = function () {
  var url = location.origin + location.pathname + buildShareHash("full");
  var ok = false;
  try {
    var ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    ok = document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) { ok = false; }
  if (!ok && navigator.clipboard) { navigator.clipboard.writeText(url); ok = true; }
  setWatchStatus(ok
    ? "링크를 복사했습니다. 다른 기기·브라우저에서 이 링크를 열면 관심 종목 " + loadWatch().length + "개와 장바구니·시뮬 설정이 그대로 복원됩니다."
    : "복사에 실패했습니다. 브라우저 주소창의 링크를 직접 복사해 주세요.", !ok);
};
$("watchBtn").onclick = function () {
  if (!state.symbol) { setStatus("먼저 종목을 분석해 주세요.", true); return; }
  var added = toggleWatch(state.symbol, state.meta.shortName || state.meta.longName || state.symbol);
  setStatus((added ? "관심 목록에 넣었습니다: " : "관심 목록에서 뺐습니다: ") + cmpLabel(state.symbol) +
    " (현재 " + loadWatch().length + "개)");
};
