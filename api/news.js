// /api/news?type=stock&q=삼성전자          → 종목 뉴스 (종목명으로 검색)
// /api/news?type=market&cat=main|world|market|fx|rate
// 네이버 검색 API (developers.naver.com, 공식) 사용. 하루 25,000회, 약관상 서비스 이용 가능.
// 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요. 없으면 ok:false, reason:"NO_KEY".
/* 2026-07-31 부로 개발자센터(openapi.naver.com) 신규 신청이 종료되고 검색 API가
   NAVER API HUB(네이버 클라우드 플랫폼)로 이관됐다.
   신규 발급 키는 HUB 방식만 유효하므로 HUB를 기본으로 쓰고,
   2027-06-30까지 유효한 구 개발자센터 키가 설정돼 있으면 그쪽으로 폴백한다. */
const HUB_ENDPOINT = "https://naverapihub.apigw.ntruss.com/search/v1/news";
const LEGACY_ENDPOINT = "https://openapi.naver.com/v1/search/news.json";

const MARKET_QUERY = {
  main: "증시 마감",
  world: "미국 증시 뉴욕증시",
  market: "코스피 전망",
  fx: "원달러 환율",
  rate: "기준금리 연준 한국은행"
};

function stripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim();
}

function pressFromUrl(u) {
  try {
    const host = new URL(u).hostname.replace(/^www\./, "");
    const MAP = {
      "yna.co.kr": "연합뉴스", "yonhapnewstv.co.kr": "연합뉴스TV", "news1.kr": "뉴스1", "newsis.com": "뉴시스",
      "hankyung.com": "한국경제", "mk.co.kr": "매일경제", "sedaily.com": "서울경제", "edaily.co.kr": "이데일리",
      "mt.co.kr": "머니투데이", "fnnews.com": "파이낸셜뉴스", "asiae.co.kr": "아시아경제", "heraldcorp.com": "헤럴드경제",
      "chosun.com": "조선일보", "biz.chosun.com": "조선비즈", "joongang.co.kr": "중앙일보", "donga.com": "동아일보",
      "hani.co.kr": "한겨레", "khan.co.kr": "경향신문", "kbs.co.kr": "KBS", "mbc.co.kr": "MBC", "sbs.co.kr": "SBS",
      "ytn.co.kr": "YTN", "jtbc.co.kr": "JTBC", "etnews.com": "전자신문", "zdnet.co.kr": "지디넷", "thebell.co.kr": "더벨",
      "infostockdaily.co.kr": "인포스탁", "newspim.com": "뉴스핌", "etoday.co.kr": "이투데이", "moneys.co.kr": "머니S",
      "dt.co.kr": "디지털타임스", "ajunews.com": "아주경제", "kmib.co.kr": "국민일보", "seoul.co.kr": "서울신문"
    };
    if (MAP[host]) return MAP[host];                       // 정확 일치 우선 (biz.chosun.com ≠ chosun.com)
    for (const k of Object.keys(MAP)) if (host.endsWith("." + k)) return MAP[k];
    return host;
  } catch (e) { return ""; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // HUB 키 우선, 없으면 구 개발자센터 키 (둘 중 하나만 있으면 된다)
  const hubId = process.env.NAVER_HUB_KEY_ID, hubKey = process.env.NAVER_HUB_KEY;
  const id = process.env.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET;
  const useHub = !!(hubId && hubKey);
  if (!useHub && !(id && secret)) {
    return res.status(200).json({ ok: false, reason: "NO_KEY", items: [],
      note: "네이버 검색 API 키가 설정되지 않았습니다. NAVER API HUB 키(NAVER_HUB_KEY_ID / NAVER_HUB_KEY)를 등록해 주세요." });
  }

  const type = (req.query.type || "").trim();
  const size = Math.min(30, Math.max(3, parseInt(req.query.size || "10", 10) || 10));
  let query = "";
  if (type === "stock") {
    query = (req.query.q || "").trim().slice(0, 40);
    if (!query) return res.status(400).json({ error: "q required" });
    // 종목명만 넣으면 잡음이 섞이므로 '주가'를 붙여 증권 기사 위주로 좁힌다
    query = query.replace(/\(.*?\)/g, "").trim() + " 주가";
  } else if (type === "market") {
    const cat = (req.query.cat || "main").trim();
    query = MARKET_QUERY[cat];
    if (!query) return res.status(400).json({ error: "unknown cat" });
  } else {
    return res.status(400).json({ error: "type must be stock|market" });
  }

  try {
    // HUB는 경로에 확장자가 없고 format 파라미터를 쓰며, 인증 헤더 이름도 다르다
    const qs = "?query=" + encodeURIComponent(query) + "&display=" + size + "&start=1&sort=date";
    const url = useHub ? HUB_ENDPOINT + qs + "&format=json" : LEGACY_ENDPOINT + qs;
    const headers = useHub
      ? { "X-NCP-APIGW-API-KEY-ID": hubId, "X-NCP-APIGW-API-KEY": hubKey }
      : { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret };
    const r = await fetch(url, { headers });
    if (!r.ok) {
      const t = await r.text();
      // HUB는 오류를 {error:{errorCode,message}} 형태로, 구 방식은 {errorCode,errorMessage}로 준다
      let detail = t.slice(0, 160);
      try {
        const e = JSON.parse(t);
        detail = (e.error && (e.error.message || e.error.errorCode)) || e.errorMessage || e.errorCode || detail;
      } catch (_) { /* 본문이 JSON이 아니면 원문 일부를 그대로 */ }
      const hint = r.status === 401 || r.status === 403
        ? " (키가 올바른지, HUB Application에 '검색' API가 추가됐는지 확인하세요)"
        : r.status === 429 ? " (호출 한도 초과 — 잠시 후 다시 시도됩니다)" : "";
      return res.status(200).json({
        ok: false, reason: r.status === 429 ? "RATE_LIMIT" : "UPSTREAM", items: [],
        note: "네이버 검색 API 오류 " + r.status + ": " + detail + hint,
        mode: useHub ? "hub" : "legacy"
      });
    }
    const j = await r.json();
    const items = (j.items || []).map((it) => {
      return {
        title: stripHtml(it.title),
        press: pressFromUrl(it.originallink || it.link),
        time: it.pubDate || "",
        url: it.link || it.originallink,   // 네이버 뉴스 링크 우선, 없으면 원문
        origin: it.originallink || ""
      };
    }).filter((x) => x.title);
    // 30분 CDN 캐시: 같은 검색어는 30분에 한 번만 네이버로 나간다 (사용자가 몇 명이든)
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({ ok: true, items, query, total: j.total || items.length, mode: useHub ? "hub" : "legacy" });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: "ERROR", items: [], note: e.message });
  }
}
