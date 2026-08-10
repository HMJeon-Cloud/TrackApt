// /api/supply?sido=경기&from=2023-08-01
// 한국부동산원 청약홈 분양정보 조회 서비스 프록시 v0.1
// APT 분양 공고의 공급세대수·입주예정년월을 모아 입주물량 추정에 쓴다.
// 활용신청: 공공데이터포털 "한국부동산원_청약홈 분양정보 조회 서비스"

const EP = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail';

function toInt(s){ return parseInt(String(s).replace(/,/g, ''), 10) || 0; }

export default async function handler(req, res) {
  const { sido, from } = req.query;
  if (!sido) return res.status(400).json({ error: 'sido(시도명, 예: 경기) 파라미터가 필요합니다.' });

  const rawKey = process.env.MOLIT_API_KEY;
  if (!rawKey) return res.status(500).json({ error: 'MOLIT_API_KEY 환경변수가 설정되지 않았습니다.' });
  const raw = rawKey.trim();
  const key = raw.includes('%') ? raw : encodeURIComponent(raw);

  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : (function(){
    const d = new Date(); d.setFullYear(d.getFullYear() - 3);
    return d.toISOString().slice(0, 10);
  })();

  try {
    const items = [];
    let page = 1, total = Infinity;
    while ((page - 1) * 500 < total && page <= 10) {   // 최대 5,000건 안전장치
      const url = EP + '?page=' + page + '&perPage=500&serviceKey=' + key
        + '&cond%5BSUBSCRPT_AREA_CODE_NM%3A%3AEQ%5D=' + encodeURIComponent(sido)
        + '&cond%5BRCRIT_PBLANC_DE%3A%3AGTE%5D=' + fromDate;
      const r = await fetch(url);
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); }
      catch (e) {
        return res.status(502).json({ error: '청약홈 응답 파싱 실패', head: text.slice(0, 300) });
      }
      if (j.errorMessage || j.msg && !j.data) {
        return res.status(502).json({ error: '청약홈 API 오류', detail: j.errorMessage || j.msg,
          hint: '공공데이터포털에서 "청약홈 분양정보 조회 서비스" 활용신청이 승인됐는지 확인하세요.' });
      }
      total = j.totalCount != null ? j.totalCount : 0;
      (j.data || []).forEach(function (d) {
        const hs = toInt(d.TOT_SUPLY_HSHLDCO);
        if (!hs) return;
        items.push({
          name: d.HOUSE_NM || '',
          addr: d.HSSPLY_ADRES || '',
          households: hs,
          moveInYm: String(d.MVN_PREARNGE_YM || '').replace(/[^0-9]/g, '').slice(0, 6),
          noticeDate: d.RCRIT_PBLANC_DE || '',
          rentSecd: d.RENT_SECD_NM || ''   // 분양주택/분양전환 가능임대 등
        });
      });
      page++;
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json({ sido, from: fromDate, count: items.length, items });
  } catch (e) {
    return res.status(502).json({ error: '프록시 요청 실패', detail: String(e) });
  }
}
