/* scripts/validate.js — 데이터 점검 (v9.5)
   market_core.json(2010~ 월별) · brief_data.json(최근 30일) · school_data.json 을 여러 방법으로 교차 검사해
   data/validate.json(배포됨: 앱이 경고 배지로 씀)과 콘솔 요약을 남긴다. 실패해도 다른 단계를 막지 않는다(exit 0).
   검사 종류: 구조 · 합계 일치 · 시계열 급변 · 단위/범위 · 서로 다른 지표 사이 모순 · 일별 신고 수 상식선 · 신고가 이상치 · 학교 자료 연결 */
var fs = require("fs"), path = require("path");
var ROOT = process.env.VROOT || path.join(__dirname, "..");
function rj(f) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { return null; } }
var M = rj("market_core.json"), B = rj("brief_data.json"), SD = rj("school_data.json");
var R = { v: 1, built: new Date().toISOString(), checks: [], bad: {} };
function add(id, level, title, detail, n) { R.checks.push({ id: id, level: level, title: title, detail: detail || "", n: n || 0 }); }
function med(a) { a = a.filter(function (x) { return x != null && isFinite(x); }).sort(function (x, y) { return x - y; }); if (!a.length) return null; var h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; }
function ymOf(i) { var t = Math.floor(M.m0 / 100) * 12 + (M.m0 % 100) - 1 + i; return Math.floor(t / 12) * 100 + (t % 12) + 1; }
function at(ser, key, i) { if (!ser || !ser[key]) return null; var j = i - ser.o; return j >= 0 && j < ser[key].length ? ser[key][j] : null; }

/* ── A. 월별 저장본 ── */
if (M) {
  var codes = Object.keys(M.regions), prov = M.prov || [], N = M.months;
  var provIdx = prov.map(function (ym) { for (var i = 0; i < N; i++) if (ymOf(i) === ym) return i; return -1; });
  /* A1 길이·오프셋 */
  var badLen = codes.filter(function (c) { var s = M.regions[c].s; return s && Object.keys(s).some(function (k) { return k !== "o" && s.o + s[k].length > N; }); });
  add("A1", badLen.length ? "error" : "ok", "배열 길이", badLen.length ? "기간보다 긴 배열 " + badLen.length + "곳: " + badLen.slice(0, 5).join(",") : "모든 지역 배열이 " + N + "개월 안", badLen.length);
  /* A2 전국 = 지역 합 (확정 달) */
  var g = M.groups["전국"], worst = 0, worstYm = null, cnt = 0;
  for (var i = 0; i < N; i++) {
    if (provIdx.indexOf(i) >= 0) continue;
    var gn = at(g.s, "n", i), sum = 0, any = false;
    codes.forEach(function (c) { var v = at(M.regions[c].s, "n", i); if (v != null) { sum += v; any = true; } });
    if (gn == null || !any || gn === 0) continue;
    var d = Math.abs(sum / gn - 1); cnt++; if (d > worst) { worst = d; worstYm = ymOf(i); }
  }
  add("A2", worst > 0.02 ? "warn" : "ok", "전국 건수 = 시·군·구 합", cnt + "개월 비교 · 최대 차이 " + (worst * 100).toFixed(2) + "%" + (worstYm ? " (" + worstYm + ")" : ""));
  /* A3 시·도 묶음 = 소속 합 */
  var sdWorst = [];
  Object.keys(M.groups).filter(function (k) { return k !== "전국"; }).forEach(function (sd) {
    var mem = codes.filter(function (c) { return M.regions[c].sd === sd; }), w = 0, wy = null;
    for (var i = Math.max(0, N - 36); i < N; i++) {
      if (provIdx.indexOf(i) >= 0) continue;
      var gn = at(M.groups[sd].s, "n", i), s2 = 0; mem.forEach(function (c) { s2 += at(M.regions[c].s, "n", i) || 0; });
      if (gn) { var d = Math.abs(s2 / gn - 1); if (d > w) { w = d; wy = ymOf(i); } }
    }
    if (w > 0.02) sdWorst.push(sd + " " + (w * 100).toFixed(1) + "% (" + wy + ")");
  });
  add("A3", sdWorst.length ? "warn" : "ok", "시·도 건수 = 소속 합 (최근 36개월)", sdWorst.length ? sdWorst.join(" · ") : "모두 2% 안");
  /* A4 평당가 급변 — 표본 30건 이상인데 한 달 새 ±35% */
  var jumps = [];
  codes.forEach(function (c) {
    var s = M.regions[c].s; if (!s) return;
    for (var i = s.o + 1; i < N; i++) {
      var a = at(s, "p", i - 1), b = at(s, "p", i), n0 = at(s, "n", i - 1), n1 = at(s, "n", i);
      if (a && b && n0 >= 30 && n1 >= 30 && Math.abs(b / a - 1) > 0.35 && provIdx.indexOf(i) < 0) jumps.push(M.regions[c].nm + " " + ymOf(i) + " " + Math.round((b / a - 1) * 100) + "% (n " + n0 + "→" + n1 + ")");
    }
  });
  add("A4", jumps.length > 20 ? "warn" : "ok", "평당가 한 달 급변(±35%, 표본 30건↑)", jumps.length + "건" + (jumps.length ? " — " + jumps.slice(-6).join(" / ") : ""), jumps.length);
  /* A5 3개월 이동중위가 원값 범위를 벗어남 */
  var p3bad = 0;
  codes.forEach(function (c) { var s = M.regions[c].s; if (!s || !s.p3) return; for (var i = s.o + 2; i < N; i++) { var v = at(s, "p3", i); if (v == null) continue; var w = [at(s, "p", i), at(s, "p", i - 1), at(s, "p", i - 2)].filter(function (x) { return x != null; }); if (w.length >= 2 && (v > Math.max.apply(null, w) * 1.25 || v < Math.min.apply(null, w) * 0.75)) p3bad++; } });
  add("A5", p3bad > 30 ? "warn" : "ok", "3개월 이동중위 ↔ 월 평당가 정합", "범위 밖 " + p3bad + "건");
  /* A6 84㎡ 가격 ÷ 평당가 = 대략 25평 (전용 84㎡ = 25.4평) */
  var ratioBad = [];
  codes.forEach(function (c) { var s = M.regions[c].s; if (!s || !s.a84) return; var i = N - 1; while (i > 0 && (at(s, "a84", i) == null || at(s, "p3", i) == null)) i--; var a = at(s, "a84", i), p = at(s, "p3", i); if (!a || !p) return; var py = a / p; if (py < 15 || py > 40) ratioBad.push(M.regions[c].nm + " " + py.toFixed(1) + "평"); });
  add("A6", ratioBad.length > 10 ? "warn" : "ok", "84㎡ 가운데값 ÷ 평당가 ≈ 25평", ratioBad.length ? "범위(15~40평) 밖 " + ratioBad.length + "곳: " + ratioBad.slice(0, 6).join(", ") : "모든 지역 범위 안");
  /* A7 전세가율 100% 넘음 (84㎡, 최근 확정 달) */
  var jr = [];
  codes.forEach(function (c) { var r = M.regions[c], s = r.s, rr = r.r; if (!s || !rr || !rr.d84) return; var i = N - 1; while (i > 0 && (provIdx.indexOf(i) >= 0 || at(s, "a84", i) == null || at(rr, "d84", i) == null)) i--; var a = at(s, "a84", i), d = at(rr, "d84", i), n = at(s, "n", i); if (a && d && n >= 10 && d / a > 1.0) jr.push(r.nm + " " + Math.round(d / a * 100) + "%"); });
  add("A7", jr.length > 5 ? "warn" : "ok", "84㎡ 전세가율 100% 초과", jr.length ? jr.length + "곳: " + jr.slice(0, 6).join(", ") : "없음 (표본 10건 이상 지역)");
  /* A8 봉인 경계 — 저장본 마지막 달 → 첫 자동 달 전국 건수 변화가 과거 같은 달 변화 범위 안인가 */
  var bl = M.baseLast, bi = -1; for (var i = 0; i < N; i++) if (ymOf(i) === bl) bi = i;
  if (bi > 0 && bi + 1 < N && provIdx.indexOf(bi + 1) < 0) {
    var cur = at(g.s, "n", bi + 1) / at(g.s, "n", bi), hist = [];
    for (var y = 1; y <= 10; y++) { var a0 = at(g.s, "n", bi - 12 * y), a1 = at(g.s, "n", bi + 1 - 12 * y); if (a0 && a1) hist.push(a1 / a0); }
    var lo = Math.min.apply(null, hist), hi = Math.max.apply(null, hist);
    add("A8", cur < lo * 0.8 || cur > hi * 1.2 ? "warn" : "ok", "저장본 → 자동 봉인 경계(" + bl + "→" + ymOf(bi + 1) + ")", "전국 건수 변화 " + cur.toFixed(2) + "배 · 지난 10년 같은 달 " + lo.toFixed(2) + "~" + hi.toFixed(2) + "배");
    var pc = at(g.s, "p3", bi + 1) / at(g.s, "p3", bi), ph = [];
    for (var y2 = 1; y2 <= 10; y2++) { var b0 = at(g.s, "p3", bi - 12 * y2), b1 = at(g.s, "p3", bi + 1 - 12 * y2); if (b0 && b1) ph.push(b1 / b0); }
    add("A9", Math.abs(pc - 1) > 0.05 ? "warn" : "ok", "경계 달 전국 평당가(3개월 중위) 변화", ((pc - 1) * 100).toFixed(1) + "% · 지난 10년 같은 달 " + ((Math.min.apply(null, ph) - 1) * 100).toFixed(1) + "~" + ((Math.max.apply(null, ph) - 1) * 100).toFixed(1) + "%");
  }
  add("A10", prov.length ? "info" : "ok", "잠정 달", prov.length ? prov.join(", ") + " — 신고 진행 중, 매일 다시 계산(정리 카드에 쓰지 않음)" : "없음");
}
/* ── B. 최근 30일 ── */
if (B) {
  var RG = B.regions, cs = Object.keys(RG).filter(function (c) { return !RG[c].error; });
  add("B1", B.failed && B.failed.length ? "warn" : "ok", "지역 수집", cs.length + "곳 성공" + (B.failed && B.failed.length ? " · 실패 " + B.failed.length + "곳: " + B.failed.slice(0, 8).join(",") : ""));
  var age = (Date.now() - new Date(B.builtAt).getTime()) / 3600000;
  add("B2", age > 36 ? "error" : "ok", "수집 시각", Math.round(age) + "시간 전 (" + B.builtAt + ")");
  /* B3 30일 건수 vs 월별 저장본 최근 확정 달 (30일 ≈ 한 달, 신고 지연으로 0.4~1.3배) */
  if (M) {
    var tot = cs.reduce(function (a, c) { return a + (RG[c].count || 0); }, 0), lastF = null;
    for (var i = M.months - 1; i >= 0; i--) if ((M.prov || []).indexOf(ymOf(i)) < 0) { lastF = i; break; }
    var mN = at(M.groups["전국"].s, "n", lastF), ratio = tot / mN;
    add("B3", ratio < 0.3 || ratio > 1.5 ? "warn" : "ok", "30일 매매 건수 ÷ 최근 확정 달 건수", fmtN(tot) + "건 ÷ " + fmtN(mN) + "건(" + ymOf(lastF) + ") = " + ratio.toFixed(2) + " (신고 지연 때문에 1보다 작은 게 정상)");
  }
  /* B4 일별 신고 수 상식선: 전국 하루 200~4,000건 */
  var DN = B.dailyNew || {}, dbad = Object.keys(DN).filter(function (k) { var v = DN[k][0]; return v < 200 || v > 4000; });
  add("B4", dbad.length ? "warn" : "ok", "날짜별 새 신고 수(전국 하루 200~4,000건)", Object.keys(DN).length + "일 · 범위 밖 " + dbad.length + "일" + (dbad.length ? ": " + dbad.map(function (k) { return k + " " + DN[k][0]; }).join(", ") : ""));
  /* B5 신고가 이상치: 이전 최고가 대비 +60% 넘는데 그 거래 1건뿐, 또는 같은 지역 ㎡당 중위의 3배 넘음 */
  var odd = [];
  cs.forEach(function (c) {
    var r = RG[c];
    (r.newHighAll || []).forEach(function (t) {
      var up = t.upAll, pm2 = t.max.amount / (t.max.area || t.area), rel = r.pm ? pm2 / r.pm : null;
      var why = [];
      if (up != null && up > 60 && (t.n || 1) <= 1) why.push("이전 최고 대비 +" + up + "% 단 1건");
      if (rel != null && rel > 3.5) why.push("㎡당가가 지역 중위의 " + rel.toFixed(1) + "배");
      if (why.length) { odd.push((M && M.regions[c] ? M.regions[c].nm : c) + " " + t.apt + " " + (t.area || t.band) + "㎡ " + Math.round(t.max.amount / 1000) / 10 + "억 — " + why.join(", ")); (R.bad[c] = R.bad[c] || []).push(t.apt + "|" + (t.area || t.band)); }
    });
  });
  add("B5", odd.length ? "warn" : "ok", "신고가 이상치(1건으로 +60% 넘거나 지역 시세 3.5배 넘음)", odd.length + "건" + (odd.length ? " — " + odd.slice(0, 6).join(" / ") : "") + " · 앱은 이 거래를 신고가 카드·글에서 빼고 '확인 필요'로 둔다", odd.length);
  /* B6 최고가 거래 이상치: ㎡당 가격이 지역 중위의 5배 넘음 */
  var topOdd = [];
  cs.forEach(function (c) { var r = RG[c]; (r.top || []).forEach(function (t) { var rel = r.pm ? t.amount / t.area / r.pm : null; if (rel && rel > 5) topOdd.push((M && M.regions[c] ? M.regions[c].nm : c) + " " + t.apt + " " + Math.round(t.area) + "㎡ " + Math.round(t.amount / 1000) / 10 + "억(" + rel.toFixed(1) + "배)"); }); });
  add("B6", topOdd.length ? "warn" : "ok", "최고가 거래 이상치(㎡당 지역 중위의 5배 넘음)", topOdd.length ? topOdd.slice(0, 6).join(" / ") : "없음");
  /* B7 대장 가격 vs 지역 가운데값: 6배 넘으면 의심 */
  var ld = [];
  cs.forEach(function (c) { var L = (RG[c].leaders || {})["84"] || []; L.forEach(function (t) { var a84 = M && M.regions[c] && M.regions[c].s ? (function () { var s = M.regions[c].s, i = M.months - 1; while (i > 0 && at(s, "a84", i) == null) i--; return at(s, "a84", i); })() : null; if (a84 && t.p && t.p[0] / a84 > 6) ld.push(M.regions[c].nm + " " + t.apt + " " + (t.p[0] / a84).toFixed(1) + "배"); }); });
  add("B7", ld.length ? "warn" : "ok", "대장 84㎡ ÷ 지역 84㎡ 가운데값 (6배 넘음)", ld.length ? ld.slice(0, 6).join(", ") : "없음");
  /* B8 30일 건수 ≥ 7일 건수 ≥ 0, 직전 30일 ≥ 0 */
  var inc = cs.filter(function (c) { var r = RG[c]; return r.weekCount > r.count || r.count < 0 || r.prevCount < 0; });
  add("B8", inc.length ? "error" : "ok", "건수 정합(7일 ≤ 30일)", inc.length ? inc.length + "곳 모순: " + inc.slice(0, 6).join(",") : "모순 없음");
  /* B9 전세·월세 30일 건수 대비 매매 — 매매가 전월세보다 많은 지역은 드묾 */
  var rs = cs.filter(function (c) { var r = RG[c]; return r.count >= 50 && (r.rentCount + (r.wolCount || 0)) < r.count * 0.3; });
  add("B9", rs.length > 10 ? "warn" : "ok", "전월세 건수가 매매의 30% 미만인 지역(50건↑)", rs.length + "곳" + (rs.length ? ": " + rs.slice(0, 6).map(function (c) { return M && M.regions[c] ? M.regions[c].nm : c; }).join(", ") : ""));
}
/* ── C. 학군 ── */
if (SD && SD.schools) {
  var S = SD.schools, ach = S.filter(function (s) { return s.avg != null; });
  add("C1", ach.some(function (s) { return !s.l; }) ? "warn" : "ok", "성취 자료 학교의 지역 연결", ach.length + "곳 중 " + ach.filter(function (s) { return s.l; }).length + "곳 연결");
  var avgBad = ach.filter(function (s) { return s.avg < 30 || s.avg > 100 || (s.Aavg != null && (s.Aavg < 0 || s.Aavg > 100)); });
  add("C2", avgBad.length ? "error" : "ok", "성취 점수 범위(평균 30~100, A 비율 0~100%)", avgBad.length ? avgBad.map(function (s) { return s.n; }).slice(0, 6).join(", ") : "모두 범위 안");
  /* 섬·분교는 학생 몇 명뿐인 게 정상 — 비정상은 음수·4,000명 초과·학급당 45명 초과만 */
  var stuBad = S.filter(function (s) { return s.st != null && (s.st < 0 || s.st > 4000 || (s.per != null && s.per > 45)); });
  add("C3", stuBad.length ? "warn" : "ok", "학생수·학급당 범위(음수·4,000명↑·학급당 45명↑)", stuBad.length + "곳" + (stuBad.length ? ": " + stuBad.slice(0, 5).map(function (s) { return s.n + " " + s.st + "명/" + s.per; }).join(", ") : ""));
  var noDong = S.filter(function (s) { return s.l && !s.d; }).length;
  add("C4", noDong > S.length * 0.4 ? "warn" : "info", "동 이름 없는 학교", noDong + "곳 / " + S.length + "곳 (동네 순위에서 빠짐, 학교 순위에는 나옴)");
}
function fmtN(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
R.summary = { error: R.checks.filter(function (c) { return c.level === "error"; }).length, warn: R.checks.filter(function (c) { return c.level === "warn"; }).length, ok: R.checks.filter(function (c) { return c.level === "ok"; }).length };
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data", "validate.json"), JSON.stringify(R, null, 1));
R.checks.forEach(function (c) { console.log((c.level === "ok" ? "  ✓ " : c.level === "info" ? "  · " : c.level === "warn" ? "  ! " : "  ✗ ") + c.id + " " + c.title + " — " + c.detail); });
console.log("데이터 점검: 오류 " + R.summary.error + " · 주의 " + R.summary.warn + " · 정상 " + R.summary.ok);
