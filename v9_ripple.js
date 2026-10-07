/* ══ v9.7 돈이 퍼지는 순서 — 서울 안 · 서울→경기 확산 순서 (채널 브리핑 주제 탭 'ripple') ══
   숫자 출처 1 = 이 앱의 월별 실거래 장부(MC, market_core.json): 단계별로 묶어 6개월 거래량 가중 ㎡당 중위가를 만들고
     · 지난 상승기: 전년 같은 달 대비 +10% 가 3개월 이어진 첫 달 = '상승 시작'
     · 이번 회복기: 2020~22년 최고치를 3개월 연속 넘은 첫 달 = '전고점 회복'
   숫자 출처 2 = 공개 지수·기사·논문(RP_REFS) — 날짜·매체를 그대로 적고, 바꾸지 않는다(자료 기준일 고정).
   실거래 중위가는 그 달 팔린 단지 구성에 따라 흔들린다 → 구 하나보다 '단계(여러 구 묶음)'로 본다. */
var RP_STAGES = {
  seoul: [
    ["강남3구·용산", ["서울 강남구", "서울 서초구", "서울 송파구", "서울 용산구"]],
    ["한강벨트", ["서울 성동구", "서울 마포구", "서울 광진구", "서울 강동구", "서울 동작구", "서울 양천구", "서울 영등포구"]],
    ["중간 지대", ["서울 동대문구", "서울 서대문구", "서울 성북구", "서울 중구", "서울 종로구", "서울 강서구", "서울 은평구", "서울 구로구", "서울 중랑구", "서울 관악구"]],
    ["노도강·금관구", ["서울 노원구", "서울 도봉구", "서울 강북구", "서울 금천구"]]
  ],
  gg: [
    ["과천·분당", ["경기 과천시", "경기 성남시 분당구"]],
    ["하남·광명·수지·평촌", ["경기 하남시", "경기 광명시", "경기 용인시 수지구", "경기 안양시 동안구", "경기 성남시 수정구", "경기 성남시 중원구"]],
    ["수원·동탄·구리권", ["경기 수원시 영통구", "경기 수원시 장안구", "경기 수원시 팔달구", "경기 수원시 권선구", "경기 화성시 동탄구", "경기 구리시", "경기 용인시 기흥구", "경기 의왕시", "경기 군포시"]],
    ["외곽", ["경기 고양시 일산서구", "경기 고양시 일산동구", "경기 의정부시", "경기 평택시", "경기 오산시", "경기 이천시", "경기 동두천시", "경기 김포시", "경기 안산시 상록구", "경기 안산시 단원구"]]
  ]
};
/* 공개 자료 — 기준일·매체 그대로. 새 자료가 나오면 여기만 바꾼다 */
var RP_REFS = {
  kb: { asOf: "2026.09.15", src: "KB부동산 아파트 매매가격지수 (KB Think 정리)",
    seUp: [["송파구", 31.9], ["성동구", 31.0], ["광진구", 28.3], ["강남구", 25.8], ["마포구", 24.6], ["강동구", 24.3], ["용산구", 23.9], ["서초구", 21.8], ["양천구", 21.6], ["영등포구", 21.5]],
    seUpN: 20, seDn: [["도봉구", -13.9], ["금천구", -8.6], ["노원구", -6.5], ["중랑구", -2.1], ["강북구", -1.8]],
    ggUp: [["성남 분당구", 30.6], ["과천시", 28.6], ["하남시", 15.6], ["용인 수지구", 12.4]],
    ggDn: [["동두천시", -27.4], ["이천시", -23.4], ["고양 일산서구", -22.6], ["양주시", -21.5], ["오산시", -20.5], ["평택시", -20.3]], ggAll: 91.3 },
  news: [
    { h: "강남 오르면 과천·성남이 따라 오른다", w: "강남→준서울", d: "2011", t: "강남 상승은 과천·성남으로 크게 번진다", l: "김시원·김봉한·최두열, '지역 주택가격의 파급효과: GVAR를 응용한 실증분석', 응용경제 13권 3호", src: "논문" },
    { h: "강남 → 서초·송파 → 용산·양천·강동", w: "서울 안 순서", d: "2022.09", t: "강남구 상승 충격이 서초·송파, 그리고 용산·양천·강동으로 번져 약 5개월 지속", l: "윤재형, Asia-Pacific Journal of Business 13권 3호 · 2003~2021 월별 서울 25개 구", src: "논문" },
    { h: "마지막 해 1위는 노원 +23.3%", w: "외곽이 끝물에", d: "2021.12", t: "지난 상승기 마지막 해, 서울 1위는 노원구(+23.3%) · 강남구 +14.8%", l: "KB 아파트 매매가격(1~11월) · 인천 +31.5%, 경기 +28.5% — 외곽이 가장 늦게, 가장 크게", src: "중앙일보(다음)" },
    { h: "강남 반등, 경기는 과천만 상승", w: "준서울 먼저", d: "2025.02", t: "서울 강남 +0.38% 반등할 때 경기 평균 −0.03%, 과천만 +0.57%", l: "한국부동산원 주간 · 동두천 −0.85%, 이천 −0.31%, 평택 −0.18%", src: "이투데이" },
    { h: "과천 +5.28%, 송파·강남보다 높아", w: "준서울=1단계", d: "2025.05", t: "과천 올해 +5.28%, 송파(+4.90%)·강남(+4.50%)보다 높아", l: "한국부동산원 · 성남·광명·하남도 신고가 잇따라 — '준서울'이 서울 상급지와 함께 움직임", src: "이투데이" },
    { h: "강남·마용성 뒤 노도강 반등 신호", w: "1·2단계→4단계", d: "2025.06", t: "강남3구·마용성 급등 뒤 노도강 반등 신호 — '키 맞추기'", l: "한국부동산원 주간 서울 +0.36%(6년 9개월 만 최대) · 성동 +0.76%, 강남 +0.75%", src: "뉴시스" },
    { h: "전고점 넘은 곳: 강남3구·용산·성동·마포·양천", w: "1·2단계 먼저", d: "2025.06", t: "전고점 넘은 곳: 강남3구·용산·성동·마포·양천 / 노도강·금천은 83~89% 수준", l: "도봉 82.7% · 노원 85.7% · 강북 86.5% · 금천 88.9%", src: "뉴시스" },
    { h: "한강벨트 2주 +1.3~1.6%", w: "2단계 차례", d: "2025.10", t: "다음 차례 한강벨트: 성동 +1.63%, 광진 +1.49%, 마포 +1.29% (2주)", l: "한국부동산원 주간 · 노도강도 9월부터 주간 상승폭 확대", src: "뉴시스 · 세계일보" },
    { h: "대출 막히자 노도강·금관구로 이동", w: "4단계 차례", d: "2026.07", t: "대출 막히자 '하향 이동' — 성북→노도강, 영등포→금관구", l: "상반기 노도강 매수 중 다른 구 주민 +95.4% · 금관구 매수 5년 만 최대", src: "뉴시스" },
    { h: "동탄 주간 +0.73% 전국 1위", w: "경기 3단계", d: "2026.07", t: "경기로 번진 상승 — 화성 동탄 주간 +0.73%, 전국 1위", l: "한국부동산원 7월 2주 · 서울 +0.30% · 구리·동탄 등 비규제지역으로 풍선효과", src: "디지털데일리 · 머니투데이방송" }
  ]
};
function rpOn() { return typeof MC !== "undefined" && MC && MC.regions; }
function rpYm(i) { var y = Math.floor(MC.m0 / 100), m = MC.m0 % 100 - 1 + i; return (y + Math.floor(m / 12)) + "." + ("0" + (m % 12 + 1)).slice(-2); }
function rpIdx(y, m) { var y0 = Math.floor(MC.m0 / 100), m0 = MC.m0 % 100; return (y - y0) * 12 + (m - m0); }
function rpLast() {
  var prov = MC.prov || [], i = (MC.months || 1) - 1;
  while (i > 0 && prov.indexOf(+rpYm(i).replace(".", "")) >= 0) i--;
  return i;
}
var RP_NAME = null;
function rpCode(nm) { if (!RP_NAME) { RP_NAME = {}; Object.keys(MC.regions).forEach(function (k) { RP_NAME[MC.regions[k].nm] = k; }); } return RP_NAME[nm]; }
/* 묶음 시계열: 6개월 거래량 가중 ㎡당 중위가(만원/평) — 거래 60건 미만이면 비움 */
function rpSeries(names, last, minN) {
  var ks = names.map(rpCode).filter(Boolean); if (!ks.length) return null;
  var L = last + 1, num = [], den = [];
  for (var i = 0; i < L; i++) { var a = 0, b = 0; ks.forEach(function (k) { var s = MC.regions[k].s, o = s.o || 0, j = i - o, p = j >= 0 ? s.p[j] : null, n = j >= 0 ? s.n[j] : null; if (p && n) { a += p * n; b += n; } }); num.push(a); den.push(b); }
  var out = [];
  for (var t = 0; t < L; t++) { var A = 0, B = 0; for (var q = Math.max(0, t - 5); q <= t; q++) { A += num[q]; B += den[q]; } out.push(B >= (minN || 60) ? A / B : null); }
  return { s: out, ks: ks };
}
function rpStat(names, last) {
  var S = rpSeries(names, last); if (!S) return null; var s = S.s;
  var v = function (i) { return i >= 0 && i < s.length ? s[i] : null; };
  var yoy = function (i) { return v(i) && v(i - 12) ? (v(i) / v(i - 12) - 1) * 100 : -99; };
  var A = null, i;
  for (i = rpIdx(2017, 6); i <= rpIdx(2021, 12) - 2; i++) if (yoy(i) >= 10 && yoy(i + 1) >= 10 && yoy(i + 2) >= 10) { A = i; break; }
  var pk = 0; for (i = rpIdx(2020, 1); i < rpIdx(2022, 7); i++) if (v(i) > pk) pk = v(i);
  var R = null, dip = false; for (i = rpIdx(2022, 7); i <= last - 2; i++) if (v(i) && v(i) <= pk * 0.95) dip = true; else if (dip && v(i) >= pk && v(i + 1) >= pk && v(i + 2) >= pk) { R = i; break; }
  var b23 = v(rpIdx(2023, 12)), cur = v(last);
  return { A: A, R: R, pk: pk, cur: cur, vs: pk && cur ? (cur / pk - 1) * 100 : null, g: b23 && cur ? (cur / b23 - 1) * 100 : null,
    y1: cur && v(last - 12) ? (cur / v(last - 12) - 1) * 100 : null,
    y21: v(rpIdx(2021, 12)) && v(rpIdx(2020, 12)) ? (v(rpIdx(2021, 12)) / v(rpIdx(2020, 12)) - 1) * 100 : null, ks: S.ks };
}
/* ── 권역별 경로: 구·시 하나하나의 '급등 시작'(전년 대비 +20% 3개월 연속 첫 달, 2016~2021) 순으로 줄 세운다 ── */
var RP_CORR = {
  seoul: [
    ["동남권", "강남에서 동쪽으로", ["서울 강남구", "서울 서초구", "서울 송파구", "서울 강동구"]],
    ["도심·서북권", "용산에서 서북쪽으로", ["서울 용산구", "서울 마포구", "서울 서대문구", "서울 은평구", "서울 종로구"]],
    ["도심·동북권", "성동·광진에서 동북쪽으로", ["서울 성동구", "서울 광진구", "서울 중구", "서울 동대문구", "서울 성북구", "서울 중랑구", "서울 강북구", "서울 도봉구", "서울 노원구"]],
    ["서남권", "양천·영등포에서 서남쪽으로", ["서울 양천구", "서울 영등포구", "서울 동작구", "서울 관악구", "서울 구로구", "서울 강서구", "서울 금천구"]]
  ],
  gg: [
    ["경부 축", "분당 → 용인", ["경기 성남시 분당구", "경기 용인시 수지구", "경기 용인시 기흥구", "경기 용인시 처인구"]],
    ["과천·안양 축", "과천 → 평촌 → 산본", ["경기 과천시", "경기 안양시 동안구", "경기 의왕시", "경기 군포시", "경기 안양시 만안구"]],
    ["수원·화성 축", "광교 → 수원 → 동탄", ["경기 수원시 영통구", "경기 수원시 팔달구", "경기 수원시 장안구", "경기 수원시 권선구", "경기 화성시 동탄구"]],
    ["서남부 축", "광명 → 시흥·안산", ["경기 광명시", "경기 부천시 원미구", "경기 시흥시", "경기 안산시 단원구", "경기 안산시 상록구"]],
    ["동부 축", "하남 → 구리 → 남양주", ["경기 하남시", "경기 구리시", "경기 남양주시"]],
    ["서북부 축", "고양 → 김포·파주", ["경기 고양시 일산동구", "경기 고양시 일산서구", "경기 고양시 덕양구", "경기 김포시", "경기 파주시"]]
  ]
};
/* 튀는 값 원인 — 그때 기사·자료로 확인한 것만. 없으면 자동 진단만 보여 준다 */
var RP_NOTES = {
  "경기 하남시": { s: "미사 입주로 신축 거래 쏠림 — 시세 급등 아님", t: "미사강변도시 입주(2016)로 새 아파트 매매가 몰려 중위가가 계단처럼 뛴 것 — 시세 급등이라기보다 '팔린 단지 구성' 변화",
    ev: ["2016.04 미사 푸르지오1차·동원로얄듀크 입주 앞두고 '2월부터 거래량 늘며 가격 상승' (이코노미스트)", "2016.08 '미사지구 새 아파트 입주 영향으로 기존 아파트 전셋값 하락', 하남 주간 전세 −0.82% (뉴스토마토)", "실거래: 2016.03 ㎡당 중위 1,437→1,732만(+21%, 두 달) · 2016.09 월 343건(직전 2년 중위의 약 2배) · 2017~18 전년 대비 +3~5%로 식음"] },
  "경기 성남시 분당구": { s: "2018년 초 전국 상승률 1위", t: "2018년 초 전국 상승률 1위권 — 경부 축의 출발점",
    ev: ["2018.01~05 누적 +9.72%로 전국 1위, 1월 거래 1,287건 (뉴시스, 한국감정원 주간)", "신분당선 연장·GTX-A 착공 기대 · 실거래 급등이 24개월 중 12개월 지속"] },
  "서울 양천구": { s: "목동 재건축 연한 도래 + 투자 수요", t: "목동 신시가지 재건축 연한 도래 + 강남 재건축 분양 성공 뒤 투자 수요가 목동으로 — 서남권에서 혼자 일찍 출발",
    ev: ["2016.08 양천구 주간 +0.45%로 서울 25개 구 중 1위, 신시가지 2단지 65㎡ 6.5억→7.6억(3~6월) (아주경제)", "'강남 재건축 단지 분양 성공 뒤 대지지분 많은 목동으로 눈 돌려' — 2016년 말 1~6단지, 2018년 14개 단지 재건축 연한 충족 (아주경제)"] },
  "경기 과천시": { s: "재건축 기대, 월 거래 30건이라 흔들림", t: "재건축 기대로 2018년 일찍 오른 것은 맞지만, 월 거래가 30건 안팎이라 시점·폭은 크게 흔들림",
    ev: ["2018.05 '과천은 재건축 호재로 수혜' (뉴시스)", "실거래 월 중위 30건 — 단지 하나의 거래로 중위가가 움직임"] }
};
var RP_ODD = { blip: "일시적 급등", thin: "표본 적음", lead: "실제 선도" };
function rpGu(nm, last) {
  var S = rpSeries([nm], last, 15); if (!S) return null; var s = S.s, i;
  var v = function (j) { return j >= 0 && j < s.length ? s[j] : null; };
  var yoy = function (j) { return v(j) && v(j - 12) ? (v(j) / v(j - 12) - 1) * 100 : -99; };
  var on = null; for (i = rpIdx(2016, 1); i <= rpIdx(2021, 12); i++) if (yoy(i) >= 20 && yoy(i + 1) >= 20 && yoy(i + 2) >= 20) { on = i; break; }
  var lo = Infinity, lt = -1; for (i = rpIdx(2016, 1); i < rpIdx(2020, 1); i++) if (v(i) && v(i) < lo) { lo = v(i); lt = i; }
  var hi = 0, ht = -1; for (i = rpIdx(2020, 1); i < rpIdx(2022, 7); i++) if (v(i) && v(i) > hi) { hi = v(i); ht = i; }
  var R = null, dip = false; for (i = rpIdx(2022, 7); i <= last - 2; i++) if (v(i) && v(i) <= hi * 0.95) dip = true; else if (dip && v(i) >= hi && v(i + 1) >= hi && v(i + 2) >= hi) { R = i; break; }
  var cur = v(last);
  /* 진단용: 급등이 얼마나 이어졌나(24개월 중 +20% 달 수) · 18개월 안에 +8% 밑으로 식었나 · 식은 뒤 다시 급등한 달 · 월 거래 중위 */
  var sus = 0, fade = false, on2 = null, nn = [], k = rpCode(nm), ss = MC.regions[k].s, o = ss.o || 0;
  if (on != null) {
    for (i = on; i < on + 24; i++) if (yoy(i) >= 20) sus++;
    for (i = on + 3; i <= on + 18; i++) if (yoy(i) > -99 && yoy(i) < 8) { fade = true; break; }
    if (fade) { var cool = false; for (i = on + 3; i <= Math.min(last - 2, rpIdx(2021, 12)); i++) { if (yoy(i) < 10) cool = true; else if (cool && yoy(i) >= 20 && yoy(i + 1) >= 20 && yoy(i + 2) >= 20) { on2 = i; break; } } }
  }
  for (i = rpIdx(2016, 1); i < rpIdx(2022, 1); i++) { var x = ss.n[i - o]; if (x) nn.push(x); }
  nn.sort(function (a, b) { return a - b; });
  return { full: nm, nm: nm.replace(/^(서울|경기) /, ""), on: on, sus: sus, fade: fade, on2: on2, nMed: nn.length ? nn[Math.floor(nn.length / 2)] : 0, lt: lt, ht: ht, rise: lt >= 0 && hi ? (hi / lo - 1) * 100 : null, R: R, vs: cur && hi ? (cur / hi - 1) * 100 : null };
}
function rpCorrData(w, last) {
  return RP_CORR[w].map(function (c, ci) {
    var g = c[2].map(function (n) { return rpCode(n) ? rpGu(n, last) : null; }).filter(Boolean);
    /* 튀는 값: 같은 축 가운데 시점보다 18개월 넘게 앞서거나 늦은 곳 → 자동 진단 */
    var ons = g.map(function (x) { return x.on; }).filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; }), med = ons.length ? ons[Math.floor((ons.length - 1) / 2)] : null;
    g.forEach(function (x) {
      x.key = x.on;
      if (x.on == null || med == null || Math.abs(x.on - med) < 18) return;
      x.odd = { gap: x.on - med, type: x.nMed < 40 ? "thin" : (x.sus < 10 && x.fade) ? "blip" : "lead" };
      if (x.odd.type === "blip" && x.on2 != null) x.key = x.on2;   /* 일시적 급등이면 다시 오른 달로 줄 세움 */
      x.note = RP_NOTES[x.full] || null;
    });
    g.sort(function (a, b) { return (a.key == null ? 9999 : a.key) - (b.key == null ? 9999 : b.key); });
    return { no: ci + 1, nm: c[0], sub: c[1], g: g, med: med };
  }).filter(function (c) { return c.g.length; });
}
function rpData() {
  if (!rpOn()) return null;
  var last = rpLast(), out = { last: last, lastYm: rpYm(last) };
  ["seoul", "gg"].forEach(function (w) {
    out[w] = RP_STAGES[w].map(function (st, si) {
      var a = rpStat(st[1], last); if (!a) return null;
      a.nm = st[0]; a.no = si + 1;
      a.gu = st[1].map(function (n) { var x = rpStat([n], last); if (!x) return null; x.nm = n.replace(/^(서울|경기) /, ""); return x; }).filter(Boolean);
      return a;
    }).filter(Boolean);
  });
  return out;
}
function rpShort(nm) { var x = nm.replace(/^(성남시|용인시|안양시|수원시|화성시|고양시|안산시|부천시) /, ""); return x.length > 2 ? x.replace(/(시|구)$/, "") : x; }
function rpPct(v) { return v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(1) + "%"; }
function rpRecTxt(a) { return a.R != null ? rpYm(a.R) + " 회복" : "아직 " + rpPct(a.vs); }
/* 모든 카드 공통: 맨 위 '이렇게 읽으세요' 한 줄(rpKey) + 같은 행 모양 */
function rpKey(t) { return '<div class="rp-key">' + t + "</div>"; }
function rpBar(v, mx) { var w = Math.min(50, Math.abs(v) / mx * 50); return '<i class="rp-bar"><u class="' + (v >= 0 ? "pos" : "neg") + '" style="width:' + w.toFixed(1) + "%;" + (v >= 0 ? "left:50%" : "right:50%") + '"></u></i>'; }
function rpCards() {
  var D = rpData(); if (!D || !D.seoul.length) return [];
  var C = [], basis = "실거래 ~" + D.lastYm, src = "국토부 실거래 · 우상향연구소 집계 · 투자 권유 아님";
  function base(o) { o.dense = true; o.compact = true; o.date = o.date || basis; o.src = o.src || src; if (o.key) { var hd = rpKey(o.key) + (o.colHead || ""); o.body = hd + (o.body || ""); o.bodyHead = hd; } return o; }
  function flow(list) {
    return list.map(function (a, i) {
      return '<div class="chc-row rp-step"><i>' + a.no + '</i><div><b>' + escHtml(a.nm) + "</b><small>" + a.gu.map(function (g) { return escHtml(rpShort(g.nm)); }).join(" · ") + '</small></div><span class="' + (a.R != null ? "up" : "down") + '">' + rpRecTxt(a) + "</span></div>" + (i < list.length - 1 ? '<div class="rp-arrow">↓</div>' : "");
    }).join("");
  }
  var s4 = D.seoul[D.seoul.length - 1], g3 = D.gg[2];
  C.push(base({ tag: "확산 순서 · 서울", q: "서울 안, 집값이 퍼지는 순서", key: "위에서 아래로 차례대로 회복 · <b>빨강 = 이미 전고점 넘음, 파랑 = 아직</b>",
    body: '<div class="rp-flow">' + flow(D.seoul) + "</div>", a: "강남3구·용산 → 한강벨트 → 중간 지대 → 노도강·금관구",
    how: "전고점 = 2020~22년 최고 · 회복 = 5% 넘게 빠졌다가 그 값을 3개월 연속 넘은 첫 달 · 6개월 거래량 가중 ㎡당 중위가" }));
  C.push(base({ tag: "확산 순서 · 경기", q: "서울에서 경기로 퍼지는 순서", key: "강남과 가까운 곳부터 회복 · <b>빨강 = 이미 전고점 넘음, 파랑 = 아직</b>",
    body: '<div class="rp-flow">' + flow(D.gg) + "</div>", a: "과천·분당 → 하남·광명·수지·평촌 → 수원·동탄·구리 → 외곽",
    how: "전고점 = 2020~22년 최고 · 회복 = 5% 넘게 빠졌다가 그 값을 3개월 연속 넘은 첫 달 · 6개월 거래량 가중 ㎡당 중위가" }));
  /* 권역·축별 경로 */
  ["seoul", "gg"].forEach(function (w) {
    var CD = rpCorrData(w, D.last), rows = [];
    CD.forEach(function (c) {
      var chain = c.g.map(function (g) { return escHtml(rpShort(g.nm)) + (g.odd ? "*" : ""); }).join(" → ");
      for (var q = 0; q < c.g.length; q += 5) {
        rows.push({ html: '<div class="chc-row chc-grp rp-grp rp-cor"><div class="chc-gh"><b>' + c.no + ". " + escHtml(c.nm) + (q ? " <small>이어서</small>" : '<small class="rp-chain">' + chain + "</small>") + "</b></div>" +
          c.g.slice(q, q + 5).map(function (g) {
            return '<div class="chc-sr"><span>' + escHtml(g.nm) + (g.odd ? '<small class="rp-odd">*' + RP_ODD[g.odd.type] + "</small>" : "") + "</span><span>" + (g.key != null ? rpYm(g.key) : "–") + "</span><span>" + (g.rise != null ? "+" + Math.round(g.rise) + "%" : "–") + '</span><i class="' + (g.R != null ? "top" : g.vs >= 0 ? "near" : "") + '">' + (g.R != null ? rpYm(g.R).slice(2) + " 회복" : g.vs >= 0 ? "막 넘음" : "아직 " + (g.vs < 0 ? "−" : "+") + Math.abs(Math.round(g.vs)) + "%") + "</i></div>";
          }).join("") + "</div>" });
      }
    });
    var o = base({ tag: w === "seoul" ? "서울 권역별 경로" : "경기 축별 경로", q: (w === "seoul" ? "서울 권역별, 어디서 어디로" : "서울에서 경기로, 축별 경로"), cnt: CD.length + (w === "seoul" ? "개 권역" : "개 축"),
      key: "<b>금색 화살표 = 지난 상승기 급등 순서</b> · 빨강 = 이번 회복 · 파랑 = 아직",
      colHead: '<div class="chc-sr rp-hd rp-cor-hd"><span></span><span>급등 시작</span><span>상승폭</span><i>이번 회복</i></div>',
      a: CD.map(function (c) { return c.g.slice(0, 3).map(function (g) { return rpShort(g.nm); }).join("→"); }).join(" / "),
      how: "급등 시작 = 전년 대비 +20% 가 3개월 이어진 첫 달 · 상승폭 = 2016~19 저점 → 2020~22 고점(지난 상승기 전체) · 막 넘음 = 지금 고점 위지만 3개월 미만 · * = 같은 축보다 1년 반 넘게 튀는 곳" });
    bfPack(o, rows, true, 2).forEach(function (c) { C.push(c); });
  });
  /* 튀는 값 — 한 장, 한 줄씩 */
  var odd = [];
  ["seoul", "gg"].forEach(function (w) { rpCorrData(w, D.last).forEach(function (c) { c.g.forEach(function (g) { if (g.odd) odd.push([g, c]); }); }); });
  if (odd.length) {
    var blip = odd.filter(function (x) { return x[0].odd.type === "blip"; });
    C.push(base({ tag: "튀는 값", q: "혼자 튀는 숫자, 진짜일까", cnt: odd.length + "곳", src: "국토부 실거래 · 당시 보도 · 투자 권유 아님",
      key: odd.length + "곳 중 <b>착시는 " + blip.length + "곳(" + blip.map(function (x) { return rpShort(x[0].nm); }).join("·") + ")</b> — 나머지는 실제로 먼저 오른 곳",
      a: "같은 축보다 1년 반 넘게 앞선 곳 " + odd.length + "곳 — 착시 " + blip.length + "곳",
      body: chList(odd.map(function (x) {
        var g = x[0], c = x[1], ty = g.odd.type, lab = ty === "blip" ? "착시" : ty === "thin" ? "표본 적음" : "진짜 선도";
        var why = g.note ? g.note.s : ty === "lead" ? "급등 " + g.sus + "개월 지속(원인 기사 확인 전)" : "자동 진단만";
        if (ty === "blip" && g.on2 != null) why += " → " + rpYm(g.on2) + "로 보정";
        return [escHtml(g.nm) + ' <small class="rp-ax">' + escHtml(c.nm) + " · " + rpYm(g.on) + "</small>", escHtml(why), '<em class="rp-t ' + ty + '">' + lab + "</em>"];
      }), true),
      how: "착시 = 급등이 10개월 못 가고 1년 반 안에 식음(신축 입주 등으로 팔린 단지가 바뀐 탓) · 표본 적음 = 월 거래 40건 미만 · 진짜 선도 = 오래 지속" }));
  }
  /* 숫자 표 2장 */
  function tbl(list, w) { return list.map(function (a) { return [w + a.no + " " + a.nm, a.R != null ? rpYm(a.R) : "아직", rpPct(a.y1), rpPct(a.vs)]; }); }
  C.push(base({ tag: "이번 회복기", q: "회복은 차례로, 최근 1년은 모두 상승", key: "<b>'고점 대비'</b>는 순서대로 낮아지지만 <b>'최근 1년'</b>은 노도강·수원권도 +" + Math.round(Math.min(s4.y1 || 0, g3.y1 || 0)) + "% 넘게 — 늦은 곳도 오르는 중",
    body: chTable(["단계", "전고점 회복", "최근 1년", "고점 대비"], tbl(D.seoul, "서울").concat(tbl(D.gg, "경기")), { cls: "wide" }),
    a: "서울 4단계 최근 1년 " + rpPct(s4.y1) + " · 경기 3단계 " + rpPct(g3.y1) + " — 고점은 아직이지만 오르는 중",
    how: "최근 1년 = " + rpYm(D.last - 12) + " → " + D.lastYm + " · 고점 대비 = 2020~22년 최고와 비교 · 중위가는 오래된 단지가 섞여 대장보다 늦게 회복(대장 버전 탭 참고)" }));
  function tbl2(list, w) { return list.map(function (a) { return [w + a.no + " " + a.nm, a.A != null ? rpYm(a.A) : "–", rpPct(a.y21)]; }); }
  C.push(base({ tag: "지난 상승기", q: "2017~2021년에도 같은 순서였다", key: "<b>위쪽일수록 먼저 출발</b>, 아래쪽은 늦게 출발했지만 마지막 해(2021)에 더 크게",
    body: chTable(["단계", "상승 시작", "2021 한 해"], tbl2(D.seoul, "서울").concat(tbl2(D.gg, "경기")), { cls: "wide" }),
    a: "서울이 2017년에 먼저 오르고, 경기 외곽은 2020년에야 시작 — 대신 마지막 해(2021)에 가장 크게",
    how: "상승 시작 = 전년 같은 달보다 +10% 가 3개월 이어진 첫 달 · 2021 한 해 = 2020.12 → 2021.12" }));
  /* KB 지수 — 막대 2장 */
  var K = RP_REFS.kb;
  function kbCard(tag, q, up, dn, key, extra) {
    var all = up.concat(dn), mx = Math.max.apply(null, all.map(function (x) { return Math.abs(x[1]); }).concat([10]));
    C.push(base({ tag: tag, q: q, key: key, src: K.src + " · " + K.asOf + " · 투자 권유 아님", date: "KB " + K.asOf, a: key.replace(/<[^>]+>/g, ""),
      body: '<div class="rp-bars">' + all.map(function (x) { return '<div class="rp-br"><span>' + escHtml(x[0]) + "</span>" + rpBar(x[1], mx) + '<b class="' + (x[1] >= 0 ? "up" : "down") + '">' + (x[1] > 0 ? "+" : "") + x[1] + "%</b></div>"; }).join("") +
        '<div class="rp-axis"><span>◀ 고점 아래</span><span>고점 위 ▶</span></div></div>' + (extra || ""),
      how: "KB 아파트 매매가격지수 · 2021~22년 고점과 비교 · 실거래 중위가와 달리 같은 집의 시세 변화를 따라감" }));
  }
  kbCard("지수로 확인 · 서울", "KB 지수, 서울 어디까지 회복했나", K.seUp.slice(0, 5), K.seDn, "<b>오른쪽(빨강) = 먼저 오른 곳</b>, 왼쪽(파랑) = 아직 고점 아래 → 노도강·금천·중랑이 마지막 차례", '<div class="rp-note">전고점 위 ' + K.seUpN + "개 구 중 상위 5곳만 표시</div>");
  kbCard("지수로 확인 · 경기", "KB 지수, 경기 어디까지 회복했나", K.ggUp, K.ggDn, "<b>오른쪽(빨강) = 분당·과천·하남·수지</b>, 왼쪽(파랑) = 외곽 → 경기 전체는 고점의 " + K.ggAll + "%");
  /* 기사·연구 — 날짜 · 한 줄 · 무엇을 보여 주나 */
  var nw = RP_REFS.news;
  for (var i = 0; i < nw.length; i += 5) {
    C.push(base({ tag: "기사·연구" + (nw.length > 5 ? " " + (i / 5 + 1) + "/" + Math.ceil(nw.length / 5) : ""), q: "기사·연구도 같은 순서를 말한다", cnt: nw.length + "건",
      key: "<b>오른쪽 꼬리표 = 그 기사가 보여 주는 단계</b> · 위에서 아래로 시간순",
      a: "논문 2편 · 보도 " + (nw.length - 2) + "건 — 강남에서 준서울·한강벨트로, 마지막에 노도강·경기 외곽으로",
      body: chList(nw.slice(i, i + 5).map(function (n) { return ['<em class="rp-d">' + n.d + "</em> " + escHtml(n.h), escHtml(n.src), '<em class="rp-w">' + escHtml(n.w) + "</em>"]; }), true),
      src: "논문·언론 보도 정리 · 수치는 각 보도 인용 · 투자 권유 아님", date: "자료 2011~2026.07", how: "자세한 수치와 링크는 근거 문서(확산순서_근거.md)" }));
  }
  /* 읽는 법 */
  C.push(base({ tag: "읽는 법", q: "순서는 경향이지 법칙이 아니다", key: "<b>먼저 오른 곳 → 다음 차례</b>는 참고만, 다음 차례가 꼭 오르는 건 아님",
    body: chList([
      ["상급지 먼저, 외곽 나중", "비싼 곳에서 출발해 '아직 싸 보이는 곳'으로", '<em class="rp-w">순서</em>'],
      ["늦은 곳이 끝물에 크게", "2021년 노원 +23.3% 서울 1위", '<em class="rp-w">폭</em>'],
      ["규제가 길을 바꾼다", "규제지역을 건너 비규제지역으로(풍선효과)", '<em class="rp-w">예외</em>'],
      ["다음 차례 ≠ 꼭 오름", "공급·일자리·교통이 약하면 건너뜀", '<em class="rp-w">주의</em>']
    ], true),
    how: "과거 흐름을 정리한 참고 자료입니다. 특정 지역 매수·매도 권유가 아닙니다." }));
  return C;
}
/* ══ 대장 Top3 버전 (탭 'ripple2') — 지역별 대장 3곳이 2021~22 고점을 넘었나 ══
   대장 = 500세대↑·20년 이내 중 ㎡당가 상위 3곳(84㎡). 신고가 = 2023년 이후 거래가 2020~22년 최고가를 넘은 것(최고가 장부 기준).
   2021년 이후 준공은 2021년 거래가 없어 비교 불가 → 회색, 비율에서 뺌 */
function rpLeadOf(nm) {
  var k = rpCode(nm), R = typeof CH !== "undefined" && CH.data && CH.data.regions;
  var L = R && R[k] && R[k].leaders && R[k].leaders["84"]; if (!L || !L.length) return null;
  return L.map(function (t) { var nb = (t.by || 0) >= 2021, rec = !nb && t.mx && t.mx[1] >= 20230101; return { half: rec && t.mx && t.p[0] / t.mx[0] < 0.92, apt: t.apt, p: t.p[0], gap: t.mx ? (t.p[0] / t.mx[0] - 1) * 100 : null, mxd: t.mx ? t.mx[1] : null, nb: nb, rec: rec }; });
}
function rpLeadData() {
  var D = rpData(); if (!D || typeof CH === "undefined" || !CH.data || !CH.data.regions) return null;
  ["seoul", "gg"].forEach(function (w) {
    D[w].forEach(function (a) {
      a.ld = []; a.lt = 0; a.lr = 0;
      RP_STAGES[w][a.no - 1][1].forEach(function (nm) { var L = rpLeadOf(nm); if (!L) return; var cmp = L.filter(function (t) { return !t.nb; }); a.lt += cmp.length; a.lr += cmp.filter(function (t) { return t.rec; }).length; a.ld.push({ nm: nm.replace(/^(서울|경기) /, ""), L: L }); });
      a.lp = a.lt ? a.lr / a.lt * 100 : null;
    });
  });
  return D;
}
function rpLeadCards() {
  var D = rpLeadData(); if (!D) return [];
  var C = [], basis = "대장 실거래 ~" + kstTxt(CH.data.builtAt).split(" ")[0], src = "국토부 실거래 · 대장 = 500세대↑·20년 이내 ㎡당가 상위 3곳(84㎡) · 투자 권유 아님";
  function base(o) { o.dense = true; o.compact = true; o.date = o.date || basis; o.src = o.src || src; if (o.key) { var hd = rpKey(o.key) + (o.colHead || ""); o.body = hd + (o.body || ""); o.bodyHead = hd; } return o; }
  var s4 = D.seoul[3], g3 = D.gg[2];
  /* 1 중위가 vs 대장 */
  function row(a, w) { return [w + a.no + " " + a.nm, rpPct(a.vs), a.lt ? a.lr + "/" + a.lt + " (" + Math.round(a.lp) + "%)" : "–"]; }
  C.push(base({ tag: "중위가 vs 대장", q: "중위가로는 아직, 대장은 이미 신고가", key: "같은 단계도 <b>대장만 보면 훨씬 앞서 있음</b> — 수원·동탄권 대장 " + (g3 ? g3.lr + "/" + g3.lt : "") + "곳, 노도강 대장 " + (s4 ? s4.lr + "/" + s4.lt : "") + "곳이 이미 신고가",
    body: chTable(["단계", "중위가 고점 대비", "대장 신고가"], D.seoul.map(function (a) { return row(a, "서울"); }).concat(D.gg.map(function (a) { return row(a, "경기"); })), { cls: "wide" }),
    a: "중위가는 노도강 " + rpPct(s4.vs) + ", 수원권 " + rpPct(g3.vs) + "이지만 대장은 " + Math.round(s4.lp || 0) + "%, " + Math.round(g3.lp || 0) + "%가 신고가",
    how: "중위가 = 그 지역에서 팔린 모든 아파트의 가운데값(오래된·작은 단지 포함) · 대장 신고가 = 2023년 이후 거래가 2020~22 최고가를 넘음 · 2021년 이후 준공은 제외" }));
  /* 2~3 단계별 대장 상태: 지역 한 줄 = 점 3개 */
  ["seoul", "gg"].forEach(function (w) {
    var rows = [];
    D[w].forEach(function (a) {
      if (!a.ld.length) return;
      for (var q = 0; q < a.ld.length; q += 6)
      rows.push({ html: '<div class="chc-row chc-grp rp-grp rp-ld"><div class="chc-gh"><b>' + (w === "seoul" ? "서울" : "경기") + a.no + " " + escHtml(a.nm) + (q ? " <small>이어서</small>" : "") + '</b><em class="' + (a.lp >= 80 ? "up" : a.lp >= 50 ? "" : "down") + '">' + (q ? "" : a.lt ? "신고가 " + a.lr + "/" + a.lt : "–") + "</em></div>" +
        a.ld.slice(q, q + 6).map(function (r) {
          var worst = r.L.filter(function (t) { return !t.nb && !t.rec; }).sort(function (x, y) { return x.gap - y.gap; })[0];
          return '<div class="chc-sr"><span>' + escHtml(rpShort(r.nm)) + '</span><span class="rp-dots">' + r.L.map(function (t) { return '<i class="' + (t.nb ? "nb" : t.half ? "half" : t.rec ? "on" : "off") + '"></i>'; }).join("") + "</span><i class=\"" + (worst ? "" : "top") + '">' + (worst ? escHtml(worst.apt.slice(0, 7)) + " " + rpPct(worst.gap) : "모두 신고가") + "</i></div>";
        }).join("") + "</div>" });
    });
    var o = base({ tag: w === "seoul" ? "서울 대장 Top3" : "경기 대장 Top3", q: (w === "seoul" ? "서울" : "경기") + " 대장 3곳, 신고가 찍었나", cnt: D[w].length + "단계",
      key: '<b>점 = 대장 1·2·3위</b> <span class="rp-dots"><i class="on"></i></span> 신고가 <span class="rp-dots"><i class="half"></i></span> 찍고 하락 <span class="rp-dots"><i class="off"></i></span> 아직 <span class="rp-dots"><i class="nb"></i></span> 신축',
      colHead: '<div class="chc-sr rp-hd rp-ld-hd"><span></span><span>1·2·3위</span><i>아직인 대장 중 가장 먼 곳</i></div>',
      a: D[w].map(function (a) { return a.nm + " " + (a.lt ? a.lr + "/" + a.lt : "–"); }).join(" · "),
      how: "신고가 = 2023년 이후 거래가 2020~22년 최고가를 넘음 · 반쪽 점 = 신고가를 찍었지만 최근 거래가 그보다 8% 넘게 낮음(1건 신고가일 수 있음) · % = 최근 거래가 ÷ 2020년 이후 최고가 · 신축 = 2021년 이후 준공(비교 불가)" });
    bfPack(o, rows, true, 2).forEach(function (c) { C.push(c); });
  });
  /* 4 대장 기준 순서 한 장 */
  function chain(list) { return list.map(function (a) { return '<div class="chc-row rp-step"><i>' + a.no + "</i><div><b>" + escHtml(a.nm) + "</b><small>" + a.lr + "/" + a.lt + '곳</small></div><span class="' + (a.lp >= 80 ? "up" : "down") + '">' + (a.lp != null ? Math.round(a.lp) + "%" : "–") + "</span></div>"; }).join(""); }
  C.push(base({ tag: "대장으로 본 순서", q: "대장으로 봐도 순서는 같다", key: "<b>% = 대장 중 신고가 비율</b> → 아래 단계일수록 낮아짐, 순서는 중위가와 같음",
    body: '<div class="rp-2col rp-ld2"><div><div class="rp-sec">서울</div>' + chain(D.seoul) + '</div><div><div class="rp-sec">경기</div>' + chain(D.gg) + "</div></div>",
    a: "대장 신고가 비율 서울 " + D.seoul.map(function (a) { return Math.round(a.lp || 0) + "%"; }).join("→") + " · 경기 " + D.gg.map(function (a) { return Math.round(a.lp || 0) + "%"; }).join("→"),
    how: "대장은 새 아파트·대단지라 먼저 오르고, 중위가는 오래된 단지까지 섞여 늦게 따라옴" }));
  /* 5 읽는 법 */
  C.push(base({ tag: "읽는 법 · 대장", q: "대장 숫자는 이렇게 읽으세요", key: "<b>대장 = 그 동네 시세의 천장</b>, 중위가 = 그 동네 보통 집 — 둘이 다르면 '양극화' 신호",
    body: chList([
      ["대장이 먼저, 보통 집이 나중", "신축·대단지에 수요가 먼저 몰리고 오래된 단지가 따라옴", '<em class="rp-w">순서</em>'],
      ["대장 신고가 ≠ 동네 전체 회복", "노도강은 대장 일부만 신고가, 중위가는 아직 고점 아래", '<em class="rp-w">양극화</em>'],
      ["신축은 비교에서 뺐어요", "2021년 이후 입주 단지는 2021년 거래가 없어 신고가 판단 불가", '<em class="rp-w">회색</em>'],
      ["최근 거래 1건이 기준", "대장 값은 같은 면적 최근 실거래 — 한 건으로 흔들릴 수 있음", '<em class="rp-w">주의</em>']
    ], true),
    how: "참고 자료입니다. 특정 단지 매수·매도 권유가 아닙니다." }));
  return C;
}
function rpLeadText() {
  var D = rpLeadData(); if (!D) return "";
  var L = ["대장 Top3로 보면 — 중위가로는 아직이라도 대장은 이미 신고가", ""];
  ["seoul", "gg"].forEach(function (w) { L.push(w === "seoul" ? "■ 서울" : "■ 경기"); D[w].forEach(function (a) { L.push(a.no + ". " + a.nm + " — 대장 " + a.lt + "곳 중 " + a.lr + "곳 신고가 · 중위가 고점 대비 " + rpPct(a.vs)); }); L.push(""); });
  L.push("대장은 새 아파트·대단지라 먼저 오르고, 중위가는 오래된 단지까지 섞여 늦게 따라옵니다.");
  L.push("출처: 국토부 실거래 · 대장 = 500세대 이상·20년 이내 ㎡당가 상위 3곳(84㎡) · 투자 권유 아님 · @uphill.lab");
  return L.join("\n");
}
function rpText() {
  var D = rpData(); if (!D) return "";
  var L = ["집값은 어떤 순서로 퍼질까 — 서울 안, 그리고 서울에서 경기로", ""];
  L.push("■ 서울 안 (전고점 회복 순서)");
  D.seoul.forEach(function (a) { L.push(a.no + ". " + a.nm + " — " + rpRecTxt(a) + " · 2023.12 이후 " + rpPct(a.g)); });
  L.push(""); L.push("■ 서울 → 경기");
  D.gg.forEach(function (a) { L.push(a.no + ". " + a.nm + " — " + rpRecTxt(a) + " · 2023.12 이후 " + rpPct(a.g)); });
  L.push(""); L.push("■ 권역·축별 경로 (지난 상승기 급등 시작 순)");
  ["seoul", "gg"].forEach(function (w) { rpCorrData(w, D.last).forEach(function (c) { L.push("· " + c.nm + ": " + c.g.map(function (g) { return rpShort(g.nm) + (g.key != null ? "(" + rpYm(g.key).slice(2) + (g.odd ? "*" : "") + ")" : ""); }).join(" → ")); }); });
  var od = []; ["seoul", "gg"].forEach(function (w) { rpCorrData(w, D.last).forEach(function (c) { c.g.forEach(function (g) { if (g.odd) od.push(rpShort(g.nm) + " " + RP_ODD[g.odd.type] + (g.note ? " — " + g.note.t : "")); }); }); });
  if (od.length) { L.push("* 튀는 값"); od.forEach(function (x) { L.push("  " + x); }); }
  L.push(""); L.push("■ 지난 상승기(2017~2021)도 같은 순서: 서울 " + (D.seoul[0].A != null ? rpYm(D.seoul[0].A) : "") + " 시작 → 경기 외곽 " + (D.gg[3] && D.gg[3].A != null ? rpYm(D.gg[3].A) : "") + " 시작, 마지막 해에 외곽이 가장 크게.");
  L.push("■ KB 지수(" + RP_REFS.kb.asOf + ")로도 서울 상급지·과천·분당은 전고점 위, 노도강·경기 외곽은 아직 아래.");
  L.push(""); L.push("순서는 경향일 뿐 법칙이 아닙니다. 규제·공급·교통에 따라 건너뛰기도 합니다.");
  L.push("출처: 국토부 실거래(" + D.lastYm + "까지) · KB부동산 · 한국부동산원 주간 동향 보도 · 투자 권유 아님 · @uphill.lab");
  return L.join("\n");
}
