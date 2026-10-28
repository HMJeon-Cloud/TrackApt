/* TrackApt cards.js — 카드 양식(TPL)·재료(TPR). index.html 의 본 스크립트보다 먼저 불러온다(선언만 있어 순서가 자유롭다). 같은 전역이라 서로의 함수를 그대로 쓴다. */
var TPL = {
  aptNotice: { nm: "청약 단지 한 장", cat: "subs", fields: [["src", "출처·기준", "text", "모집공고일 2026년 9월 23일"], ["tag", "빨간 띠(핵심 자격)", "text", "서울시 거주자"], ["title", "단지명", "text", ""], ["cols", "표 머리(| 구분)", "text", "주택형 | 평형 | 분양가 | 공급"], ["rows", "표 줄(한 줄에 한 주택형, | 구분)", "rows", "84 | 32평 | 12.2억 | 1세대"], ["bullets", "핵심 목록(한 줄에 하나)", "lines", "2026년 9월 입주\n총 215세대"], ["side", "오른쪽 조건표(이름 | 값)", "rows", "분양가상한제 | 미적용\n재당첨제한 | 10년"], ["foot", "맨 아래 메모", "text", ""]],
    auto: function () { var it = typeof sbCardItem === "function" ? (sbCardItem() || (sbItems().filter(function (x) { return x.kind === "apt" && x.b && x.b >= sbToday() - 7; })[0]) || sbItems()[0]) : null; if (!it) return null; var N = typeof sbNote === "function" ? sbNote(it) : {}, P = typeof sbPriorRow === "function" ? sbPriorRow(it) : null;
      return { src: "모집공고일 " + (it.notice ? String(it.notice).replace(/(\d{4})(\d\d)(\d\d)/, "$1년 $2월 $3일") : "") + " · 청약홈", tag: N.res || (it.area ? String(it.area).replace(/특별시|광역시/g, "") + " 공급" : ""), title: it.nm,
        cols: "주택형 | 평형 | 분양가(최고) | 공급 | 일반", rows: tprTypeRows(it),
        bullets: [it.move ? String(it.move).replace(/^(\d{4})0?(\d+)$/, "$1년 $2월 입주 예정") : "", it.n ? "총 " + fmt(it.n) + "세대" + (it.dtl ? " · " + it.dtl : "") : "", N.down || N.mid ? "계약금 " + (N.down || "공고 확인") + (N.mid ? " · 중도금 " + N.mid : "") : "", it.spB ? "특별공급 " + chMD(it.spB) + "(" + chWd(it.spB) + ")" : "", it.r1 ? "1순위 " + chMD(it.r1) + "(" + chWd(it.r1) + ")" + (P && P.length > 1 && /기타/.test(P[1][0]) ? " · 기타지역 " + chMD(it.r1x) : "") : (it.b ? "접수 " + chMD(it.b) + "(" + chWd(it.b) + ")" : ""), it.win ? "발표 " + chMD(it.win) + "(" + chWd(it.win) + ")" : "", N.firstRank ? N.firstRank : "", N.point ? N.point : ""].filter(Boolean),
        side: [["분양가상한제", it.cap ? "적용" : "미적용"], ["규제지역", it.hot ? "투기과열" : it.adj ? "조정대상" : "해당 없음"], ["재당첨제한", N.rewin || "공고 확인"], ["전매제한", N.resale || "공고 확인"], ["거주의무", N.live || "공고 확인"]], foot: "일정·조건은 입주자모집공고문 기준 · 정정 공고 시 변경" }; },
    render: function (d) { var cols = tpRows(d.cols)[0] || [], R = tpRows(d.rows);
      var LT = tpLongTbl(R);
      return tpFrame("subs", d, '<table class="tp-tbl' + (d.compact ? " cmp" : " big") + (LT ? " tp-ltx tp-nogrow" : "") + '"><tr>' + cols.map(function (c) { return "<th>" + tpE(c) + "</th>"; }).join("") + "</tr>" + R.map(function (r) { return "<tr>" + cols.map(function (_, i) { return "<td>" + (LT ? tpCell(r[i] || "", i === cols.length - 1) : tpE(r[i] || "")) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>" +
        '<div class="tp-2col"><ul class="tp-pins">' + tpLines(d.bullets).map(function (b) { return "<li>" + tpE(b) + "</li>"; }).join("") + '</ul><table class="tp-side">' + tpRows(d.side).map(function (r) { return "<tr><th>" + tpE(r[0]) + "</th><td>" + tpE(r[1] || "") + "</td></tr>"; }).join("") + "</table></div>"); } },
  calendar: { nm: "부동산 달력", cat: "policy", fields: [["src", "출처·기준", "text", "2026년 9월 26일 ver."], ["title", "제목", "text", "부동산 달력 10월호"], ["ym", "연월(YYYY-MM)", "text", "2026-10"], ["events", "일정(날짜 | 종류 | 제목)", "rows", "2026-10-15 | 정책 | 10·15 대책 1주년"], ["foot", "맨 아래 메모", "text", ""]],
    auto: function () { var k = chKstDate(), ym = k.y + "-" + ("0" + k.m).slice(-2), f = k.y * 10000 + k.m * 100 + 1, t = k.y * 10000 + k.m * 100 + chDaysInMonth(k.y, k.m), ev = [];
      if (typeof chEvents === "function") chEvents(f, t).forEach(function (e) { ev.push([String(e.d).replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3"), e.kind, e.title]); });
      if (typeof sbEvents === "function" && typeof sbItems === "function") sbEvents(sbItems().filter(function (i) { return !/임대/.test(String(i.rent || "")); }), f, t).filter(function (e) { return /1순위|무순위|당첨자/.test(e.kind); }).slice(0, 14).forEach(function (e) { ev.push([String(e.d).replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3"), e.kind === "당첨자 발표" ? "발표" : "청약", e.it.nm]); });
      return { src: tpToday() + " 기준 · 일정 파일·청약홈", title: "부동산 달력 " + k.m + "월호", ym: ym, events: ev, foot: "일정은 발표 기관 사정으로 바뀔 수 있음" }; },
    render: function (d) { var m = String(d.ym || "").match(/(\d{4})-(\d{1,2})/), y = m ? Number(m[1]) : chKstDate().y, mo = m ? Number(m[2]) : chKstDate().m, first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(), dim = chDaysInMonth(y, mo), by = {};
      tpRows(d.events).forEach(function (r) { var dd = Number(String(r[0] || "").replace(/-/g, "").slice(6, 8)); if (dd) (by[dd] = by[dd] || []).push(r); });
      var cells = []; for (var i = 0; i < first; i++) cells.push("<td></td>");
      for (var day = 1; day <= dim; day++) { var wd = (first + day - 1) % 7; cells.push('<td class="' + (wd === 0 ? "sun" : wd === 6 ? "sat" : "") + '"><b>' + day + "</b>" + (by[day] || []).slice(0, 2).map(function (r) { return '<i class="k-' + tpE(r[1]) + '">' + tpE(r[1]) + "</i><span>" + tpE(r[2]) + "</span>"; }).join("") + ((by[day] || []).length > 2 ? '<span class="more">외 ' + ((by[day] || []).length - 2) + "건</span>" : "") + "</td>"); }
      while (cells.length % 7) cells.push("<td></td>");
      var trs = []; for (var j = 0; j < cells.length; j += 7) trs.push("<tr>" + cells.slice(j, j + 7).join("") + "</tr>");
      return tpFrame("policy", d, '<table class="tp-cal"><tr>' + ["일", "월", "화", "수", "목", "금", "토"].map(function (w) { return "<th>" + w + "</th>"; }).join("") + "</tr>" + trs.join("") + "</table>"); } },
  priceBand: { nm: "가격대 × 권역 표", cat: "deal", fields: [["src", "출처·기준", "text", "국토부 실거래(계약일 기준)"], ["title", "제목", "text", "9월의 국평 실거래"], ["cols", "권역(| 구분)", "text", "강남3구 | 마용성 | 그 외 서울 | 경기"], ["rows", "가격대 줄(가격대 | 권역1 단지들(·구분) | 권역2 | …)", "rows", "30억대 | 송파 헬리오시티 · 강남 일원동가람 | | |"], ["foot", "맨 아래 메모", "text", "해당 금액대에 실거래된 단지명(최고가 아님)"]],
    auto: function () { if (typeof CH === "undefined" || !chOk()) return null; var R = CH.data.regions, G = [["강남3구", /^(11680|11650|11710)$/], ["마용성", /^(11440|11170|11200)$/], ["그 외 서울", /^11/], ["경기", /^41/]], by = {};
      Object.keys(R).forEach(function (c) { var tb = R[c].topB && R[c].topB["84"]; if (!tb) return; var gi = -1; G.forEach(function (g, i) { if (gi < 0 && g[1].test(c)) gi = i; }); if (gi < 0) return; tb.slice(0, 3).forEach(function (t) { var band = Math.floor(t.amount / 10000); if (band < 5) return; by[band] = by[band] || [[], [], [], []]; var nm = chShortGu(c) + " " + t.apt; if (by[band][gi].indexOf(nm) < 0 && by[band][gi].length < 3) by[band][gi].push(nm); }); });
      var bands = Object.keys(by).map(Number).sort(function (a, b) { return b - a; }).slice(0, 11);
      return { src: "국토부 실거래 최근 30일 84㎡대 상위 거래 · " + tpToday() + " 조회", title: chKstDate().m + "월의 국평 실거래", cols: G.map(function (g) { return g[0]; }).join(" | "), rows: bands.map(function (b) { return [b + "억대"].concat(by[b].map(function (a) { return a.join(" · "); })); }), foot: "해당 금액대에 실거래된 단지명 · 각 지역 상위 3건만 · 최고가 의미 아님" }; },
    render: function (d) { var cols = tpRows(d.cols)[0] || [], R = tpRows(d.rows);
      return tpFrame("deal", d, '<table class="tp-band"><tr><th>실거래</th>' + cols.map(function (c) { return "<th>" + tpE(c) + "</th>"; }).join("") + "</tr>" + R.map(function (r) { return "<tr><th>" + tpE(r[0]) + "</th>" + cols.map(function (_, i) { return "<td>" + String(r[i + 1] || "").split(/\s*·\s*/).filter(Boolean).map(function (a) { return "<i>" + tpE(a) + "</i>"; }).join("") + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>"); } },
  policyTimeline: { nm: "대책 총정리", cat: "policy", fields: [["src", "출처·기준", "text", "국토부·금융위 보도자료"], ["title", "제목", "text", "부동산 대책 총정리"], ["items", "대책(날짜 | 제목 | 요점1 ; 요점2 ; …)", "rows", "2025-10-15 | 10·15 대책 | 규제지역 지정 ; LTV 40%"], ["foot", "맨 아래 메모", "text", ""]],
    auto: function () { var D = (typeof MACRO !== "undefined" && MACRO.data) || {}, pm = (D.policy && D.policy.manual && D.policy.manual.items) || []; if (!pm.length) return null;
      return { src: "국토부·금융위 보도자료 · 직접 관리 목록 " + tpToday(), title: "부동산 대책 총정리", items: pm.slice(0, 4).map(function (p) { return [p.date, p.title, (p.points || []).slice(0, 4).join(" ; ")]; }), foot: "요점만 간추림 · 세부 조건·예외는 공식 자료" }; },
    render: function (d) { var R = tpRows(d.items);
      return tpFrame("policy", d, '<div class="tp-tl">' + R.map(function (r) { var dt = String(r[0] || "").replace(/^\d{2}(\d{2})-(\d{2})-(\d{2})$/, "'$1.$2.$3"); return '<div class="tp-tli"><div class="tp-tld"><b>' + tpE(dt) + "</b></div><div class=\"tp-tlb\"><h4>" + tpE(r[1]) + "</h4><ol>" + String(r[2] || "").split(/\s*;\s*/).filter(Boolean).map(function (p) { return "<li>" + tpE(p) + "</li>"; }).join("") + "</ol></div></div>"; }).join("") + "</div>", { small: R.length > 3 }); } },
  compareTable: { nm: "비교표(항목 × 상품)", cat: "loan", fields: [["src", "출처·기준", "text", "주택도시기금·주택금융공사"], ["title", "제목", "text", "주택구입 정책대출 한눈에 비교"], ["cols", "비교 대상(| 구분)", "text", "디딤돌 | 신생아 특례 | 보금자리론"], ["rows", "항목 줄(항목 | 값1 | 값2 | 값3)", "rows", "소득(부부합산) | 6천만 이하 | 1.3억 이하 | 7천만 이하"], ["foot", "맨 아래 메모", "text", ""]],
    auto: function () { var D = (typeof MACRO !== "undefined" && MACRO.data) || {}, pr = (D.loans && D.loans.manual && D.loans.manual.programs) || []; if (!pr.length) return null; var P = pr.slice(0, 3), au = D.loans.auto || {};
      return { src: "주택도시기금·주택금융공사 " + (D.loans.manual.asOf || "") + " 확인", title: "주택구입 정책대출 한눈에 비교", cols: P.map(function (p) { return p.name; }).join(" | "),
        rows: [["대상"].concat(P.map(function (p) { return p.who || ""; })), ["소득(부부합산)"].concat(P.map(function (p) { return p.income ? eok(p.income) + " 이하" : ""; })), ["소득 예외"].concat(P.map(function (p) { return p.incomeNote || ""; })), ["주택가격"].concat(P.map(function (p) { return p.price ? eok(p.price) + " 이하" : ""; })), ["최대 한도"].concat(P.map(function (p) { return p.limit ? eok(p.limit) : ""; })), ["금리"].concat(P.map(function (p) { return "연 " + (au[p.name] ? au[p.name].rate : p.rate) + "%"; })), ["LTV"].concat(P.map(function (p) { return p.ltv || ""; }))], foot: "조건은 자주 바뀜 · 신청 전 기금e든든·주택금융공사에서 재확인" }; },
    render: function (d) { var cols = tpRows(d.cols)[0] || [], R = tpRows(d.rows);
      return tpFrame("loan", d, '<table class="tp-cmp"><tr><th></th>' + cols.map(function (c) { return "<th>" + tpE(c) + "</th>"; }).join("") + "</tr>" + R.map(function (r) { return "<tr><th>" + tpE(r[0]) + "</th>" + cols.map(function (_, i) { return "<td>" + tpE(r[i + 1] || "") + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>"); } },
  rankGrid: { nm: "순위 격자 Top 12", cat: "market", fields: [["src", "출처·기준", "text", ""], ["title", "제목", "text", "1년 새 많이 오른 동네"], ["items", "항목(이름 | 값 | 보조)", "rows", "과천시 | +29.6% | 84㎡ 중위"], ["foot", "맨 아래 메모", "text", ""]],
    auto: function () { if (typeof RANKED === "undefined" || typeof chYoY !== "function" || typeof DB === "undefined" || !DB || !DB.sale) return null; var rows = RANKED.filter(function (k) { return DB.sale.series[k] && /^(11|41|28|26|27|29|30|31|36)/.test(String(k)) && !/군$/.test(chName(k)); }).map(function (k) { return { k: k, v: chYoY(k) }; }).filter(function (r) { return r.v != null; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 12); if (rows.length < 6) return null;
      return { src: "국토부 실거래 월별 집계 · " + tprMcLast() + "까지 · 수도권·광역시 시·구 · 1년 전 대비 ㎡당 중위", title: "1년 새 많이 오른 동네 TOP 12", items: rows.map(function (r) { return [chName(r.k), (r.v > 0 ? "+" : "") + r.v.toFixed(1) + "%", "1년 상승률"]; }), foot: "㎡당 중위값 비교 · 어떤 단지가 팔렸느냐에 따라 출렁일 수 있음" }; },
    render: function (d) { var R = tpRows(d.items).slice(0, tpReel() ? 20 : 12), gc = d._gc || tpGridCols(R.length);
      if (!d._gc && tprOne() && R.length > gc && R.length % gc) R = R.slice(0, R.length - R.length % gc);   /* v9.57 한 장일 때만: 마지막 줄이 비지 않게 열 수의 배수로(순위 위쪽부터 남김). 여러 장에서는 자르지 않는다(자료 빠짐 방지) */
      return tpFrame(d._cat || "market", d, '<div class="tp-grid c' + gc + '"' + (d._gr ? ' style="grid-template-rows:repeat(' + d._gr + ',minmax(0,1fr))"' : "") + '>' + R.map(function (r, i) { return '<div class="tp-cell"><small>' + ((d._off || 0) + i + 1) + "위</small><b>" + tpE(r[0]) + "</b><em>" + tpE(r[1] || "") + "</em><span>" + tpE(r[2] || "") + "</span></div>"; }).join("") + "</div>"); } },   /* v9.57.1 아래 글이 없어도 빈 칸을 둬서 % 띠 높이를 맞춘다 */
  beforeAfter: { nm: "작년 · 올해 비교", cat: "deal", fields: [["src", "출처·기준", "text", "국토부 실거래가 공개"], ["title", "제목", "text", "신고가 전·후 비교"], ["colA", "왼쪽 머리", "text", "직전 최고"], ["colB", "오른쪽 머리", "text", "이번 신고가"], ["items", "항목(이름 | 보조 | 전 값 | 전 날짜 | 후 값 | 후 날짜 | 변화)", "rows", "창동주공1단지 | 19평 | 4.4억 | 2025.1.21 | 6.1억 | 2026.10.3 | +39%"], ["foot", "맨 아래 메모", "text", ""]],
    auto: function () { if (typeof CH === "undefined" || !chOk() || typeof chHighsBetween !== "function") return null; var t1 = chDayKey(chKstNow()), L = chHighsBetween(t1 - 30, t1).filter(function (t) { return t.allPrev && t.max; }).slice(0, tpReel() ? 6 : 4); if (L.length < 2) return null;
      return { src: "국토부 실거래 · 최근 30일 신고가 · " + tpToday() + " 조회", title: "신고가, 직전 최고가와 비교", colA: "직전 최고가", colB: "이번 신고가", items: L.map(function (t) { return [t.apt, chShortGu(t.k) + " · " + (t.area ? t.area + "㎡" : t.band + "㎡대"), eok(t.allPrev[0]), String(t.allPrev[1]).replace(/(\d{4})(\d\d)(\d\d)/, "$1.$2.$3"), eok(t.max.amount), String(t.max.d).replace(/(\d{4})(\d\d)(\d\d)/, "$1.$2.$3"), "+" + t.u.toFixed(0) + "%"]; }), foot: "같은 단지·같은 면적대 역대 최고가끼리 비교 · 직거래 제외" }; },
    render: function (d) { var R = tpRows(d.items).slice(0, tpReel() ? 6 : 4);   /* v9.57 릴스형 6건 */
      return tpFrame("deal", d, '<div class="tp-ba"><div class="tp-bah"><span></span><b>' + tpE(d.colA || "전") + "</b><b>" + tpE(d.colB || "후") + "</b></div>" + R.map(function (r) { return '<div class="tp-bar"><div class="tp-ban"><b>' + tpE(r[0]) + "</b><small>" + tpE(r[1] || "") + '</small></div><div class="tp-bav"><b>' + tpE(r[2]) + "</b><small>" + tpE(r[3] || "") + '</small></div><div class="tp-bav"><i>' + tpE(r[6] || "") + "</i><b>" + tpE(r[4]) + "</b><small>" + tpE(r[5] || "") + "</small></div></div>"; }).join("") + "</div>"); } },
  listArrow: { nm: "A → B 목록", cat: "term", fields: [["src", "출처·기준", "text", ""], ["title", "제목", "text", "집 한 채에 붙는 세금"], ["sub", "부제", "text", ""], ["rows", "줄(왼쪽 | 오른쪽 | 작은 설명)", "rows", "사자니 | 취득세 | 잔금일 60일 안 신고"], ["foot", "맨 아래 메모", "text", ""]],
    auto: function () { var T = (typeof DY !== "undefined" && DY.terms) || null; if (!T) return null; var k = chKstDate(), doy = Math.floor((Date.UTC(k.y, k.m - 1, k.d) - Date.UTC(k.y, 0, 1)) / 86400000);
      var nW = Math.min(T.length, tpReel() ? 9 : 6), ix = []; for (var q = 0; q < nW; q++) ix.push(q);   /* v9.57 릴스형은 단어 9개 */
      return { src: "우상향연구소 용어 사전", title: "오늘의 부동산 단어 " + nW, sub: "같은 기사도 다르게 읽히는 말", rows: ix.map(function (i) { var t = T[(doy + i) % T.length]; return [t[0], t[1], (t[2] || [])[0] || ""]; }), foot: "" }; },
    render: function (d) { var R = tpRows(d.rows).slice(0, tpReel() ? 10 : 8);
      return tpFrame("term", d, '<div class="tp-list">' + R.map(function (r) { return '<div class="tp-li"><b>' + tpE(r[0]) + '</b><span class="tp-arr">→</span><em>' + tpE(r[1] || "") + "</em>" + (r[2] ? "<small>" + tpE(r[2]) + "</small>" : "") + "</div>"; }).join("") + "</div>"); } },
  quote: { nm: "발언 · 이슈", cat: "issue", fields: [["src", "출처·기준", "text", "국정감사(2026.10.12) · 동아일보"], ["badge", "분류 띠", "text", "부동산이슈"], ["tag", "빨간 띠(누가·어디서)", "text", "국정감사 주요 발언"], ["title", "제목(큰따옴표 발언)", "text", ""], ["who", "발언자 소개(이름 | 직함)", "text", "홍길동 | LH 사장"], ["quotes", "발언 요지(한 줄에 하나)", "lines", ""], ["profile", "약력 칸(한 줄에 하나)", "lines", ""], ["foot", "맨 아래 메모", "text", "발언 요지는 기사·속기록 기준"]],
    auto: function () { return null; },
    render: function (d) { var who = tpRows(d.who)[0] || [];
      return tpFrame("issue", d, '<div class="tp-q"><div class="tp-qp"><div class="tp-qw"><b>' + tpE(who[0] || "") + "</b><small>" + tpE(who[1] || "") + '</small></div><div class="tp-qpro">' + tpLines(d.profile).slice(0, 6).map(function (p) { return "<i>" + tpE(p) + "</i>"; }).join("") + '</div></div><div class="tp-qt">' + tpLines(d.quotes).slice(0, 4).map(function (q) { return "<p>" + tpE(q) + "</p>"; }).join("") + "</div></div>"); } },
  /* v9.79 청약 캘린더 — 날짜 → 시·도 → 구·군 → 동 → 단지 순으로 묶어 한눈에(같은 날짜·같은 시는 칸을 합침) */
  subsCal: { nm: "청약 캘린더(일자별)", cat: "subs", fields: [["src", "출처·기준", "text", "청약홈 공고 · 2026.10.26 기준"], ["title", "제목", "text", "10월 다섯째 주 청약 캘린더"], ["sub", "부제", "text", "10.26~11.1 · 접수 9곳"], ["rows", "줄(날짜 | 구분 | 시 | 구·군 | 동 | 단지명 | 분양가·세대)", "rows", "10.27(화) | 1순위 | 경기 | 화성시 | 반송동 | 아크메르 동탄 95 | 84㎡ 5.9억 · 1,122세대"], ["foot", "맨 아래 메모", "text", ""]],
    auto: function () { return null; },
    render: function (d) {
      var R = tpRows(d.rows).filter(function (r) { return r.join("").trim(); }), H = "";
      var spanOf = function (i, c, same) { var n = 1; while (i + n < R.length && same(R[i + n], R[i]) && (c === 0 || R[i + n][0] === R[i][0])) n++; return n; };
      var dS = {}, sS = {};
      for (var i = 0; i < R.length; i++) { if (i === 0 || R[i][0] !== R[i - 1][0]) dS[i] = spanOf(i, 0, function (a, b) { return a[0] === b[0]; }); if (i === 0 || R[i][0] !== R[i - 1][0] || R[i][2] !== R[i - 1][2]) sS[i] = spanOf(i, 2, function (a, b) { return a[2] === b[2]; }); }
      R.forEach(function (r, i) {
        var k = String(r[1] || ""), kc = /특공|특별/.test(k) ? "sp" : /무순위/.test(k) ? "rem" : /발표|당첨/.test(k) ? "win" : "r1";
        H += "<tr" + (dS[i] ? ' class="sc-first"' : "") + ">" + (dS[i] ? '<td class="sc-d" rowspan="' + dS[i] + '"><b>' + tpE(String(r[0]).replace(/^\d+\./, "").replace(/\((.)\)/, "")) + '</b><small>' + tpE(String(r[0]).split(".")[0] + "월 " + ((String(r[0]).match(/\((.)\)/) || [])[1] || "")) + "</small></td>" : "") +
          '<td class="sc-k"><i class="k-' + kc + '">' + tpE(k) + "</i></td>" + (sS[i] ? '<td class="sc-s" rowspan="' + sS[i] + '">' + tpE(r[2] || "") + "</td>" : "") + '<td class="sc-g">' + tpE(r[3] || "") + '</td><td class="sc-e">' + tpE(r[4] || "") + '</td><td class="sc-n">' + tpE(r[5] || "") + (r[6] ? "<small>" + tpE(r[6]) + "</small>" : "") + "</td></tr>";
      });
      return tpFrame("subs", d, '<table class="tp-tbl tp-sc tp-nofold"><tr><th class="sc-d">날짜</th><th class="sc-k">구분</th><th class="sc-s">시</th><th class="sc-g">구·군</th><th class="sc-e">동</th><th class="sc-n">단지명</th></tr>' + H + "</table>");
    } },
  lineTable: { nm: "노선 · 현황 표", cat: "transit", fields: [["src", "출처·기준", "text", "국토부·국가철도공단"], ["title", "제목", "text", "GTX 노선 개통 일정"], ["cols", "표 머리(| 구분)", "text", "노선 | 상태 | 개통(예정) | 비고"], ["rows", "줄(| 구분)", "rows", "GTX-A | 개통 | 2024.12 | 삼성역 2028"], ["foot", "맨 아래 메모", "text", ""]],
    auto: function () { var D = (typeof MACRO !== "undefined" && MACRO.data) || {}, L = (D.transit && D.transit.manual && D.transit.manual.lines) || []; if (!L.length) return null;
      return { src: "국토부·국가철도공단 발표 · 직접 관리 목록 " + tpToday(), title: "수도권 광역철도, 어디까지 왔나", cols: "노선 | 상태 | 개통(예정) | 비고", rows: L.slice(0, 9).map(function (l) { return [l.name, l.status, String(l.open || "").replace(/^(\d{4})-(\d{2})$/, function (_, y, m) { return m === "00" ? y + "년" : y + "." + Number(m); }).replace("0000년", "미정"), (l.note || "").slice(0, 22)]; }), foot: "개통 예정은 공정에 따라 미뤄질 수 있음" }; },
    render: function (d) { var cols = tpRows(d.cols)[0] || [], R = tpRows(d.rows);
      var LT = tpLongTbl(R);
      return tpFrame(d._cat || "transit", d, '<table class="tp-tbl' + (LT ? " tp-ltx tp-nogrow" : "") + '"><tr>' + cols.map(function (c) { return "<th>" + tpE(c) + "</th>"; }).join("") + "</tr>" + R.map(function (r) { return "<tr>" + cols.map(function (_, i) { var v = r[i] || ""; return "<td" + (i === 1 ? ' class="st-' + tpE(v) + '"' : "") + ">" + (LT ? tpCell(v, i === cols.length - 1) : tpE(v)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>"); } }
};
/* ── v9.23 추가 양식 ── */
/* 촘촘한 표: 줄이 많으면(칸 3개 이하) 두 단으로 나눠 담는다 */
TPL.denseTable = { nm: "촘촘한 표", cat: "deal", fields: [["src", "출처·기준", "text", ""], ["title", "제목", "text", "서울 구별 실거래 시세"], ["sub", "부제", "text", ""], ["cols", "표 머리(| 구분)", "text", "구 | 평당 | 거래"], ["rows", "줄(| 구분)", "rows", "강남구 | 1.29억 | 56건"], ["foot", "맨 아래 메모", "text", ""]],
  auto: function () { return null; },
  render: function (d) { var cols = tpRows(d.cols)[0] || [], R = tpRows(d.rows), two = cols.length <= 4 && R.length > 13 && R.every(function (r) { return r.every(function (v) { return String(v || "").length <= 10; }); }), half = two ? Math.ceil(R.length / 2) : R.length;
    var wr = R.some(function (r) { return r.some(function (v) { return String(v || "").length > 22; }); }); var tb = function (rows, off) { return '<table class="tp-dense' + (wr ? " tp-wr" : "") + '"><tr><th class="no"></th>' + cols.map(function (c) { return "<th>" + tpE(c) + "</th>"; }).join("") + "</tr>" + rows.map(function (r, i) { return '<tr><td class="no">' + (off + i + 1) + "</td>" + cols.map(function (_, k) { var v = String(r[k] || ""); return "<td" + (/^[+]/.test(v) ? ' class="up"' : /^[−-]\d/.test(v) ? ' class="down"' : "") + ">" + (wr && k === cols.length - 1 && v.length > 14 ? tpCell(v, true) : tpE(v)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table>"; };
    return tpFrame(d._cat || "deal", d, two ? '<div class="tp-2tb">' + tb(R.slice(0, half), d._off || 0) + tb(R.slice(half), (d._off || 0) + half) + "</div>" : tb(R, d._off || 0)); } };
/* 대장 3개씩: 한 줄 = 지역 + 대장 1·2·3위 칸(단지 · 가격 · 보조) */
TPL.leaderGrid = { nm: "지역별 TOP 3 칸", cat: "deal", fields: [["src", "출처·기준", "text", ""], ["title", "제목", "text", "서울 구별 대장아파트 TOP 3"], ["sub", "부제", "text", ""], ["rows", "줄(지역 | 단지1 ; 가격1 ; 보조1 | 단지2 ; … | 단지3 ; …)", "rows", "강남구 | 디에이치자이개포 ; 33억 ; 2021 · 1,996세대 | …"], ["foot", "맨 아래 메모", "text", ""]],
  auto: function () { return null; },
  render: function (d) { var R = tpRows(d.rows);
    return tpFrame(d._cat || "deal", d, '<div class="tp-lead"><div class="tp-ldh"><span></span><b>1위</b><b>2위</b><b>3위</b></div>' + R.map(function (r) { return '<div class="tp-ldr"><span class="tp-ldg">' + tpE(r[0]) + "</span>" + [1, 2, 3].map(function (k) { var x = String(r[k] || "").split(/\s*;\s*/); return '<div class="tp-ldc' + (k === 1 ? " g" : "") + '">' + (x[0] ? "<b>" + tpE(x[0]) + "</b><em>" + tpE(x[1] || "") + "</em>" + (x[2] ? "<small>" + tpE(x[2]) + "</small>" : "") : "<i>–</i>") + "</div>"; }).join("") + "</div>"; }).join("") + "</div>"); } };

/* ══ 카드 만들기 — 재료(레시피) × 지역·평형 × 양식 ══ */
var TPR_BANDS = [["84", "84㎡대(국평)"], ["59", "59㎡대"], ["L", "대형"], ["S", "소형"], ["all", "전체 평형"]];
function tprScopes() { var o = []; (typeof BRIEF_GROUPS !== "undefined" ? BRIEF_GROUPS : []).forEach(function (g) { o.push([g.id, g.name]); g.subs.forEach(function (x) { o.push([x.id, g.name + " · " + x.name]); }); }); return o; }
function tprCodes(sc) { return typeof briefCodes === "function" ? briefCodes(sc) : []; }
function tprScopeNm(sc) { return typeof briefScopeName === "function" ? briefScopeName(sc) : sc; }
function tprReg() { return (typeof CH !== "undefined" && CH.data && CH.data.regions) || (typeof BRIEF !== "undefined" && BRIEF.regions) || {}; }
function tprD(n) { return n ? String(n).replace(/^\d{2}(\d{2})(\d{2})(\d{2})$/, "$1.$2.$3") : ""; }
function tprNm(k) { return typeof chName === "function" ? chName(k) : k; }
function tprGu(k) { var n = tprNm(k); return n.replace(/^(서울|경기|인천|부산|대구|광주|대전|울산|세종) /, ""); }
function tprBasis() { var d = typeof CH !== "undefined" && CH.data && CH.data.asOf; return d ? "국토부 실거래 · 최근 30일 계약 · " + tprD(d) + " 수집" : "국토부 실거래"; }
function tprBandNm(b) { return { "84": "84㎡대", "59": "59㎡대", L: "대형", S: "소형", all: "" }[b] || ""; }
/* 줄 목록 → 여러 장 */
function tprClone(base) { var d = {}; for (var k in base) d[k] = base[k]; return d; }
/* v9.32 분량 — 한 장(핵심 요약): 1장에 최대한 많이(넘치면 맨 아래부터 접어 빈칸·잘림 없이) · 여러 장(상세): 장마다 고르게 나눠 담는다 */
function tprOne() { return TP.o.size === "one"; }
/* v9.57.2 순위 격자 열 수 — 6·9개 3열, 10·15개 5열, 그 밖 4열 */
function tpGridCols(n) { return n <= 6 || n === 9 ? 3 : n === 10 || n === 15 ? 5 : 4; }
/* v9.56 크기 — 게시형 360×450(4:5) · 릴스형 360×640(9:16). 릴스형은 세로가 1.42배라 한 장에 줄을 더 담는다 */
function tpReel() { return typeof TP !== "undefined" && TP.o && TP.o.ratio === "reel"; }
function tpPerK(per) { return tpReel() ? Math.round(per * 1.4) : per; }
/* v9.35 장마다 고르게 — 28개·12개씩이면 12/12/4 가 아니라 10/9/9 (장마다 칸·표 높이가 같아진다) */
function tprChunk(arr, per, maxp) { var n = Math.max(1, Math.ceil(arr.length / per)); if (maxp) n = Math.min(maxp, n); var tot = Math.min(arr.length, n * per), each = Math.ceil(tot / n), out = [], off = 0; for (var i = 0; i < n && off < tot; i++) { var take = Math.min(each, tot - off); out.push({ off: off, rows: arr.slice(off, off + take) }); off += take; } return out; }
function tprItems(base, items, per) { per = tpPerK(per || 12); if (tprOne()) { var d1 = tprClone(base); d1.items = items.slice(0, tpReel() ? 20 : 12); d1._off = 0; return [d1]; } var out = [], C = tprChunk(items, per, TP.o.maxp || 3), n = C.length; for (var i = 0; i < n; i++) { var d = {}; for (var k in base) d[k] = base[k]; d.items = C[i].rows; d._off = C[i].off; if (n > 1) d.badge = (base.badge || "") + " " + (i + 1) + "/" + n; out.push(d); } return out; }
/* v9.46 긴 이름 줄이기 — 괄호 설명(회차·공공분양·인터넷뱅킹 등)을 떼고 n자에서 자른다. 표 줄이 3~4줄로 늘어나 카드가 접히던 원인 */
function tpYmdK(d) { var m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[1] + "." + Number(m[2]) + "." + Number(m[3]) : String(d || ""); }
function tpShort(s, n) { s = String(s || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim(); n = n || 18; return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function tprPaged(base, rows, per) { per = tpPerK(per || 12); if (tprOne()) { var d1 = tprClone(base); d1.rows = rows.slice(0, tpReel() ? 40 : Math.min(40, Math.max(6, per || 12))); d1._off = 0; d1._tot = rows.length; if (tpReel()) d1._more = 1;   /* v9.57 릴스 한 장: 글자를 키우지 않고 줄을 더 담는다 — 넘치는 줄은 tpFit 이 기본 글자 크기 그대로 아래부터 접고, 아래 '상위 n' 숫자를 보이는 줄 수로 고친다 */ if (rows.length > d1.rows.length) d1.foot = (d1.foot ? d1.foot + " · " : "") + "상위 " + d1.rows.length + "/" + rows.length + " — 전체는 여러 장"; return [d1]; }   /* v9.48 한 장 = 요약(상위 한 장 분량), 여러 장 = 전체 */ var out = [], n = Math.min(TP.o.maxp || 3, Math.max(1, Math.ceil(rows.length / per))); per = Math.max(1, Math.ceil(Math.min(rows.length, n * per) / n)); for (var i = 0; i < n; i++) { var d = {}; for (var k in base) d[k] = base[k]; d.rows = rows.slice(i * per, (i + 1) * per); d._off = i * per; if (n > 1) d.badge = (base.badge || "") + " " + (i + 1) + "/" + n; out.push(d); } return out; }
/* 청약·금리 재료 도우미 (v9.31) */
/* v9.36 주택형 표 — 같은 전용(84A·84B…)은 한 줄로: 평형 범위 · 최고 분양가 · 일반+특공 합산(괄호 일반) */
function tprTypeRows(it) {
  var by = {}, ord = [];
  (it.types || []).forEach(function (t) { var k = String(sbTy(t.ty)).replace(/[A-Za-z].*$/, "").trim() || sbTy(t.ty); if (!by[k]) { by[k] = { k: k, py: [], top: 0, n: 0, sp: 0 }; ord.push(k); } var g = by[k]; if (t.area) g.py.push(Math.round(t.area / 3.3058)); if (t.top > g.top) g.top = t.top; g.n += t.n || 0; g.sp += t.sp || 0; });
  return ord.map(function (k) { var g = by[k], lo = g.py.length ? Math.min.apply(null, g.py) : null, hi = g.py.length ? Math.max.apply(null, g.py) : null;
    return [k, lo == null ? "" : lo === hi ? lo + "평" : lo + "~" + hi + "평", g.top ? eok(g.top) : "", g.n + g.sp ? fmt(g.n + g.sp) + "세대" : "", g.sp ? fmt(g.n) : ""]; }).slice(0, 9);
}
function tprSubs() { return (typeof DY !== "undefined" && DY.data && DY.data.subs) || null; }
function tprSubsBasis() { var X = tprSubs(); return X ? "청약홈 " + dyYm(X.asOf) + " 수집" : "청약홈"; }
function tprArea(it) { return String(it.area || "").replace(/특별시|광역시|특별자치시|특별자치도/g, ""); }
function tprSubsRes() { var X = tprSubs(); if (!X || typeof sbResults !== "function") return []; var lim = chDayKey(chShift(chKstNow(), -60)); return sbResults(X).filter(function (r) { return r.nm && (r.win || r.b || r.notice || 0) >= lim; }); }
function tprMcLast() { var ym = String((DB && DB.sale && DB.sale.dates && DB.sale.dates[1]) || "").replace("-", "."), P = (typeof MC !== "undefined" && MC && MC.prov) || []; var n = Number(ym.replace(".", "")); return ym + (P.indexOf(n) >= 0 ? "(잠정)" : ""); }   /* v9.82 마지막 달이 잠정이면 카드 출처 줄에도 '(잠정)' */
function tprRateBasis(D) { var dc = ""; try { var cnt = {}; ["mortgage", "jeonse", "deposit", "saving"].forEach(function (k) { (D[k] || []).forEach(function (x) { if (x.dcls) cnt[x.dcls] = (cnt[x.dcls] || 0) + 1; }); }); var best = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0]; if (best) dc = String(best).slice(0, 4) + "." + String(best).slice(4, 6) + " 공시분"; } catch (e) {} return "금감원 금융상품한눈에" + (dc ? " " + dc : " 공시") + " · " + chMD(D.asOf) + " 수집" + (D.prevAt ? " · 변동은 " + chMD(D.prevAt) + " 수집분 대비" : ""); }   /* v9.82 공시월·수집일·비교 기준을 카드에 그대로 */
function tprRateRows(k, o, title) {
  var D = typeof rtData === "function" && rtData(); if (!D) return []; var loan = rtIsLoan(k), g = o.fgrp && o.fgrp !== "all" ? o.fgrp : "all", L = rtList(k, g); if (!L.length) return [];
  var d = function (c) { var v = loan ? c.dLo : c.dHi; return D.prevAt && v != null ? (Math.abs(v) < 0.005 ? "–" : (v > 0 ? "+" : "") + v.toFixed(2) + "%p") : "–"; };
  return tprPaged({ _cat: "rate", src: tprRateBasis(D), title: title, sub: (g !== "all" ? g + " · " : "") + (loan ? "최저 금리 낮은 순" : "우대 포함 최고 금리 높은 순"), badge: "금리비교",
    cols: loan ? "금융사 | 상품 | 최저 | 최고 | 지난주" : "금융사 | 상품 | 최고(우대) | 기본 | 지난주",
    foot: loan ? "우대 조건을 모두 채웠을 때 최저 · 실제 금리는 신용도·소득에 따라 다름" : "고금리 특판은 월 납입 한도·우대 조건 확인 · 예금자보호 1인당 1억(금융사별)" },
    L.map(function (c) { return loan ? [rtCo(c.co), tpShort(c.loPrd, 16), rtP(c.lo), rtP(c.hi), d(c)] : [rtCo(c.co), tpShort(c.hiPrd, 16), rtP(c.hi), rtP(c.lo), d(c)]; }), o.per);
}
var TPR = {
  regionPrice: { nm: "지역별 실거래 시세", grp: "실거래", opts: ["scope", "band"], tpls: ["denseTable", "lineTable"], per: 26,
    hint: "구·시마다 최근 30일 거래 건수와 평당 중위값(전용 기준), 한 달 전 같은 시점 대비 변화",
    build: function (o) { var R = tprReg(), b = o.band, rows = tprCodes(o.scope).map(function (c) { var r = R[c]; if (!r || r.error) return null; var x = b === "all" ? { n: r.count, pm: r.pm, ppm: r.prevPm } : (r.bands || {})[b]; if (!x || !x.n || !x.pm) return null; var ch = x.ppm ? (x.pm / x.ppm - 1) * 100 : null; return { k: c, pm: x.pm, row: [tprGu(c), eok(Math.round(x.pm * 3.3058)), fmt(x.n) + "건", ch == null || x.n < 10 ? "" : (ch >= 0 ? "+" : "−") + Math.abs(ch).toFixed(1) + "%"] }; }).filter(Boolean).sort(function (a, b) { return b.pm - a.pm; });
      return tprPaged({ _cat: "deal", src: tprBasis() + " · 평당 = ㎡당 중위 × 3.3058(전용)", title: tprScopeNm(o.scope) + " " + (tprBandNm(b) || "아파트") + " 실거래 시세", sub: "평당 중위값 높은 순 · 거래 10건 미만은 변화 빈칸", badge: "아파트실거래", cols: "지역 | 평당 | 30일 | 변화", foot: "중위값은 어떤 단지가 팔렸느냐에 따라 출렁일 수 있음" }, rows.map(function (x) { return x.row; }), o.per); } },
  topDeal: { nm: "지역별 최고 거래가", grp: "실거래", opts: ["scope", "band"], tpls: ["denseTable", "lineTable"], per: 14,
    hint: "구·시마다 최근 30일 가장 비싸게 거래된 1건 (단지·면적·가격·계약일)",
    build: function (o) { var R = tprReg(), b = o.band, rows = tprCodes(o.scope).map(function (c) { var r = R[c]; if (!r || r.error) return null; var t = b === "all" ? (r.top || [])[0] : ((r.topB || {})[b] || [])[0]; if (!t) return null; return { a: t.amount, row: [tprGu(c), t.apt + " " + Math.round(t.area) + "㎡", eok(t.amount), tprD(t.d)] }; }).filter(Boolean).sort(function (a, b) { return b.a - a.a; });
      return tprPaged({ _cat: "deal", src: tprBasis(), title: tprScopeNm(o.scope) + " 최고 거래가" + (tprBandNm(b) ? " · " + tprBandNm(b) : ""), sub: "지역마다 최근 30일 가장 비싼 거래 1건 · 비싼 순", badge: "아파트실거래", cols: "지역 | 단지·전용 | 거래가 | 계약일", foot: "직거래 제외 · 신고 기한(30일) 때문에 최근 건은 늘어날 수 있음" }, rows.map(function (x) { return x.row; }), o.per); } },
  leaders: { nm: "지역별 대장 TOP 3", grp: "대장", opts: ["scope", "band"], tpls: ["leaderGrid", "denseTable"], per: 7,
    hint: "구·시마다 대장아파트 3곳(500세대↑·20년 이내 중 ㎡당가 상위) — 최근 거래가 · 연식 · 세대수",
    build: function (o, tid) { var R = tprReg(), b = o.band === "all" ? "84" : o.band, rows = [];
      tprCodes(o.scope).forEach(function (c) { var r = R[c]; var L = r && r.leaders && r.leaders[b]; if (!L || !L.length) return; var cell = function (x) { return x ? String(x.apt).replace(/&amp;/g, "&").replace(/;/g, ",") + " ; " + (x.p ? eok(x.p[0]) : "") + " ; " + [x.by ? x.by + "년" : "", x.hh ? fmt(x.hh) + "세대" : ""].filter(Boolean).join(" · ") : ""; };
        rows.push({ v: L[0].p ? L[0].p[0] : 0, row: tid === "denseTable" ? [tprGu(c), L.map(function (x) { return x.apt; }).join(" · "), L[0].p ? eok(L[0].p[0]) : ""] : [tprGu(c), cell(L[0]), cell(L[1]), cell(L[2])] }); });
      rows.sort(function (a, b) { return b.v - a.v; });
      return tprPaged({ _cat: "deal", src: "국토부 실거래 · K-apt 단지 정보 · " + tprBandNm(b) + " · 가격 = 그 단지 최근 거래가", title: tprScopeNm(o.scope) + " 대장아파트 TOP 3", sub: tprBandNm(b) + " · 1위 단지 최근 거래가 높은 순", badge: "대장아파트", cols: "지역 | 대장 1·2·3위 | 1위 거래가", foot: "대장 = 500세대↑·20년 이내 중 ㎡당가 상위(없으면 300→150세대) · 매수 추천 아님" }, rows.map(function (x) { return x.row; }), tid === "denseTable" ? 14 : o.per); } },
  busy: { nm: "거래 많은 단지", grp: "실거래", opts: ["scope", "band"], tpls: ["lineTable", "denseTable"], per: 12,
    hint: "최근 30일 같은 단지·평형에서 거래가 많았던 곳 (건수 · 최고가 · 전세 중위)",
    build: function (o) { var R = tprReg(), b = o.band, L = []; tprCodes(o.scope).forEach(function (c) { var r = R[c]; ((r && r.busy) || []).forEach(function (x) { if (b !== "all" && String(x.band) !== b && !(b === "L" && x.band >= 101) && !(b === "S" && x.band <= 46)) return; L.push({ n: x.n, row: [x.apt + " (" + tprGu(c) + ")", x.band + "㎡대", fmt(x.n) + "건", x.max ? eok(x.max.amount) : "", x.jeMed ? eok(x.jeMed) : ""] }); }); });
      L.sort(function (a, b) { return b.n - a.n; });
      return tprPaged({ _cat: "deal", src: tprBasis(), title: tprScopeNm(o.scope) + " 거래 많은 단지", sub: "최근 30일 같은 단지·면적대 매매 건수 순", badge: "아파트실거래", cols: "단지 | 면적 | 매매 | 최고가 | 전세 중위", foot: "입주장 단지·일괄거래 제외" }, L.map(function (x) { return x.row; }), o.per); } },
  newHigh: { nm: "신고가 TOP", grp: "실거래", opts: ["scope"], tpls: ["rankGrid", "denseTable", "beforeAfter"], per: 12,
    hint: "최근 30일 신고가(역대 최고가 경신) 중 상승폭 큰 순",
    build: function (o, tid) { if (typeof chCollect !== "function") return []; var codes = tprCodes(o.scope), L = chCollect(codes, "newHighAll").filter(function (t) { return t.upAll > 0 && t.max; }).sort(function (a, b) { return b.upAll - a.upAll; });
      if (tid === "beforeAfter") return tprItems({ _cat: "deal", badge: "아파트실거래", src: tprBasis(), title: tprScopeNm(o.scope) + " 신고가, 직전 최고가와 비교", colA: "직전 최고가", colB: "이번 신고가", foot: "같은 단지·면적대 역대 최고가끼리 비교" }, L.filter(function (t) { return t.allPrev; }).map(function (t) { return [t.apt, tprGu(t.k) + " · " + (t.area ? t.area + "㎡" : t.band + "㎡대"), eok(t.allPrev[0]), tprD(t.allPrev[1]), eok(t.max.amount), tprD(t.max.d), "+" + t.upAll.toFixed(0) + "%"]; }), 4);
      var base = { _cat: "deal", src: tprBasis() + " · 직전 최고가 대비", title: tprScopeNm(o.scope) + " 신고가 TOP", badge: "아파트실거래", cols: "단지 | 지역·전용 | 거래가 | 상승", foot: "직거래 제외 · 같은 단지·면적대 역대 최고가 대비" };
      if (tid === "denseTable") return tprPaged(base, L.map(function (t) { return [t.apt, tprGu(t.k) + " " + (t.area || t.band) + "㎡", eok(t.max.amount), "+" + t.upAll.toFixed(1) + "%"]; }), 14);
      return tprItems(base, L.map(function (t) { return [t.apt, "+" + t.upAll.toFixed(1) + "%", tprGu(t.k) + " · " + eok(t.max.amount)]; }), 12); } },
  volRank: { nm: "거래량 순위", grp: "시장", opts: ["scope"], tpls: ["rankGrid", "denseTable"], per: 12,
    hint: "최근 30일 아파트 매매 건수 많은 지역",
    build: function (o, tid) { var R = tprReg(), L = tprCodes(o.scope).map(function (c) { var r = R[c]; return r && !r.error && r.count ? { k: c, n: r.count } : null; }).filter(Boolean).sort(function (a, b) { return b.n - a.n; });
      var base = { _cat: "market", src: tprBasis(), title: tprScopeNm(o.scope) + " 거래량 순위", badge: "시장흐름", cols: "지역 | 30일 매매", foot: "신고 기한 때문에 최근 2주 숫자는 계속 늘어남" };
      if (tid === "denseTable") return tprPaged(base, L.map(function (x) { return [tprGu(x.k), fmt(x.n) + "건"]; }), 26);
      return tprItems(base, L.map(function (x) { return [tprGu(x.k), fmt(x.n) + "건", "30일 매매"]; }), 12); } },
  yoy: { nm: "1년 상승률 순위", grp: "시장", opts: ["scope"], tpls: ["rankGrid", "denseTable"], per: 12,
    hint: "월별 실거래 집계로 본 1년 전 대비 ㎡당 중위값 변화",
    build: function (o, tid) { if (typeof chYoY !== "function" || typeof DB === "undefined" || !DB || !DB.sale) return []; var L = tprCodes(o.scope).filter(function (k) { return DB.sale.series[k]; }).map(function (k) { return { k: k, v: chYoY(k) }; }).filter(function (r) { return r.v != null; }).sort(function (a, b) { return b.v - a.v; });
      var base = { _cat: "market", src: "국토부 실거래 월별 집계 · " + tprMcLast() + "까지 · 1년 전 대비 ㎡당 중위", title: tprScopeNm(o.scope) + " 1년 상승률", badge: "시장흐름", cols: "지역 | 1년 변화", foot: "㎡당 중위값 비교 · 어떤 단지가 팔렸느냐에 따라 출렁일 수 있음" };
      var pc = function (v) { return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%"; };
      if (tid === "denseTable") return tprPaged(base, L.map(function (x) { return [tprGu(x.k), pc(x.v)]; }), 26);
      return tprItems(base, L.map(function (x) { return [tprGu(x.k), pc(x.v), "1년 변화"]; }), 12); } },
  gaps: { nm: "갭 작은 단지", grp: "시장", opts: ["scope"], tpls: ["lineTable", "denseTable"], per: 12,
    hint: "같은 단지·면적대 매매 중위 − 전세 중위가 작은 곳 (전세 10건↑)",
    build: function (o) { var R = tprReg(), L = []; tprCodes(o.scope).forEach(function (c) { ((R[c] && R[c].gaps) || []).forEach(function (x) { L.push({ g: x.gap, row: [x.apt + " (" + tprGu(c) + ")", x.band + "㎡대", eok(x.med), eok(x.jeMed), eok(x.gap)] }); }); });
      L.sort(function (a, b) { return a.g - b.g; });
      return tprPaged({ _cat: "market", src: tprBasis() + " · 전월세 신고 포함", title: tprScopeNm(o.scope) + " 매매·전세 차이 작은 단지", badge: "시장흐름", cols: "단지 | 면적 | 매매 중위 | 전세 중위 | 차이", foot: "규제지역·토허구역은 전세 끼고 매수 불가 · 투자 권유 아님" }, L.map(function (x) { return x.row; }), o.per); } },
  priceBand: { nm: "국평 가격대 × 권역", grp: "실거래", opts: [], tpls: ["priceBand"], build: function () { var d = TPL.priceBand.auto(); return d ? [d] : []; } },
  beforeAfter: { nm: "신고가 전·후 비교", grp: "실거래", opts: [], tpls: ["beforeAfter"], build: function () { var d = TPL.beforeAfter.auto(); return d ? [d] : []; } },
  /* ── v9.31 청약 · 금리 재료 (수집 파일 daily_data.json 의 subs · rates 그대로) ── */
  subsWeek: { nm: "이번 주·다음 주 청약", grp: "청약·일정", opts: ["wk"], tpls: ["lineTable", "denseTable"], per: 12,
    hint: "접수(특공·1순위·무순위)가 잡힌 단지 — 지역·세대·분양가·날짜 (일정은 공고 기준이라 바뀔 수 있음)",
    build: function (o) { if (typeof sbChWeekRows !== "function" || !tprSubs()) return []; var k = o.wk === "next" ? 1 : o.wk === "this" ? 0 : (sbChWeekRows(0).rows.length ? 0 : 1), R = sbChWeekRows(k), nm = k ? "다음 주" : "이번 주"; if (!R.rows.length) return [];   /* 자동: 이번 주에 남은 접수가 없으면 다음 주 */
      var row = function (r) { var it = r.it, sp = r.ev.filter(function (e) { return e[0] === "특공"; })[0], r1 = r.ev.filter(function (e) { return e[0] !== "특공"; })[0]; return [it.nm, tprArea(it) + (it.n ? " · " + fmt(it.n) + "세대" : ""), sbPrice(it) || "–", sp ? sbD(sp[1]) : "–", r1 ? (r1[0] === "무순위" ? "무순위 " : "") + sbD(r1[1]) : "–"]; };
      return tprPaged({ _cat: "subs", src: tprSubsBasis(), title: nm + " 청약 일정", sub: chMD(R.W[0]) + "~" + chMD(R.W[1]) + " · 접수 " + R.rows.length + "곳", badge: "청약", cols: "단지 | 지역·세대 | 분양가 | 특공 | 1순위", foot: "날짜는 공고 기준이라 바뀔 수 있음 · 청약홈 공고로 확인" }, R.rows.map(row), o.per); } },
  subsCal: { nm: "청약 캘린더(일자별)", grp: "청약·일정", opts: ["wk"], tpls: ["subsCal", "lineTable", "denseTable"], per: 11, noX: true,
    hint: "날짜 → 시·도 → 구·군 → 동 → 단지 순으로 묶은 접수 일정(특공·1순위·무순위) · 같은 날짜·같은 시는 칸을 합침",
    build: function (o) { if (typeof sbChWeekRows !== "function" || !tprSubs()) return []; var k = o.wk === "next" ? 1 : o.wk === "this" ? 0 : (sbChWeekRows(0).rows.length ? 0 : 1), R = sbChWeekRows(k), nm = k ? "다음 주" : "이번 주"; if (!R.rows.length) return [];
      var SIDO = { 서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종", 경기도: "경기", 강원특별자치도: "강원", 강원도: "강원", 충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전북특별자치도: "전북", 전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주" };
      var loc = function (it) { var T = String(it.addr || "").replace(/\[.*?\]/g, "").split(/\s+/).filter(Boolean), sido = SIDO[T[0]] || tprArea(it) || "", gu = "", dong = ""; for (var i = 1; i < T.length; i++) { var w = T[i]; if (/^\d/.test(w)) break; if (!gu && /(시|군|구)$/.test(w)) { gu = w.replace(/특례시$/, "시"); continue; } if (gu && !dong && /(동|읍|면|리|가)$/.test(w) && !/(시|군|구)$/.test(w)) { dong = w; break; } if (gu && /구$/.test(w) && !dong) { gu = gu + " " + w; continue; } } return [sido, gu, dong]; };
      var ev = []; R.rows.forEach(function (r) { var L = loc(r.it), nm2 = r.it.nm + (r.it.type && /오피스텔|도시형|생활숙박/.test(r.it.type) ? "(" + r.it.type.replace(/\s/g, "").slice(0, 4) + ")" : ""); var pr = sbPrice(r.it) || "", info = [pr, r.it.n ? fmt(r.it.n) + "세대" : ""].filter(Boolean).join(" · "); r.ev.forEach(function (e) { ev.push({ d: e[1], k: e[0] === "특공" ? "특공" : e[0], L: L, nm: nm2, info: info }); }); });
      ev.sort(function (a, b) { return a.d - b.d || a.L[0].localeCompare(b.L[0]) || a.L[1].localeCompare(b.L[1]) || a.nm.localeCompare(b.nm); });
      var rows = ev.map(function (e) { return [sbD(e.d), e.k, e.L[0] || "–", e.L[1] || "–", e.L[2] || "–", e.nm, e.info]; }), cap = tpReel() ? 17 : 11;
      var P = tprPaged({ _cat: "subs", src: tprSubsBasis(), title: nm + " 청약 캘린더", sub: chMD(R.W[0]) + "~" + chMD(R.W[1]) + " · 접수 " + R.rows.length + "곳 · 특공·1순위·무순위", badge: "청약", noLead: 1, _noNote: 1, foot: "날짜는 공고 기준이라 바뀔 수 있음 · 청약홈 공고로 확인", cols: "날짜 | 구분 | 시 | 구·군 | 동 | 단지명 | 분양가·세대" }, rows, cap);
      P.forEach(function (d) { if (d.rows.length > cap) d.rows = d.rows.slice(0, cap); d._more = 0; d._tot = 0; d.foot = String(d.foot || "").replace(/\s*·\s*상위 .*$/, ""); if (rows.length > d.rows.length && tprOne()) d.foot = "앞 " + d.rows.length + "건 / 전체 " + rows.length + "건 — 전체는 '여러 장' · " + d.foot; }); return P; } },
  subsRate: { nm: "청약 경쟁률 TOP", grp: "청약·일정", opts: [], tpls: ["rankGrid", "denseTable"], per: 12,
    hint: "최근 60일 발표 단지의 1순위 평균 경쟁률 높은 순",
    build: function (o, tid) { var L = tprSubsRes().filter(function (r) { return r.rate != null; }).sort(function (a, b) { return b.rate - a.rate; }); if (!L.length) return [];
      var base = { _cat: "subs", src: tprSubsBasis() + " · 1순위 신청 ÷ 일반공급", title: "최근 청약 경쟁률 TOP", badge: "청약", cols: "단지 | 지역 | 1순위 평균 | 최고(주택형)", foot: "특별공급 제외 · 1순위(해당+기타지역) 기준" };
      if (tid === "denseTable") return tprPaged(base, L.map(function (r) { return [r.nm, tprArea(r), sbRate(r.rate), r.max != null ? sbRate(r.max) + (r.maxTy ? " " + sbTy(r.maxTy) : "") : "–"]; }), 14);
      return tprItems(base, L.map(function (r) { return [r.nm, sbRate(r.rate), tprArea(r) + " · 일반 " + fmt(r.sup) + "세대"]; }), 12); } },
  subsScore: { nm: "당첨 가점 커트라인", grp: "청약·일정", opts: [], tpls: ["denseTable", "lineTable"], per: 14,
    hint: "최근 60일 발표 단지마다 해당지역 당첨 가점 최저~최고 (가장 낮게 당첨된 주택형 = 커트라인) — 가점제 물량이 있는 곳만",
    build: function () { var rows = []; tprSubsRes().forEach(function (r) { var L = (r.sc || []).filter(function (t) { return t.lo > 0; }); if (!L.length) return; var H = L.filter(function (t) { return /해당/.test(t.rs); }), B = H.length ? H : L, lo = B.slice().sort(function (a, b) { return a.lo - b.lo; })[0], hi = Math.max.apply(null, B.map(function (t) { return t.hi > 0 ? t.hi : t.lo; }));
        rows.push({ v: lo.lo, row: [r.nm, tprArea(r) + " · " + (H.length ? "해당" : (B[0].rs || "")) + " · " + sbTy(lo.ty), lo.lo + "점", hi + "점"] }); });
      if (!rows.length) return []; rows.sort(function (a, b) { return b.v - a.v; });
      return tprPaged({ _cat: "subs", src: tprSubsBasis() + " · 당첨자 발표 기준", title: "몇 점이면 당첨됐나 — 당첨 가점", sub: "단지별 커트라인(가장 낮게 당첨된 주택형) 높은 순 · 84점 만점", badge: "청약", cols: "단지 | 지역·거주·주택형 | 커트라인 | 최고", foot: "가점 = 무주택 기간 32 + 부양가족 35 + 통장 가입 기간 17 · 추첨제·공공분양은 가점 없음" }, rows.map(function (x) { return x.row; }), 14); } },
  subsPrice: { nm: "분양가 vs 주변 시세", grp: "청약·일정", opts: [], tpls: ["lineTable", "denseTable"], per: 10,
    hint: "접수 중·예정 단지의 분양가(주택형 최고가)와 같은 시군구 실거래(같은 면적) 비교 — 차이 큰 순",
    build: function (o, tid) { if (!tprSubs() || typeof sbChAll !== "function") return []; var t = sbToday(), L = sbChAll().filter(function (it) { return it.cmp && Math.max(it.e || 0, it.r2 || 0, it.win || 0) >= t; }).sort(function (a, b) { return b.cmp.diff - a.cmp.diff; }); if (!L.length) return [];
      return tprPaged({ _cat: "subs", src: tprSubsBasis() + " · 국토부 실거래(같은 시군구·같은 면적대 ㎡당 중위)", title: "새 분양가, 주변보다 얼마나 비쌀까", sub: "같은 면적 기준 · 차이 큰 순", badge: "청약", cols: "단지 | 주택형 | 분양가 | 주변 같은 면적 | 차이", foot: "분양가는 최고층 기준·발코니 확장 별도 · 주변 값은 구축 포함 중위라 새 아파트끼리 비교는 아님" },
        L.map(function (it) { var x = sbCmpLine(it); return [tpShort(it.nm, 16) + " · " + it.cmp.gu.replace(/^\S+\s/, ""), sbTy(it.cmp.ty), eok(x.sale), eok(x.near), (x.diff > 0 ? "+" : "") + x.diff.toFixed(1) + "%"]; }), tid === "lineTable" ? 7 : 10); } },   /* v9.84 노선표 꼴은 줄이 두 줄로 접혀 한 장 7줄 */
  subsShort: { nm: "미달 난 청약 단지", grp: "청약·일정", opts: [], tpls: ["denseTable", "lineTable"], per: 14,
    hint: "최근 60일 발표 단지 중 신청이 공급보다 적었던 주택형이 있는 곳 (무순위·잔여세대로 다시 나올 수 있음)",
    build: function () { var L = tprSubsRes().filter(function (r) { return /미달/.test(r.status || ""); }).sort(function (a, b) { return (a.req || 0) / (a.sup || 1) - (b.req || 0) / (b.sup || 1); }); if (!L.length) return [];
      return tprPaged({ _cat: "subs", src: tprSubsBasis() + " · 1·2순위 접수 결과", title: "미달 난 청약 단지", sub: "1순위 신청 ÷ 공급 낮은 순", badge: "청약", cols: "단지 | 지역 | 1순위 신청/공급 | 결과", foot: "미달 물량은 무순위·잔여세대 공고로 다시 나올 수 있음 · 공고로 확인" },
        L.map(function (r) { return [r.nm, tprArea(r), fmt(r.req) + " / " + fmt(r.sup), String(r.status).replace("개 주택형", "개 형")]; }), 14); } },
  rateMort: { nm: "주담대 금리 낮은 순", grp: "금리", opts: ["fgrp"], tpls: ["denseTable", "lineTable"], per: 14,
    hint: "금감원 금융상품한눈에 공시 · 아파트 담보 · 금융사별 최저 금리 낮은 순 (우대 조건 모두 채웠을 때)",
    build: function (o) { return tprRateRows("mortgage", o, "주담대 금리, 어디가 가장 낮을까"); } },
  rateJeonse: { nm: "전세대출 금리 낮은 순", grp: "금리", opts: [], tpls: ["denseTable", "lineTable"], per: 14,
    hint: "금감원 금융상품한눈에 공시 · 은행 전세자금대출 · 최저 금리 낮은 순",
    build: function (o) { return tprRateRows("jeonse", o, "전세대출 금리, 어디가 가장 낮을까"); } },
  rateDep: { nm: "예금 금리 높은 순", grp: "금리", opts: ["fgrp"], tpls: ["denseTable", "lineTable"], per: 14,
    hint: "1년 정기예금 · 우대 포함 최고 금리 높은 순 (은행·저축은행)",
    build: function (o) { return tprRateRows("deposit", o, "1년 정기예금, 어디가 가장 높을까"); } },
  rateSav: { nm: "적금 금리 높은 순", grp: "금리", opts: ["fgrp"], tpls: ["denseTable", "lineTable"], per: 14,
    hint: "1년 적금 · 우대 포함 최고 금리 높은 순 — 고금리 특판은 월 납입 한도·우대 조건 확인",
    build: function (o) { return tprRateRows("saving", o, "1년 적금, 어디가 가장 높을까"); } },
  rateBank: { nm: "은행별 대출·예금 한눈에", grp: "금리", opts: [], tpls: ["denseTable", "lineTable"], per: 14,
    hint: "은행마다 주담대 최저 · 전세대출 최저 · 1년 예금 최고를 한 줄에 — 주담대 낮은 순",
    build: function () { var D = typeof rtData === "function" && rtData(); if (!D) return []; var by = {}, put = function (k, f) { (D[k] || []).forEach(function (c) { if (c.grp !== "은행") return; var b = by[c.no] || (by[c.no] = { co: rtCo(c.co) }); b[k] = f(c); }); };
      put("mortgage", function (c) { return c.lo; }); put("jeonse", function (c) { return c.lo; }); put("deposit", function (c) { return c.hi; });
      var L = Object.keys(by).map(function (k) { return by[k]; }).filter(function (b) { return b.mortgage != null; }).sort(function (a, b) { return a.mortgage - b.mortgage; }); if (!L.length) return [];
      return tprPaged({ _cat: "rate", src: tprRateBasis(D), title: "은행별 대출·예금 금리 한눈에", sub: "주담대 최저 낮은 순 · 공시 금리", badge: "금리비교", cols: "은행 | 주담대 최저 | 전세대출 최저 | 1년 예금 최고", foot: "대출은 우대 조건 모두 채웠을 때 최저 · 예금은 우대 포함 최고 · 실제 금리는 신용도·거래 실적에 따라 다름" },
        L.map(function (b) { return [b.co, rtP(b.mortgage), rtP(b.jeonse), rtP(b.deposit)]; }), 14); } },
  rateChange: { nm: "이번 주 금리 바꾼 곳", grp: "금리", opts: [], tpls: ["denseTable", "lineTable"], per: 14,
    hint: "지난주 수집과 비교해 공시 금리를 바꾼 금융사 (대출 = 최저, 예적금 = 최고) — 두 번째 수집 주부터 나옴",
    build: function () { var D = typeof rtData === "function" && rtData(); if (!D || !D.prevAt || typeof rtChanges !== "function") return []; var C = rtChanges(D); if (!C.length) return [];
      return tprPaged({ _cat: "rate", src: tprRateBasis(D) + " · " + chMD(D.prevAt) + " 대비", title: "이번 주 금리 바꾼 곳", sub: "변화 큰 순", badge: "금리비교", cols: "금융사 | 상품 | 지금 | 지난주 대비", foot: "공시 금리는 금융사가 새로 올려야 바뀜 · 시장금리보다 몇 주 늦을 수 있음" },
        C.map(function (x) { var l = rtIsLoan(x.k); return [rtCo(x.c.co), x.nm + (l ? " 최저" : " 최고"), rtP(l ? x.c.lo : x.c.hi), (x.d > 0 ? "+" : "") + x.d.toFixed(2) + "%p"]; }), 14); } },
  aptNotice: { nm: "청약 단지 한 장", grp: "청약·일정", opts: ["item"], tpls: ["aptNotice"], build: function () { var d = TPL.aptNotice.auto(); return d ? [d] : []; } },
  calendar: { nm: "부동산 달력", grp: "청약·일정", opts: [], tpls: ["calendar"], build: function () { var d = TPL.calendar.auto(); return d ? [d] : []; } },
  policy: { nm: "대책 총정리", grp: "정책·대출·교통", opts: [], tpls: ["policyTimeline"], hint: "한 장 = 최근 대책 4개 요점 · 여러 장 = 표지 + 대책마다 한 장(요점 전부·변경 전후 표·누구에게 무슨 뜻)", build: function () { var d = TPL.policyTimeline.auto(); return d ? [d] : []; },
    detail: function (o) { var D = (typeof MACRO !== "undefined" && MACRO.data) || {}, pm = (D.policy && D.policy.manual && D.policy.manual.items) || []; if (!pm.length) return null; var cover = TPL.policyTimeline.auto(); var N = Math.min(pm.length, Math.max(2, (o.maxp || 3) * 2)), P = pm.slice(0, N), out = cover ? [cover] : [];
      P.forEach(function (p, i) { var tb = p.table && p.table.cols && p.table.rows ? p.table : null; out.push({ _tpl: "issue", _cat: "policy", src: "국토부·금융위 보도자료 · 직접 관리 목록" + (p.verify ? " · 세부 수치 확인 전" : ""), badge: "대책 " + (i + 1) + "/" + P.length, tag: p.tag || "정책", title: p.title, sub: tpYmdK(p.date) + " 발표" + (p.effective && p.effective !== p.date ? " · " + tpYmdK(p.effective) + " 시행" : ""), body: (p.points || []).slice(0, 5).concat((p.who || []).slice(0, 2).map(function (w) { return "→ " + w; })).join("\n"), relHd: tb ? "변경 전 · 후" : "", cols: tb ? tb.cols.join(" | ") : "", rows: tb ? tb.rows.slice(0, 6).map(function (r) { return r.join(" | "); }).join("\n") : "", foot: "세부 조건·예외는 공식 자료 · 투자 권유 아님" }); });
      return out; } },
  loans: { nm: "정책대출 비교", grp: "정책·대출·교통", opts: [], tpls: ["compareTable"], hint: "한 장 = 3개 상품 비교표 · 여러 장 = 비교표 + 상품마다 한 장(금리표 전체·우대·핵심 조건)", build: function () { var d = TPL.compareTable.auto(); return d ? [d] : []; },
    detail: function (o) { var D = (typeof MACRO !== "undefined" && MACRO.data) || {}, pr = (D.loans && D.loans.manual && D.loans.manual.programs) || []; if (!pr.length) return null; var cover = TPL.compareTable.auto(), out = cover ? [cover] : [], P = pr.filter(function (p) { return p.rateTable && p.rateTable.rows; });
      P.forEach(function (p, i) { var rt = p.rateTable, dc = (p.discounts || []).map(function (x) { return x[0] + " " + x[1]; }), src = "주택도시기금·주택금융공사 " + (D.loans.manual.asOf || "") + " 확인" + (rt.verify ? " · 확인 전" : ""), sub = "연 " + (p.rate || "") + "% · 한도 " + (p.limit ? eok(p.limit) : "–") + (p.limitNote ? "(" + p.limitNote.split(" (")[0] + ")" : "") + " · " + (p.who || ""), cols = ["부부합산 소득"].concat(rt.cols).join(" | "), big = rt.rows.length > 6;
        /* 금리표가 길면(신생아 특례 9구간) 조건 장 + 금리·우대 장으로 나눈다 — 한 장에 다 넣으면 접힌다 */
        out.push({ _tpl: "issue", _cat: "loan", src: src, badge: "정책대출 " + p.name, tag: "대출", title: p.name, sub: sub, body: (p.detail || []).slice(0, big ? 5 : 4).concat(!big && dc.length ? ["우대: " + dc.slice(0, 8).join(" · ")] : []).concat(!big && p.discountNote ? [p.discountNote] : []).join("\n"), relHd: big ? "소득 구간 × 만기 금리(연 %) — 1/2" : "소득 구간 × 만기 금리(연 %)", cols: cols, rows: rt.rows.slice(0, big ? 5 : 6).map(function (r) { return r.join(" | "); }).join("\n"), foot: rt.note || "" });
        if (big) out.push({ _tpl: "issue", _cat: "loan", src: src, badge: "정책대출 " + p.name + " 2", tag: "대출", title: p.name.replace(/\s*디딤돌$/, "") + " · 우대 금리", sub: "금리표 2/2(윗 구간) + 우대 조건 · " + sub.split(" · ")[0], body: (dc.length ? ["우대: " + dc.slice(0, 8).join(" · ")] : []).concat(p.discountNote ? [p.discountNote] : []).concat(p.note ? [p.note] : []).join("\n"), relHd: "소득 구간 × 만기 금리(연 %) — 2/2", cols: cols, rows: rt.rows.slice(5).map(function (r) { return r.join(" | "); }).join("\n"), foot: rt.note || "" }); });
      out.forEach(function (d, i) { if (i) d.badge = "정책대출 " + i + "/" + (out.length - 1); });
      return out; } },
  transit: { nm: "교통 노선 현황", grp: "정책·대출·교통", opts: [], tpls: ["lineTable"], hint: "한 장 = 노선 표 · 여러 장 = 표 + 노선마다 한 장(상태·개통·비고·지나는 지역)", build: function () { var d = TPL.lineTable.auto(); return d ? [d] : []; },
    detail: function (o) { var D = (typeof MACRO !== "undefined" && MACRO.data) || {}, L = (D.transit && D.transit.manual && D.transit.manual.lines) || []; if (!L.length) return null; var cover = TPL.lineTable.auto(), out = cover ? [cover] : [], P = L.slice(0, Math.max(2, (o.maxp || 3) * 3));
      P.forEach(function (l, i) { var regs = (l.regions || []).map(function (k) { var n = typeof tprNm === "function" ? tprNm(k) : ""; return n && n !== String(k) ? n : ""; }).filter(Boolean);   /* v9.59 시 전체 코드 등 이름 없는 코드는 숫자로 쓰지 않음 */ out.push({ _tpl: "issue", _cat: "transit", src: "국토부·국가철도공단 발표 · 직접 관리 목록", badge: "노선 " + (i + 1) + "/" + P.length, tag: l.status || "교통", title: l.name, sub: (l.status || "") + (l.open ? " · " + String(l.open).replace(/^(\d{4})-(\d{2})$/, function (_, y, m) { return m === "00" ? y + "년" : y + "." + Number(m); }) : ""), body: [l.note || ""].concat(regs.length ? ["지나는 지역: " + regs.join(" · ")] : []).filter(Boolean).join("\n"), foot: "개통 예정은 공정에 따라 미뤄질 수 있음" }); });
      return out; } },
  terms: { nm: "부동산 단어", grp: "상식·이슈", opts: [], tpls: ["listArrow"], hint: "한 장 = 단어 6개 한 줄 뜻 · 여러 장 = 단어마다 한 장(뜻 + 풀이)", build: function () { var d = TPL.listArrow.auto(); return d ? [d] : []; },
    detail: function (o) { var T = (typeof DY !== "undefined" && DY.terms) || null; if (!T) return null; var cover = TPL.listArrow.auto(), out = cover ? [cover] : [], R = cover ? tpRows(cover.rows) : [];
      R.forEach(function (r, i) { var t = T.filter(function (x) { return x[0] === r[0]; })[0] || [r[0], r[1], []]; out.push({ _tpl: "issue", _cat: "term", src: "우상향연구소 용어 사전", badge: "단어 " + (i + 1) + "/" + R.length, tag: "단어", title: t[0], sub: t[1], body: (t[2] || []).join("\n"), foot: "" }); });
      return out; } },
  free: { nm: "직접 입력 (빈 양식)", grp: "직접", opts: ["tpl"], tpls: null, build: function () { return []; } }
};
