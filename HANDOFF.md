# TrackApt 인수인계 (HANDOFF)

> 새 세션에서 이 파일 + `index.html` + `kb_data.json` + `PROJECT.md`를 올리면 그대로 이어서 작업할 수 있습니다.
> 현재 버전: **v3.4** · 배포: https://track-apt.vercel.app · 저장소: `TrackApt`

---

## 1. 한 줄 요약

전국 아파트를 **가격 서열(급지) → 내 자금이 닿는 구간 → 그 구간 최상단 지역 → 조건 통과 단지** 순으로 좁혀 내려가는(탑다운) 부동산 분석 웹앱. 단일 `index.html`(ES5, 약 5,940줄) + Vercel 서버리스 프록시 4개. 브라우저 전용 워크플로우(GitHub 웹 UI 업로드 → Vercel 자동 배포).

---

## 2. 작업 방식 (반드시 지킬 것)

- **매 수정은 python `str.replace` 패치 + `assert count == expect`**로 진행. 앵커가 안 맞으면 패치가 조용히 실패하므로 건수 확인 필수.
- 수정 후 **`node --check`**(문법) → **jsdom 통합 테스트**(Chart/canvas/kakao/fetch 목업)로 검증한 뒤 `/mnt/user-data/outputs/`에 복사하고 `present_files`.
- 버전 배지 `<span class="ver">vX.Y</span>`를 매번 올림.
- 사용자(HM)는 초·중급 개발자, 한국어로 소통, **번호 매긴 단계별 + 체크포인트**를 선호. 로컬 개발환경 없음 — 전부 브라우저.
- 응답 마지막에 항상 **체크포인트**(배포 후 확인할 항목)를 제시.

## 3. 파일·환경

```
/home/claude/trackapt/
  index.html          # 본체 (ES5 단일 파일, <script> 인라인)
  kb_data.json        # KB 시계열 (0.95MB, 정적 — 사용자가 매달 교체)
  supply_data.sample.json  # 확장 수급 데이터 견본 (선택 파일 스키마)
  PROJECT.md          # 버전별 변경 누적 로그
  api/{trades,apt,rent,supply}.js   # Vercel 서버리스 프록시
```

- 출력은 `/mnt/user-data/outputs/`에 복사해야 사용자가 받을 수 있음.
- 검증 루틴 예시는 PROJECT.md와 과거 세션 참고. jsdom에서 `HTMLCanvasElement.prototype.getContext`를 목업하고 `Chart.defaults={}` 세팅 필요.

## 4. 키 관리 (확정)

- **카카오 JS 키**: `2d591b6ef9c70f94f369b7c55c91baa3` — `index.html` 상단 `var KAKAO_JS_KEY` 상수에 **항상 하드코딩**. `kakaoKey()`가 상수 > localStorage 순. JS 키는 도메인 제한으로 보호되므로 소스 포함 안전. 카카오 콘솔 플랫폼(Web)에 `track-apt.vercel.app` 등록 필요.
- **공공데이터 인증키** `MOLIT_API_KEY`: **절대 index.html에 넣지 않음.** Vercel 환경변수로 관리, `api/` 프록시가 서버측에서 사용(trades.js:25, apt.js:124, rent.js:18, supply.js:14).

## 5. 데이터 출처 구조 (중요)

| 화면·값 | 출처 |
|---|---|
| 매매·전세가·갭·거래건수·평당가·준공연도 | **국토부 실거래** `/api/trades` |
| 세대수·주차·지하철·학군·편의·시공사 | **K-apt** `/api/apt` (의무관리대상만 등록) |
| 지역 시세·가격지수·10년 상승률·분위·밴드 | **KB** `kb_data.json` (정적, 사용자 교체) |
| 입주 예정(분양공고) | **청약홈** `/api/supply` (실시간) |
| 미분양·준공실적·인구 | **supply_data.json** (선택 파일, 없으면 해당 분석 off) |

- **KB는 정적 파일이라 자동 갱신 안 됨** — 매달 KB 데이터허브 엑셀 → `kb_data.json` 재생성 → 교체.
- 실거래·K-apt·청약홈은 조회마다 실시간(+캐시).

## 6. 핵심 상수·구조 (코드에서 자주 건드리는 것)

- `KAKAO_JS_KEY` (상단 상수)
- `RULES` (기준·설정, 약 206줄): `wRank:35, wPerf:25, wSupply:15, wTiming:15, wCash:10` · LTV/DSR/취득세/총액상한
- 필요현금 = 매수가 − min(LTV, 총액상한, DSR) + 취득세 + 중개 0.4% + 부대. 상한: 15억↓ 6억 / 15~25억 4억 / 25억↑ 2억
- `CART_W = {rank25, perf20, timing15, supply10, danji15, cash15}` (장바구니 6축)
- `GROUPS` (약 250줄): 2단 내비 6그룹
  - 시작하기: `start`(내 조건) · `reco`(추천) · **`faq`** · `guide`(사용법)
  - 시장 공부: `market` · `vol`(거래량) · `quad`(매매·전세 흐름) · `supply`(입주물량) · `btest`(과거 검증)
  - 어디를 살까: `rank`(지역 1등) · `mapx`(지도) · `gap`(전세끼고) · `move`(갈아타기) · `rota`(다음 오를 곳)
  - 어떤 아파트: `flag`(대장) · `danji`(아파트 찾기) · `cmpx`(비교)
  - 돈·설정: `calc` · `setting`(진단 도구 포함)
  - 내 후보: `cart`
- `RANKED`: salePm 표본 24개월 미만 지역 제외, 정상 하위 구 없으면 상위 시 유지
- 데이터 접근: `getVal(key,region,y,m)`, `lastVal`, `latestYM`, `ymNum`, `disp`, `ik()`, `kbSido`, `kbLabel`

## 7. 화성 분구 처리 (2026.2, 가장 복잡했던 부분)

- 배경: 화성시가 만세·효행·병점·동탄 4구로 분구. 실거래 코드가 신설 구로 이관됐고 **기존 추정 매핑이 실제와 어긋남**(진단으로 확인: 41590=0건, 41591=남양=만세구, 41593=봉담=효행구).
- 해결(v3.0): `HWA = {old:"41590", news:["41591"~"41597"], live, guOf, oldAlive, SPLIT_YM:202602}`
  - `probeHwaCodes(ym)`: 세션당 1회 후보 코드 조회 → `HWA_ANCHOR`(구별 확실한 대표 법정동)로 `guessHwaGu()` 판정 → `HWA.guOf[코드]=구이름` 자동 기록
  - `fetchHwa(kind, ym, guName)`: 202602 미만은 41590만, 이후는 live 코드 병합(`mergeTradeResults`로 dedupe)
  - `fetchTrade`/`fetchMonths`에 `guName` 전달. 코드로 구가 갈리면 법정동 필터(`SUB_DISTRICT`) 생략(누락 방지), 메타에 "구 전용 코드로 조회" 표시
- **PENDING**: 사용자가 배포 후 설정 탭 진단(`41590-41599`)을 돌려 실제 코드↔구를 회신하면, `HWA.news`를 확정 코드로 고정해 탐지 호출 제거 예정.

## 8. 성능·안정화 (v2.x~v3.x)

- `apiGet`: 동시 3개 큐 제한 + 502/429/요청제한 시 백오프 2회 재시도. **모든 공공 API 호출이 이 경로.**
- 캐시: `TRADE_MEMO`(kind|lawd|ym) · `KAPT_INFO_MEMO` · `KAPT_LIST_MEMO` · `SUPPLY_MEMO`(시도별)
- 아파트 찾기: 실거래 도착 즉시 렌더 → K-apt는 백그라운드 병렬 부착(0.5초 배치, `DJ.loadSeq`로 이전 조회 무시)
- K-apt 이름 매칭: `normName`+`nameScore`(문자겹침+접두+동 가산, 0.62 임계) — "향촌롯데↔향촌마을롯데" 등 흡수

## 9. 최근 작업 (v3.1~v3.4) — 새 세션에서 이어질 맥락

- **v3.1**: FAQ 탭 신설(Q1~Q17 백테스트, 아코디언). 입주물량 탭 자동 조회.
- **v3.2**: 입주물량 **전국 집계 기본** — 17개 시도 병렬 조회 병합, KPI 5종, "수급 읽기" 자동 요약(배율 상·하위, 물량 top3), 시도 접두 표.
- **v3.3**: FAQ **라이브 재계산** — Q1·Q2·Q12·Q15는 `faqCompute()`가 내장 KB로 재계산해 `fb-q*`에 주입. 나머지 13개는 "고정 검증" 배지.
- **v3.4**: 
  - FAQ 주기 UI 제거 → kb_data.json 교체 감지 시 자동 재계산 + "지금 다시 계산" 버튼만.
  - **`supply_data.json`(선택 파일) 신설**: 있으면 입주물량 탭에 미분양 추이 카드 + 공급·수요·매매가격 연도별 카드 + 시군구 표 확장(인구·수요·배율·준공후미분양). 없으면 청약홈만으로 동작 + 안내.
  - 사용법 탭에 "쓴 자료 전체" 출처 표(`guideSourceTable`).

## 10. supply_data.json 스키마 (v3.4)

```jsonc
{
  "updated": "2026-08",
  "unsold":     { "dates": ["2015-07","2026-06",132], "series": { "전국": {"o":0,"v":[...]}, "경기": {...} } },
  "unsoldDone": { "dates": ["2015-07","2026-06",132], "series": { "전국": {...}, "경기 평택시": {...} } },
  "completions":{ "years": [2010,...,2025], "sido": { "전국":[...], "경기":[...] } },
  "expected":   { "items": [ {"sido":"경기","sigungu":"평택시","ym":202611,"households":9000} ] },
  "population": { "total":51088284, "sido": {"경기":13650000}, "sigungu": {"경기 평택시":620754} }
}
```
- 지역 키: `"전국"` / 시도 축약(`"경기"`) / 시군구 `"경기 평택시"`.
- 견본: `supply_data.sample.json` (구조 확인용, 실데이터 아님).

## 11. 다음 할 일 후보 (PENDING / BACKLOG)

1. **화성 코드 고정**: 진단 결과 회신받아 `HWA.news`를 실제 코드로 고정, 탐지 호출 제거.
2. **supply_data.json 실데이터화**: 통계누리 미분양·준공실적, 부동산원 입주예정, 행안부 인구 파일을 받아 변환 → 교체. (현재는 견본만)
3. KB `kb_data.json` 매달 갱신 절차(엑셀→JSON)는 PROJECT.md 참고.
4. 잠재: Capacitor 패키징(App ID `com.hmjeon.trackapt`).

## 12. 테마 (v2.4 확정 — 다크 럭셔리)

`--bg #0b1017` · `--panel #131a24` · 골드 `--brand #d4af6a`(`--gold-grad`) · 상승 `--up #2fbf9b` · 하락 `--down #e08c3a` · 현금 `--cash #e8b04b`. 활성 버튼·CTA는 골드 그라데이션+어두운 글씨, 로고 accent 그라데이션 텍스트, 카드 inset 하이라이트+딥 섀도. Chart.js 전역색·레이더 그리드·지도 핀(골드톤)·이미지 저장 배경까지 다크 통일. 규제지역은 "규제" 앰버 배지, 내 지역은 표·차트에 골드 강조(`tr.mine`, `regionCell`, `regionLabel`).

---

*이 문서는 v3.4 시점 스냅샷입니다. 세부 변경 이력은 PROJECT.md의 버전별 섹션을 참고하세요.*
