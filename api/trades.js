// api/trades.js — 국토부 실거래 프록시 v2
// 변경점: numOfRows·pageNo를 국토부 API로 그대로 전달 + totalCount 응답 포함.
//        (기존 버전은 pageNo를 무시해 한 달 1,000건 초과 시군구가 잘렸다)
// v3 (2026.10): 기본으로 아파트만 — 도시형생활주택(전용 30㎡ 미만)·일괄 거래 추정분을 뺀다. &raw=1 이면 그대로.
//             매수자·매도자 구분(buyerGbn·slerGbn)도 함께 돌려준다.
// 환경변수: MOLIT_API_KEY (공공데이터포털 일반 인증키. 인코딩/디코딩 키 모두 지원)

const ENDPOINT = {
  sale: "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
  rent: "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
};

// <item>...</item> 블록에서 <tag>값</tag>을 전부 뽑는다
function parseItems(xml) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const b of blocks) {
    const inner = b.slice("<item>".length, -"</item>".length);
    const o = {};
    const re = /<([A-Za-z가-힣]+)>([\s\S]*?)<\/\1>/g;
    let m;
    while ((m = re.exec(inner))) o[m[1]] = m[2].trim();
    items.push(o);
  }
  return items;
}
const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const s = (v) => (v == null ? "" : String(v).trim());

function normalize(kind, raw) {
  const ym =
    num(s(raw.dealYear) + ("0" + s(raw.dealMonth)).slice(-2)) ??
    num(raw.dealYm) ?? num(raw["년"] ? s(raw["년"]) + ("0" + s(raw["월"])).slice(-2) : null);
  const base = {
    apt: s(raw.aptNm || raw["아파트"]),
    dong: s(raw.umdNm || raw["법정동"]),
    jibun: s(raw.jibun || raw["지번"]),
    area: num(raw.excluUseAr || raw["전용면적"]),
    ym,
    day: num(raw.dealDay || raw["일"]),
    floor: num(raw.floor || raw["층"]),
    buildYear: num(raw.buildYear || raw["건축년도"]),
  };
  if (kind === "rent") {
    const dep = num(raw.deposit || raw["보증금액"]) || 0;
    const rent = num(raw.monthlyRent || raw["월세금액"]) || 0;
    return {
      ...base,
      deposit: dep,
      rent,
      jeonse: rent === 0,
      contractTerm: s(raw.contractTerm),
      contractType: s(raw.contractType),
      useRRRight: s(raw.useRRRight),
      preDeposit: num(raw.preDeposit),
      preMonthlyRent: num(raw.preMonthlyRent),
    };
  }
  const cancelDay = s(raw.cdealDay || raw["해제사유발생일"]);
  return {
    ...base,
    amount: num(raw.dealAmount || raw["거래금액"]),
    canceled: !!cancelDay || s(raw.cdealType) === "O",
    cancelYmd: cancelDay || "-",
    dealingGbn: s(raw.dealingGbn || raw["거래유형"]) || "-",
    buyerGbn: s(raw.buyerGbn) || "-",
    landLease: s(raw.landLeaseholdGbn) || "-",
    slerGbn: s(raw.slerGbn) || "-",
  };
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

module.exports = async (req, res) => {
  try {
    const { kind = "sale", lawd, ym, numOfRows, pageNo, raw } = req.query;
    if (!ENDPOINT[kind]) return res.status(400).json({ error: "kind must be sale|rent" });
    if (!/^\d{5}$/.test(lawd || "")) return res.status(400).json({ error: "lawd must be 5 digits" });
    if (!/^\d{6}$/.test(ym || "")) return res.status(400).json({ error: "ym must be YYYYMM" });

    let key = process.env.MOLIT_API_KEY || "";
    if (!key) return res.status(500).json({ error: "MOLIT_API_KEY not set" });
    // 디코딩 키(+,/ 포함)면 인코딩하고, 이미 인코딩된 키(% 포함)는 그대로 쓴다
    if (!key.includes("%")) key = encodeURIComponent(key);

    const rows = Math.min(Math.max(parseInt(numOfRows, 10) || 1000, 1), 2000);
    const page = Math.max(parseInt(pageNo, 10) || 1, 1);
    const url =
      `${ENDPOINT[kind]}?serviceKey=${key}&LAWD_CD=${lawd}&DEAL_YMD=${ym}` +
      `&numOfRows=${rows}&pageNo=${page}`;

    const r = await fetch(url);
    const xml = await r.text();

    const code = (xml.match(/<resultCode>\s*(\S+?)\s*<\/resultCode>/) || [])[1] || "";
    if (code && code !== "000" && code !== "00") {
      const msg = (xml.match(/<resultMsg>([\s\S]*?)<\/resultMsg>/) || [])[1] || "unknown";
      // 22=요청 제한 초과, 30/31=키 문제 — 수집기가 재시도할 수 있게 에러로 준다
      return res.status(502).json({ error: `MOLIT ${code}: ${msg.trim()}` });
    }
    const totalCount = num((xml.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1]);
    const all = parseItems(xml).map((r) => normalize(kind, r));
    let items = all, excluded = null;
    if (raw !== "1") {
      const f = aptOnly(all.filter((t) => !t.canceled), kind);
      const cxl = all.filter((t) => t.canceled);        // 해제 건은 화면들이 스스로 거른다 — 그대로 둔다
      items = f.items.concat(cxl);
      excluded = { small: f.dropped.filter((t) => t.why === "small").length, bulk: f.dropped.filter((t) => t.why === "bulk").length, lease: f.dropped.filter((t) => t.why === "lease").length };
    }

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ items, totalCount, rawCount: all.length, excluded, pageNo: page, numOfRows: rows });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
