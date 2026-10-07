/* ══ v9.9 인포그래픽 카드 — 지도·타일·막대·타임라인으로 '한눈에' (확산 순서 · 확산·대장 탭) ══
   숫자는 전부 rpData()/rpCorrData()/rpLeadData()/RP_REFS 에서 그대로 가져온다(지어낸 숫자 없음).
   지도 = v9_maps.js(RP_MAP) 통계청 2018 시군구 경계. 지도 위 글자는 SVG가 아니라 HTML로 얹는다(이미지 저장 시 글꼴 유지). */
var IF_COL = { s: ["#ff4d5e", "#ffa62b", "#22c55e", "#3b8bff"], g: ["#a76bff", "#ffa62b", "#22c55e", "#3b8bff"] };
function ifEsc(s) { return escHtml(String(s == null ? "" : s)); }
function ifPct(v, dg) { if (v == null) return "–"; var x = dg == null ? 1 : dg; return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(x) + "%"; }
function ifShort(nm) { return typeof rpShort === "function" ? rpShort(nm.replace(/^(서울|경기|인천) /, "")) : nm; }
/* 카드 틀 — 쪽 번호는 덱을 다 만든 뒤 채운다 */
function ifCard(o) {
  if (typeof CH !== "undefined" && CH.cap && o.cap) CH.cap.push(o.cap);
  var cls = "chcard chc-info" + (o.cover ? " if-cover" : "") + (o.dark ? " if-dark" : "");
  var bgx = o.bg || (ifImg("panel") ? '<div class="if-photo dim" style="background-image:url(' + ifImg("panel") + ')"></div>' : "");
  return '<div class="' + cls + '">' + bgx +
    '<div class="if-top"><span class="if-idx"></span>' + (o.title ? '<span class="if-title">' + o.title + "</span>" : "") + "</div>" +
    '<div class="if-body">' + o.body + "</div>" +
    '<div class="if-foot"><span>' + ifEsc(o.src || "국토부 실거래 · 우상향연구소 집계 · 투자 권유 아님") + '</span><b>@uphill.lab</b></div></div>';
}
/* 야경 스카이라인 배경(그림) — 실제 건물·로고를 본뜨지 않은 일반 실루엣 */
/* ── 사진·그림 자리(ChatGPT 등으로 만든 이미지를 data/img 에 올리면 그림 대신 씀) ── */
var IF_IMG = { cover: "data/img/cover.jpg", outro: "data/img/outro.jpg", panel: "data/img/panel.jpg", lead: "data/img/apt_lead.png", mid: "data/img/apt_mid.png", map: "data/img/map_bg.jpg" }, IF_IMG_OK = {}, IF_IMG_TRY = false;
function ifImgLoad(cb) {
  if (IF_IMG_TRY) return; IF_IMG_TRY = true;
  var keys = Object.keys(IF_IMG), left = keys.length;
  keys.forEach(function (k) { var im = new Image(); im.onload = function () { IF_IMG_OK[k] = true; if (--left === 0 && cb) cb(); }; im.onerror = function () { if (--left === 0 && cb) cb(); }; im.src = IF_IMG[k] + "?v=" + Math.floor(Date.now() / 864e5); });
}
function ifImg(k) { return IF_IMG_OK[k] ? IF_IMG[k] + "?v=" + Math.floor(Date.now() / 864e5) : null; }
function ifBg(k, seed) { var u = ifImg(k); return u ? '<div class="if-photo" style="background-image:url(' + u + ')"></div><div class="if-shade"></div>' : ifSky(seed); }
function ifSky(seed) {
  var r = seed || 7, rnd = function () { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  var b = "", win = "", x = 0;
  while (x < 360) {
    var w = 14 + Math.floor(rnd() * 22), h = 34 + Math.floor(rnd() * 70), y = 340 - h;
    if (x > 240 && x < 270) { h = 150; y = 190; w = 16; }
    b += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (h + 40) + '" fill="#0d1830"/>';
    for (var wy = y + 6; wy < 336; wy += 8) for (var wx = x + 3; wx < x + w - 3; wx += 6) if (rnd() < 0.32) win += '<rect x="' + wx + '" y="' + wy + '" width="2.4" height="3" fill="#ffd27a" opacity="' + (0.45 + rnd() * 0.5).toFixed(2) + '"/>';
    x += w + 1;
  }
  return '<svg class="if-sky" viewBox="0 0 360 450" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ifsk' + seed + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14254a"/><stop offset=".55" stop-color="#3d4f86"/><stop offset=".78" stop-color="#e59b5d"/><stop offset="1" stop-color="#2a3558"/></linearGradient>' +
    '<linearGradient id="ifrv' + seed + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#253b6e"/><stop offset="1" stop-color="#0b1430"/></linearGradient></defs>' +
    '<rect width="360" height="450" fill="url(#ifsk' + seed + ')"/>' + b + win +
    '<rect y="338" width="360" height="112" fill="url(#ifrv' + seed + ')"/><path d="M0,346 Q90,338 180,346 T360,344" stroke="#ffcf7a" stroke-width="1.2" fill="none" opacity=".5"/></svg>';
}
/* 지도 — fill(nm) 이 색을 돌려주면 칠하고, label(nm) 이 글자를 돌려주면 그 자리에 얹는다 */
/* 색 어둡게/밝게 — #rrggbb(aa) · rgba() 모두 */
function ifShade(c, f) {
  var r, g, b, a = 1, m;
  if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c))) { r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16); if (m[2]) a = parseInt(m[2], 16) / 255; }
  else if ((m = /rgba?\(([^)]+)\)/.exec(c))) { var q = m[1].split(",").map(Number); r = q[0]; g = q[1]; b = q[2]; if (q.length > 3) a = q[3]; }
  else return c;
  var t = function (x) { return Math.max(0, Math.min(255, Math.round(f < 0 ? x * (1 + f) : x + (255 - x) * f))); };
  return "rgba(" + t(r) + "," + t(g) + "," + t(b) + "," + a + ")";
}
/* 입체 지도 — 기울여(세로 0.72) 눕히고, 지역마다 depth(nm) 만큼 솟아오르게. 뒤(위쪽)부터 그려 앞이 덮는다 */
var IF_MAPN = 0;
function ifMap(kind, w, fill, label, opt) {
  opt = opt || {};
  var M = RP_MAP[kind], vb = M.vb, K = 0.72, dmax = 0, id = "ifm" + (++IF_MAPN);
  var names = Object.keys(M.p).sort(function (x, y) { return M.c[x][1] - M.c[y][1]; });
  var dep = {}; names.forEach(function (nm) { dep[nm] = opt.depth ? opt.depth(nm) : (fill(nm) ? 10 : 4); if (dep[nm] > dmax) dmax = dep[nm]; });
  var T = dmax + 6, VH = Math.round(vb[3] * K + T + 16), h = Math.round(w * VH / vb[2]), body = "", labs = "";
  var sw = kind === "seoul" ? 1.6 : 1;
  names.forEach(function (nm) {
    var f = fill(nm) || "rgba(150,165,190,.35)", d = dep[nm], side = ifShade(f, -0.45), st = Math.max(2, Math.round(d / 6));
    for (var k = 0; k < d; k += st) body += '<path d="' + M.p[nm] + '" fill="' + side + '" transform="translate(0,' + (T - k) + ') scale(1,' + K + ')"/>';
    body += '<path d="' + M.p[nm] + '" fill="' + f + '" stroke="rgba(255,255,255,.85)" stroke-width="' + sw + '" stroke-linejoin="round" transform="translate(0,' + (T - d) + ') scale(1,' + K + ')"/>' +
      '<path d="' + M.p[nm] + '" fill="url(#' + id + 'g)" transform="translate(0,' + (T - d) + ') scale(1,' + K + ')"/>';
    var t = label ? label(nm) : null;
    if (t) { var c = M.c[nm]; labs += '<span class="if-ml" style="left:' + (c[0] / vb[2] * 100).toFixed(1) + "%;top:" + ((c[1] * K + T - d) / VH * 100).toFixed(1) + '%">' + t + "</span>"; }
  });
  if (opt.river && kind === "seoul") body += '<path d="M8,268 C70,262 120,250 175,262 C230,276 270,258 320,250 C380,240 440,236 500,226 C540,220 575,212 598,200" stroke="#7fd0ff" stroke-width="7" fill="none" opacity=".8" stroke-linecap="round" transform="translate(0,' + (T - 12) + ') scale(1,' + K + ')" filter="url(#' + id + 'w)"/>';
  if (opt.seoulBlob && kind === "metro") { var c0 = M.c["서울 중구"]; labs += '<span class="if-ml if-seoul" style="left:' + (c0[0] / vb[2] * 100).toFixed(1) + "%;top:" + ((c0[1] * K + T - 8) / VH * 100).toFixed(1) + '%">서울</span>'; }
  var defs = '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".55" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>' +
    '<filter id="' + id + 's" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="14"/></filter><filter id="' + id + 'w"><feGaussianBlur stdDeviation="1.2"/></filter></defs>';
  var shadow = '<ellipse cx="' + vb[2] / 2 + '" cy="' + (vb[3] * K + T + 4) + '" rx="' + vb[2] * 0.46 + '" ry="16" fill="#000" opacity=".45" filter="url(#' + id + 's)"/>';
  return '<div class="if-map" style="width:' + w + "px;height:" + h + 'px">' + (ifImg("map") ? '<div class="if-mapbg" style="background-image:url(' + ifImg("map") + ')"></div>' : "") + '<svg viewBox="0 0 ' + vb[2] + " " + VH + '" width="' + w + '" height="' + h + '">' + defs + shadow + body + "</svg>" + labs + "</div>";
}
/* 단계 → 지도 이름 연결 (2018 경계: 화성·부천은 한 덩어리 → 동탄구·원미구 단계로 칠함) */
function ifStageOf(w, nm) {
  var st = RP_STAGES[w];
  for (var i = 0; i < st.length; i++) for (var j = 0; j < st[i][1].length; j++) { var s = st[i][1][j]; if (s === nm || s.indexOf(nm + " ") === 0) return i; }
  return -1;
}
function ifShortStage(n) { return { "하남·광명·수지·평촌": "하남·광명권", "수원·동탄·구리권": "수원·동탄권" }[n] || n; }
function ifStatus(a) { return a.R != null ? '<em class="if-ok">' + rpYm(a.R) + " 회복</em>" : '<em class="if-no">아직 ' + ifPct(a.vs) + "</em>"; }
function ifKey(t) { return '<div class="if-key">' + t + "</div>"; }
function ifDeck(list) {
  var n = list.length;
  return list.map(function (h, i) { return h.replace('<span class="if-idx"></span>', '<span class="if-idx">' + (i + 1) + "/" + n + "</span>"); });
}
function ifOutro() {
  var ico = function (d) { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>"; };
  return ifCard({ cover: true, dark: true, bg: ifBg("outro", 31), src: "참고 자료이며 투자 권유가 아닙니다",
    body: '<div class="if-out"><b class="if-brand">uphill.lab</b><p>숫자로 보는 부동산,<br>매일 새벽 새로 뽑습니다</p><div class="if-follow"><span class="if-av"></span><b>@uphill.lab</b><em>팔로우</em></div>' +
      '<div class="if-ico"><div>' + ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') + "<span>매일 새벽<br>업데이트</span></div><div>" + ico('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>') + "<span>실거래로 보는<br>시장 흐름</span></div><div>" + ico('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>') + "<span>궁금한 동네<br>댓글로</span></div></div></div>" });
}
function ifCoverCard(t1, t2, t3, sub, items, basis) {
  return ifCard({ cover: true, dark: true, bg: ifBg("cover", 11), src: basis,
    body: '<div class="if-cv"><h2>' + t1 + "<br><mark>" + t2 + "</mark>" + (t3 ? "<br>" + t3 : "") + "</h2><p>" + sub + "</p>" +
      (items ? '<ol class="if-toc">' + items.map(function (x, i) { return "<li><i>" + (i + 1) + "</i>" + x + "</li>"; }).join("") + "</ol>" : "") + '<b class="if-brand sm">uphill.lab</b></div>' });
}
/* ── 확산 순서 덱 ── */
function ifRippleDeck() {
  var D = rpData(); if (!D || !D.seoul.length) return [];
  var basis = "국토부 실거래 ~" + D.lastYm + " · 투자 권유 아님", C = [];
  C.push(ifCoverCard("서울·경기", "집값이 퍼지는", "순서", "어디서 먼저 오르고, 어디로 번질까?", ["서울 안, 퍼지는 순서", "서울 → 경기, 퍼지는 순서", "권역·축별 경로", "튀는 값 · 최근 1년", "2017~2021 타임라인", "KB 지수 지도"], basis));
  function legend(list, col) {
    return '<div class="if-leg">' + list.map(function (a, i) { return '<div class="stk"><i style="background:' + col[i] + '"></i><b>' + ifEsc(a.nm) + "</b>" + ifStatus(a) + "</div>"; }).join("") + "</div>";
  }
  /* 서울 지도 */
  C.push(ifCard({ title: "서울 안, 집값이 퍼지는 순서", src: basis,
    body: '<div class="if-chain">' + D.seoul.map(function (a, i) { return '<span style="color:' + IF_COL.s[i] + '">' + ifEsc(a.nm) + "</span>"; }).join(" → ") + "</div>" +
      ifMap("seoul", 300, function (nm) { var i = ifStageOf("seoul", nm); return i >= 0 ? IF_COL.s[i] : null; }, function (nm) { return ifEsc(nm.replace(/^서울 /, "").replace(/구$/, "")); }, { river: true, depth: function (nm) { var i = ifStageOf("seoul", nm); return [40, 28, 17, 8][i] || 4; } }) +
      legend(D.seoul, IF_COL.s) }));
  /* 경기 지도 */
  C.push(ifCard({ title: "서울에서 경기로 퍼지는 순서", src: basis,
    body: '<div class="if-chain">' + D.gg.map(function (a, i) { return '<span style="color:' + IF_COL.g[i] + '">' + ifEsc(a.nm) + "</span>"; }).join(" → ") + "</div>" +
      '<div class="if-row">' + ifMap("metro", 192, function (nm) { if (/^서울/.test(nm)) return "rgba(200,210,230,.55)"; var i = ifStageOf("gg", nm); return i >= 0 ? (/화성시$|부천시$/.test(nm) ? IF_COL.g[i] + "66" : IF_COL.g[i]) : null; }, null, { seoulBlob: true, depth: function (nm) { if (/^서울/.test(nm)) return 5; var i = ifStageOf("gg", nm); return i >= 0 ? [34, 22, 13, 7][i] : 3; } }) +
      '<div class="if-leg col">' + D.gg.map(function (a, i) { return '<div><i style="background:' + IF_COL.g[i] + '"></i><b>' + (i + 1) + ". " + ifEsc(a.nm) + "</b>" + ifStatus(a) + "</div>"; }).join("") + '<p class="if-note">화성은 동탄만 3단계(옅은 색) · 이름 목록은 기본 카드</p></div></div>' }));
  /* 권역·축별 경로 — 알약 사슬 */
  ["seoul", "gg"].forEach(function (w) {
    var CD = rpCorrData(w, D.last), col = ["#e5484d", "#7c5cf6", "#22a06b", "#f59e0b", "#3b82f6", "#0ea5a4"];
    C.push(ifCard({ title: w === "seoul" ? "서울 권역별, 어디서 어디로" : "서울에서 경기로, 축별 경로", src: basis,
      body: ifKey("<b>왼쪽부터 먼저 오른 곳</b>(2016~21 급등 시작 달) · 점선 = 혼자 튄 곳") + '<div class="if-paths' + (w === "gg" ? " g2" : "") + '">' + CD.map(function (c, ci) {
        return '<div class="if-path" style="--c:' + col[ci % col.length] + '"><b>' + ifEsc(c.nm) + "</b><div>" + c.g.map(function (g) { return '<span class="if-pill' + (g.odd ? " odd" : "") + '">' + ifEsc(rpShort(g.nm)) + (g.odd ? "*" : "") + "<small>" + (g.key != null ? rpYm(g.key).slice(2) : "–") + "</small></span>"; }).join('<i class="if-arr">→</i>') + "</div></div>";
      }).join("") + "</div>" }));
  });
  /* 튀는 값 + 최근 1년 */
  var odd = []; ["seoul", "gg"].forEach(function (w) { rpCorrData(w, D.last).forEach(function (c) { c.g.forEach(function (g) { if (g.odd) odd.push(g); }); }); });
  var blip = odd.filter(function (g) { return g.odd.type === "blip"; }), s4 = D.seoul[D.seoul.length - 1], g3 = D.gg[2];
  C.push(ifCard({ title: "튀는 값, 그리고 최근 1년", src: basis,
    body: '<div class="if-2box"><div class="if-box red"><h4>1년 반 넘게 앞선 곳 <b>' + odd.length + "</b></h4><p>" + odd.map(function (g) { return ifEsc(rpShort(g.nm)); }).join(", ") + '</p><small>같은 축보다 급등이 18개월 이상 빨랐던 곳</small></div>' +
      '<div class="if-box blue"><h4>그중 착시 <b>' + blip.length + "</b></h4><p>" + (blip.length ? blip.map(function (g) { return "<strong>" + ifEsc(rpShort(g.nm)) + "</strong>" + (g.note ? "<br><small>" + ifEsc(g.note.s) + "</small>" : ""); }).join("<br>") : "없음") + "</p></div></div>" +
      '<div class="if-sub">회복은 차례로, <b>최근 1년은 모두 상승</b></div>' +
      '<div class="if-2box"><div class="if-tile"><span>서울 4단계 · ' + ifEsc(s4.nm) + "</span><b class=\"up\">" + ifPct(s4.y1) + "</b><small>최근 1년 · 고점 대비 " + ifPct(s4.vs) + '</small></div><div class="if-tile"><span>경기 3단계 · ' + ifEsc(g3.nm) + "</span><b class=\"up\">" + ifPct(g3.y1) + "</b><small>최근 1년 · 고점 대비 " + ifPct(g3.vs) + "</small></div></div>" +
      ifKey("고점은 아직이지만, 늦은 단계도 지금 오르는 중") }));
  /* 지난 상승기 타임라인 — 점 = 상승 시작 달, 오른쪽 = 2021 한 해 */
  var all = D.seoul.map(function (a, i) { return [a, IF_COL.s[i], "서울" + a.no]; }).concat(D.gg.map(function (a, i) { return [a, IF_COL.g[i], "경기" + a.no]; }));
  var t0 = rpIdx(2017, 1), t1 = rpIdx(2021, 1), mx = Math.max.apply(null, all.map(function (x) { return x[0].y21 || 0; }));
  C.push(ifCard({ title: "2017~2021년에도 같은 순서였다", src: basis,
    body: ifKey("<b>점 = 상승이 시작된 달</b>(전년 대비 +10% 3개월) · 막대 = 2021년 한 해 상승률") +
      '<div class="if-tl"><div class="if-tl-ax"><span></span><div>' + [2017, 2018, 2019, 2020, 2021].map(function (y) { return "<em>" + y + "</em>"; }).join("") + "</div><span>2021 한 해</span></div>" +
      all.map(function (x) {
        var a = x[0], p = a.A != null ? Math.max(0, Math.min(1, (a.A - t0) / (t1 - t0))) * 100 : null;
        return '<div class="if-tl-r"><span><i style="background:' + x[1] + '"></i>' + ifEsc(x[2]) + " " + ifEsc(ifShortStage(a.nm)) + '</span><div class="if-tl-tr">' + (p != null ? '<b style="left:' + p.toFixed(1) + "%;background:" + x[1] + '"></b><small style="left:' + p.toFixed(1) + '%">' + rpYm(a.A).slice(2) + "</small>" : "") + '</div><span class="if-tl-v"><u style="width:' + ((a.y21 || 0) / mx * 100).toFixed(0) + "%;background:" + x[1] + '"></u><em>' + ifPct(a.y21, 0) + "</em></span></div>";
      }).join("") + "</div>" + '<p class="if-note big">서울 2017년 출발 → 경기 외곽 2020년 출발, 늦게 출발한 곳이 마지막 해에 크게</p>' }));
  /* KB 지수 지도 */
  var K = RP_REFS.kb, kv = {};
  K.seUp.forEach(function (x) { kv["서울 " + x[0]] = x[1]; }); K.seDn.forEach(function (x) { kv["서울 " + x[0]] = x[1]; });
  var dn = {}; K.seDn.forEach(function (x) { dn["서울 " + x[0]] = 1; });
  C.push(ifCard({ title: "KB 지수, 서울 어디까지 회복했나", src: K.src + " · " + K.asOf + " · 투자 권유 아님",
    body: ifKey("<b>빨강 = 이미 전고점 위</b>, <b>파랑 = 아직 아래</b> → 노도강·금천·중랑이 마지막 차례") +
      ifMap("seoul", 304, function (nm) { var v = kv[nm]; if (dn[nm]) return "rgba(59,139,255," + (0.45 + Math.min(1, -v / 15) * 0.6).toFixed(2) + ")"; if (v != null) return "rgba(255,77,94," + (0.55 + Math.min(1, v / 32) * 0.45).toFixed(2) + ")"; return "rgba(255,77,94,.45)"; },
        function (nm) { var v = kv[nm], s = ifEsc(nm.replace(/^서울 /, "").replace(/구$/, "")); return v != null ? s + "<br><b>" + ifPct(v, 0) + "</b>" : ""; }, { river: true, depth: function (nm) { var v = kv[nm]; return dn[nm] ? 5 : v != null ? 10 + v * 0.9 : 12; } }) +
      '<div class="if-chips"><b>경기</b>' + K.ggUp.map(function (x) { return '<span class="up">' + ifEsc(x[0].replace(/^(성남|용인|고양) /, "")) + " " + ifPct(x[1]) + "</span>"; }).join("") + K.ggDn.slice(0, 2).map(function (x) { return '<span class="dn">' + ifEsc(x[0].replace(/^(성남|용인|고양) /, "")) + " " + ifPct(x[1]) + "</span>"; }).join("") + "</div>" + '<p class="if-note">서울 ' + K.seUpN + '개 구가 고점 위 · 숫자 없는 곳은 상위 10 밖</p>' }));
  C.push(ifOutro());
  return ifDeck(C);
}
/* ── 확산·대장 덱 ── */
function ifLeadDeck() {
  var D = rpLeadData(); if (!D) return [];
  var basis = "국토부 실거래 · 대장 = 500세대↑·20년 이내 ㎡당가 상위 3곳(84㎡) · 투자 권유 아님", C = [], s4 = D.seoul[3], g3 = D.gg[2];
  C.push(ifCoverCard("중위가로는 아직,", "대장은 이미 신고가", "", "중위가는 노도강 " + ifPct(s4.vs) + ", 수원권 " + ifPct(g3.vs) + "이지만<br>대장은 " + Math.round(s4.lp) + "%, " + Math.round(g3.lp) + "%가 신고가", null, basis));
  function tiles(list, col) { return '<div class="if-tiles">' + list.map(function (a, i) { return '<div style="--c:' + col[i] + '"><span>' + ifEsc(a.nm) + "</span><b>" + a.lr + "<small>/" + a.lt + "</small></b><em>" + (a.lp != null ? Math.round(a.lp) + "%" : "–") + "</em></div>"; }).join("") + "</div>"; }
  function shareOf(nm) { var L = rpLeadOf(nm); if (!L) return null; var c = L.filter(function (t) { return !t.nb; }); if (!c.length) return null; return c.filter(function (t) { return t.rec; }).length / c.length; }
  function shareCol(v) { return v == null ? null : v >= 0.99 ? "#ff4d5e" : v >= 0.6 ? "#ff9aa2" : v >= 0.3 ? "#8fb8ff" : "#3b8bff"; }
  var legend = '<div class="if-leg row"><div><i style="background:#ff4d5e"></i>3곳 모두</div><div><i style="background:#ff9aa2"></i>2곳</div><div><i style="background:#8fb8ff"></i>1곳</div><div><i style="background:#3b8bff"></i>0곳</div><div><i style="background:rgba(150,165,190,.5)"></i>대상 아님</div></div>';
  C.push(ifCard({ title: "서울 대장 3곳, 신고가 찍었나", src: basis,
    body: tiles(D.seoul, IF_COL.s) + ifMap("seoul", 304, function (nm) { return shareCol(shareOf(nm)); }, function (nm) { return ifEsc(nm.replace(/^서울 /, "").replace(/구$/, "")); }, { river: true, depth: function (nm) { var v = shareOf(nm); return v == null ? 3 : 6 + v * 28; } }) + legend }));
  C.push(ifCard({ title: "경기 대장 3곳, 신고가 찍었나", src: basis,
    body: tiles(D.gg, IF_COL.g) + '<div class="if-row">' + ifMap("metro", 192, function (nm) { if (/^서울/.test(nm)) return "rgba(200,210,230,.55)"; if (ifStageOf("gg", nm) < 0) return null; var full = RP_STAGES.gg.reduce(function (z, s) { return z.concat(s[1]); }, []).filter(function (s) { return s === nm || s.indexOf(nm + " ") === 0; })[0]; var sc = shareCol(shareOf(full)); return sc && /화성시$|부천시$/.test(nm) ? sc + "66" : sc; }, null, { seoulBlob: true, depth: function (nm) { if (/^서울/.test(nm)) return 5; return ifStageOf("gg", nm) >= 0 ? 16 : 3; } }) +
      '<div class="if-leg col sm">' + D.gg.map(function (a, i) { return '<div><i style="background:' + IF_COL.g[i] + '"></i><b>' + ifEsc(a.nm) + "</b><small>" + a.lr + "/" + a.lt + " 신고가</small></div>"; }).join("") + "</div></div>" + legend }));
  function bars(list, col, nm) { return '<div class="if-bars"><h4>' + nm + " 대장 <small>신고가 비율</small></h4>" + list.map(function (a, i) { return '<div><span>' + ifEsc(a.nm) + '</span><i><u style="width:' + (a.lp || 0).toFixed(0) + "%;background:" + col[i] + '"></u></i><b>' + (a.lp != null ? Math.round(a.lp) + "%" : "–") + "</b></div>"; }).join("") + "</div>"; }
  C.push(ifCard({ title: "대장으로 봐도 순서는 같다", src: basis,
    body: '<div class="if-2box">' + bars(D.seoul, IF_COL.s, "서울") + bars(D.gg, IF_COL.g, "경기") + "</div>" +
      '<div class="if-tip"><b>대장으로 봐도 같은 순서</b><p>서울 ' + D.seoul.map(function (a) { return Math.round(a.lp || 0) + "%"; }).join(" → ") + "<br>경기 " + D.gg.map(function (a) { return Math.round(a.lp || 0) + "%"; }).join(" → ") + "</p></div>" }));
  var bld = function (tall, c) {
    var h = tall ? 96 : 50, w = tall ? 30 : 46, d = 16, x0 = 22 - (tall ? 0 : 8), base = 108, top = base - h, win = "";
    for (var yy = top + 7; yy < base - 4; yy += 8) for (var xx = x0 + 4; xx < x0 + w - 4; xx += 7) win += '<rect x="' + xx + '" y="' + yy + '" width="3.6" height="4" fill="#ffe08a" opacity="' + (((xx * 7 + yy * 3) % 5) ? 0.9 : 0.25) + '"/>';
    return '<svg viewBox="0 0 100 118" width="86" height="102"><ellipse cx="50" cy="111" rx="38" ry="5" fill="#000" opacity=".35"/>' +
      '<polygon points="' + (x0 + w) + "," + top + " " + (x0 + w + d) + "," + (top - d * 0.55) + " " + (x0 + w + d) + "," + (base - d * 0.55) + " " + (x0 + w) + "," + base + '" fill="' + ifShade(c, -0.45) + '"/>' +
      '<polygon points="' + x0 + "," + top + " " + (x0 + d) + "," + (top - d * 0.55) + " " + (x0 + w + d) + "," + (top - d * 0.55) + " " + (x0 + w) + "," + top + '" fill="' + ifShade(c, 0.35) + '"/>' +
      '<rect x="' + x0 + '" y="' + top + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>' + win + "</svg>";
  };
  C.push(ifCard({ title: "대장 숫자는 이렇게 읽으세요", src: basis,
    body: '<div class="if-vs"><div>' + (ifImg("lead") ? '<img class="if-aptimg" src="' + ifImg("lead") + '">' : bld(true, "#3b5bdb")) + '<b>대장아파트</b><small>새 아파트·대단지 상위 3곳</small><em class="red">신고가 먼저</em></div><div>' + (ifImg("mid") ? '<img class="if-aptimg" src="' + ifImg("mid") + '">' : bld(false, "#6b7a99")) + '<b>중위가</b><small>그 동네 보통 집(구축 포함)</small><em class="blue">늦게 따라옴</em></div></div>' +
      '<ul class="if-check"><li>대장 = 그 동네 시세의 <b>천장</b>, 중위가 = <b>보통 집</b></li><li>둘이 다르면 같은 동네 안에서도 <b>양극화</b>가 진행 중</li><li>2021년 이후 준공은 비교할 2021년 거래가 없어 제외</li></ul>' +
      '<div class="if-tip"><b>예) 노도강</b><p>대장 ' + s4.lt + "곳 중 " + s4.lr + "곳 신고가 · 중위가는 고점 대비 " + ifPct(s4.vs) + "</p></div>" }));
  C.push(ifCard({ title: "한눈에 보는 핵심 정리", src: basis,
    body: '<div class="if-sum">' +
      "<div><h4>1. 중위가로는 아직, 대장은 이미 신고가</h4><p>중위가 노도강 " + ifPct(s4.vs) + " · 수원권 " + ifPct(g3.vs) + "<br>대장 신고가 " + Math.round(s4.lp) + "% · " + Math.round(g3.lp) + "%</p></div>" +
      "<div><h4>2. 서울 대장 신고가</h4><p>" + D.seoul.map(function (a) { return '<span class="nw">' + ifEsc(a.nm) + " " + a.lr + "/" + a.lt + "</span>"; }).join(" · ") + "</p></div>" +
      "<div><h4>3. 경기 대장 신고가</h4><p>" + D.gg.map(function (a) { return '<span class="nw">' + ifEsc(a.nm) + " " + a.lr + "/" + a.lt + "</span>"; }).join(" · ") + "</p></div>" +
      "<div><h4>4. 순서는 같다</h4><p>서울 " + D.seoul.map(function (a) { return Math.round(a.lp || 0) + "%"; }).join("→") + " · 경기 " + D.gg.map(function (a) { return Math.round(a.lp || 0) + "%"; }).join("→") + "</p></div></div>" }));
  C.push(ifOutro());
  return ifDeck(C);
}
function ifDeckFor(tab) { return tab === "ripple" ? ifRippleDeck() : tab === "ripple2" ? ifLeadDeck() : []; }
document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-ifstyle]"); if (!b || typeof CH === "undefined") return; CH.style = b.dataset.ifstyle; if (typeof paintChannel === "function") paintChannel(); });

/* ── 글자 맞춤: 한 줄에 넣되(글자 줄여 최대 76%), 그래도 길면 단어 단위로 줄바꿈 · 지도 이름표 겹침 풀기 ── */
var IF_FIT_SEL = ".if-title,.if-leg b,.if-tiles span,.if-box h4,.if-sum h4,.if-path>b,.if-tl-r>span:first-child,.if-bars span,.if-tile span,.if-vs b,.if-vs small,.if-toc li,.if-sub,.if-tip b";
function ifFit(root) {
  if (!root) return;
  Array.prototype.forEach.call(root.querySelectorAll(".chc-info"), function (card) {
    Array.prototype.forEach.call(card.querySelectorAll(IF_FIT_SEL), function (el) {
      el.style.fontSize = ""; el.style.whiteSpace = "nowrap";
      var fs = parseFloat(getComputedStyle(el).fontSize), k = 1, one = el.matches(".if-tl-r>span:first-child,.if-title,.if-toc li"), lim = one ? 0.7 : 0.85;
      while (el.scrollWidth > el.clientWidth + 1 && k > lim) { k -= 0.03; el.style.fontSize = (fs * k).toFixed(2) + "px"; }
      if (!one && el.scrollWidth > el.clientWidth + 1) { el.innerHTML = el.innerHTML.replace(/·(?!<wbr>)/g, "·<wbr>"); el.style.fontSize = (fs * 0.94).toFixed(2) + "px"; el.style.whiteSpace = "normal"; }
    });
    Array.prototype.forEach.call(card.querySelectorAll(".if-map"), function (m) {
      var ls = Array.prototype.slice.call(m.querySelectorAll(".if-ml")); if (ls.length < 2) return;
      ls.forEach(function (l) { l.style.marginTop = "0px"; l.style.fontSize = ""; });
      var z = m.getBoundingClientRect().width / (m.offsetWidth || 1) || 1;
      function hit(a, b) { var r = a.getBoundingClientRect(), q = b.getBoundingClientRect(); var ox = Math.min(r.right, q.right) - Math.max(r.left, q.left), oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top); return ox > 1 && oy > 1 ? [ox, oy, r, q] : null; }
      /* 1) 겹치는 이름표는 글자를 조금 줄이고 2) 그래도 겹치면 위아래로 벌린다 */
      for (var i = 0; i < ls.length; i++) for (var j = i + 1; j < ls.length; j++) if (hit(ls[i], ls[j])) { ls[i].style.fontSize = "7.5px"; ls[j].style.fontSize = "7.5px"; }
      for (var pass = 0; pass < 8; pass++) {
        var moved = false;
        for (i = 0; i < ls.length; i++) for (j = i + 1; j < ls.length; j++) {
          var h = hit(ls[i], ls[j]); if (!h) continue; moved = true;
          var d = (h[1] / z) / 2 + 0.6, up = h[2].top <= h[3].top ? ls[i] : ls[j], dn = up === ls[i] ? ls[j] : ls[i];
          up.style.marginTop = (parseFloat(up.style.marginTop) - d) + "px"; dn.style.marginTop = (parseFloat(dn.style.marginTop) + d) + "px";
        }
        if (!moved) break;
      }
    });
  });
}
function ifFitLater(root) { if (!root) return; ifFit(root); setTimeout(function () { ifFit(root); }, 450); if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ifFit(root); }); }
