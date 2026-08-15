// api/trades.js — 국토부 실거래 프록시 v2
// 변경점: numOfRows·pageNo를 국토부 API로 그대로 전달 + totalCount 응답 포함.
//        (기존 버전은 pageNo를 무시해 한 달 1,000건 초과 시군구가 잘렸다)
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
  };
}

module.exports = async (req, res) => {
  try {
    const { kind = "sale", lawd, ym, numOfRows, pageNo } = req.query;
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
    const items = parseItems(xml).map((raw) => normalize(kind, raw));

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ items, totalCount, pageNo: page, numOfRows: rows });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
