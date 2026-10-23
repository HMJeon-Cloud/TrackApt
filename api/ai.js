// api/ai.js — 릴스 대표 카드용 글 설계(plan) · 이미지 글자 읽기(read) (v9.13)
// 주인 토큰(OWNER_KEY) 확인 후 OpenAI Responses API 호출. 키는 서버에만.
// 환경변수: OPENAI_API_KEY (필수) · TEXT_MODEL (기본 gpt-6.1-sol, 못 쓰면 gpt-4.1 로 다시 시도)
// POST { t, mode:"plan", facts:[{id,text}], purpose, topic, note, example? }  → { ok, plan:{hook, sub, kicker, layout, points:[{label,value,note,fact}], cta, visual} }
// POST { t, mode:"read", image:"data:..." }                         → { ok, texts:[...] }   (카드 이미지에 실제로 찍힌 글자·숫자 받아 적기)
// POST { t, mode:"fill", template:{name, fields:[{key,label,kind,example}]}, facts, note } → { ok, fill:{key: 값} } (v9.21 고정 양식)
// POST { t, mode:"insight", facts, question, stances? }                → { ok, insight:{answer, because[], stances[], scenarios[], watch[], risk} } (v9.33 인사이트)
// POST { t, mode:"caption", facts, card:{title,cat,src,asOf,pages}, base:{insta,threads}, note, web } → { ok, insta, threads:{main,r1,r2}, hooks[], adds[], sources[], dropped[] } (v9.60 Claude 문구 · 누를 때만)
//   환경변수: ANTHROPIC_API_KEY (문구 전용) · CLAUDE_MODEL (기본 claude-sonnet-5-5) · CLAUDE_WEB=off 이면 웹 검색 끔
// v9.61 Claude(ANTHROPIC_API_KEY): mode "verify"(카드 이미지 교차 검사) · "weekly"(주간 브리핑 초안) · "today"(기사·이슈로 오늘 주제 고르기) · "research"(분석 브리핑 외부 조사) · "extract"(키가 있으면 Claude, engine:"openai" 면 OpenAI)
// v9.63 insight 는 깊게(CLAUDE_MODEL_DEEP, 기본 claude-opus-5-5) · read 도 Claude
// v9.62 ANTHROPIC_API_KEY 가 있으면 plan · fill · insight · extract 도 Claude(TEXT_ENGINE=openai 또는 engine:"openai" 면 OpenAI) · mode "valexplain"(데이터 점검 해설). "read"(이미지 글자 읽기)는 OpenAI 그대로
// POST { t, mode:"extract", text:"공고문 텍스트" }                   → { ok, terms:{res,resPeriod,prior,resale,live,rewin,firstRank,point,down,mid,balance,option,move,etc} } (v9.20.3 단지별 청약 조건)
const crypto = require("crypto");
function tokenOf(key) { return crypto.createHmac("sha256", key).update("trackapt-owner-v1").digest("hex"); }
function same(a, b) { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && crypto.timingSafeEqual(x, y); }

const PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["kicker", "hook", "sub", "layout", "points", "cta", "visual"],
  properties: {
    kicker: { type: "string", description: "맨 위 작은 말머리 (예: '10월 실거래', '디딤돌대출') 12자 이내" },
    hook: { type: "string", description: "3초 안에 궁금하게 만드는 큰 제목. 22자 이내. 숫자를 쓰면 facts 원문 그대로" },
    sub: { type: "string", description: "제목 아래 한 줄. 무엇을 알려 주는지. 32자 이내" },
    layout: { type: "string", enum: ["rank", "stat", "compare", "steps", "checklist"] },
    points: { type: "array", minItems: 3, maxItems: 5, items: { type: "object", additionalProperties: false, required: ["label", "value", "note", "fact"],
      properties: {
        label: { type: "string", description: "항목 이름 (지역·단지·조건 등) 14자 이내" },
        value: { type: "string", description: "핵심 값. facts 원문의 숫자·날짜·단위를 한 글자도 바꾸지 말고 그대로 복사. 값이 없으면 짧은 핵심어" },
        note: { type: "string", description: "보조 설명 18자 이내 (숫자를 쓰면 facts 원문 그대로)" },
        fact: { type: "string", description: "근거 facts id (예: F3)" } } } },
    cta: { type: "string", description: "게시판으로 유도하는 한 줄. 예: '전체 순위·상세는 게시판에서'. 24자 이내" },
    visual: { type: "string", description: "배경 사진/일러스트 묘사(영어, 글자 없음). 주제에 맞는 장면" }
  }
};
const SYS = "너는 부동산 정보 SNS 채널 '우상향연구소(@uphill.lab)'의 릴스 표지 카드 편집자다. 목적: 한 장으로 핵심을 보여 주고, 상세 내용이 있는 게시판으로 유입시키는 것. " +
  "원칙: (1) 숫자·날짜·금액·퍼센트·단위는 반드시 제공된 facts 원문에서 그대로 복사한다. 반올림·환산·추정·새 숫자 금지. (2) facts에 없는 사실을 만들지 않는다. " +
  "(3) 3초 안에 흐름이 보이게: 궁금증을 유발하는 제목 → 3~5개 핵심 → 게시판 유도. 실생활에 도움이 되는 관점(내 돈, 내 동네, 내 대출)으로 쓴다. " +
  "(4) 투자 권유·과장·단정(무조건, 반드시 오른다 등) 금지. (5) 한국어, 짧고 쉬운 말. 이모지 금지.";

function extractText(j) {
  if (j.output_text) return j.output_text;
  const out = [];
  (j.output || []).forEach((o) => (o.content || []).forEach((c) => { if (c.type === "output_text" && c.text) out.push(c.text); }));
  return out.join("");
}
async function responses(key, model, input, format) {
  const body = { model, input };
  if (format) body.text = { format };
  const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || ("OpenAI 응답 " + r.status));
  return extractText(j);
}
async function withFallback(key, input, format) {
  const want = process.env.TEXT_MODEL || "gpt-6.1-sol";
  try { return { text: await responses(key, want, input, format), model: want }; }
  catch (e) {
    if (want !== "gpt-4.1" && /model|not found|does not exist|access|unsupported/i.test(String(e.message))) return { text: await responses(key, "gpt-4.1", input, format), model: "gpt-4.1" };
    throw e;
  }
}
/* v9.26 저장한 구성(양식 프리셋) — 말머리·제목 패턴·항목 구성만 본뜨고 숫자·사실은 오늘 facts 로 바꾼다 */
function exampleText(ex) {
  if (!ex || typeof ex !== "object") return "";
  const t = (v, n) => String(v == null ? "" : v).slice(0, n || 200);
  const pts = (Array.isArray(ex.points) ? ex.points : []).slice(0, 6).map((p, i) => "  항목" + (i + 1) + ": " + t(p.label, 40) + " / " + t(p.value, 40) + " / " + t(p.note, 40)).join("\n");
  return "\n\n[지난번 구성 예시 — 형식만 따를 것] 말머리=" + t(ex.kicker, 40) + " · 제목 패턴=" + t(ex.hook, 80) + " · 부제=" + t(ex.sub, 80) + " · 구성(layout)=" + t(ex.layout, 40) + " · 유도 문구=" + t(ex.cta, 60) + (ex.note ? " · 요청=" + t(ex.note, 200) : "") + (pts ? "\n" + pts : "") +
    "\n위 예시의 말머리 형식·제목 말투·항목 수와 순서·layout 을 그대로 따르라. 예시 속 숫자·날짜·이름은 절대 쓰지 말고 반드시 오늘 facts 의 값으로 바꿔라. facts 에 맞는 값이 없는 항목은 빼거나 다른 facts 로 바꿔라.";
}
const EX_FIELDS = ["res", "resPeriod", "prior", "resale", "live", "rewin", "firstRank", "point", "down", "mid", "balance", "option", "move", "etc"];
const EX_GUIDE = "너는 입주자모집공고문에서 청약 조건을 '있는 그대로' 뽑아 적는 사람이다. 공고문에 없는 내용은 빈 문자열로 둔다. 추측·일반 규칙 보충 금지. 각 항목은 한국어 한 줄(40자 이내), 공고문의 숫자·기간·지역명 그대로.\n" +
        "res: 신청 자격 거주지 요건(예: '서울특별시 거주자' / '수도권 거주자') · resPeriod: 거주 기간 요건(예: '공고일 기준 2년 이상') · prior: 지역 우선 공급 비율·순서(예: '해당지역 50% → 경기 20% → 수도권 30%') · resale: 전매 제한(예: '당첨자 발표일부터 3년') · live: 실거주 의무(예: '최초 입주 가능일부터 2년') · rewin: 재당첨 제한 · firstRank: 1순위 요건(통장 기간·예치금·세대주·주택 수) · point: 가점제/추첨제 비율 · down: 계약금(비율·납부일) · mid: 중도금(비율·회차·대출 알선 여부) · balance: 잔금 · option: 발코니 확장·옵션 비용 요약 · move: 입주 예정 시기 · etc: 그 밖에 신청 전 꼭 알아야 할 특이 조건(예: '중복 청약 불가', '부적격 시 1년 제한').";
/* ══ v9.60 Claude 문구(인스타·스레드) — 버튼 누를 때만. 우리 카드 숫자가 중심, 웹 검색은 보충(출처 있는 것만) ══
   틀린 숫자 방지: 결과의 모든 숫자(2자리 이상)는 facts 또는 웹 검색 인용문(cited_text)에 있어야 한다. 없으면 그 줄을 뺀다. */
const CAP_SYS = "너는 부동산 데이터 SNS 채널 '우상향연구소(@uphill.lab)'의 카피라이터다. 목표: 같은 카드라도 매번 다른 각도로, 저장·공유·댓글·프로필 방문을 부르는 글을 써서 노출을 늘리는 것. " +
  "원칙: (1) 숫자·날짜·금액·퍼센트는 [카드 facts] 원문 그대로 쓴다. 반올림·환산·계산한 새 숫자 금지. (2) 웹 검색은 카드 내용을 보충할 때만(정책 일정, 공식 발표, 같은 주제의 최근 사실) 쓰고, 정부·공공기관·통계기관·주요 언론만 믿는다. 웹에서 온 숫자는 그 문장에 반드시 출처 이름을 괄호로 붙이고 인용으로 남긴다. 확실하지 않으면 쓰지 않는다. " +
  "(3) 투자 권유·매수/매도 추천·단정(무조건, 반드시 오른다, 지금 사야) 금지. 공포 조장 금지. (4) 이모지 금지. 존댓말. 짧은 문장. 기준일을 꼭 적는다. " +
  "(5) 말투 기준: 숫자 한 개로 시작하는 짧은 첫 줄이 가장 잘 읽힌다. '~일까요?' 질문은 첫 줄에 한 번만. 형용사 과장(역대급, 충격, 폭등, 대박) 금지. 한 문단 2~3줄. 독자가 저장할 이유(표·기준일·비교 기준)를 남긴다. 같은 표현을 반복하지 않는다. " +
  "(6) 글의 역할: 첫 줄 = 스크롤을 멈추게 하는 질문이나 의외의 숫자(낚시 금지, 카드 안 사실로) · 본문 = 독자에게 도움이 되는 해석(내 돈·내 동네·내 대출 관점) · 끝 = 저장/댓글/프로필 방문을 부르는 한 줄(예: 우리 동네가 궁금하면 댓글로 지역을). (6) 기본 규칙 글(아래)과 다른 구성과 첫 줄로 쓴다.";
/* 글 속 숫자 → 검사할 토큰. 2자리↑ 숫자는 그대로, 한 자리는 단위가 붙은 것만(6억 · 3년 · 5%) — 단위까지 같이 찾는다 */
const CAP_UNIT = "억|조|만|천|%p|%|배|년|개월|건|세대|가구|호|곳|명";
function capNums(s) { const out = [], re = new RegExp("\\d[\\d,]*(?:\\.\\d+)?(?:\\s*(" + CAP_UNIT + "))?", "g"); let m; const t = String(s || "").replace(/#[^\s#]+/g, " ");
  while ((m = re.exec(t))) { const num = m[0].replace(new RegExp("\\s*(?:" + CAP_UNIT + ")$"), "").replace(/,/g, ""); if (num.replace(/\./g, "").length >= 2) out.push(num); else if (m[1]) out.push(num + "\u0001" + m[1]); }
  return out; }
function capPick(t, tag) { const m = new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">").exec(t); return m ? m[1].trim() : ""; }
async function claudeCall(key, model, body, ms) {
  let r; try { r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(Object.assign({ model }, body)), signal: AbortSignal.timeout(ms || 55000) }); }
  catch (e) { if (/abort|timeout/i.test(String(e && (e.name + e.message)))) throw new Error("시간 초과(55초) — '빠르게'로 다시 하거나 웹 보충을 끄고 다시 눌러 주세요"); throw e; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Claude: " + ((j.error && j.error.message) || ("응답 " + r.status)));
  return j;
}
async function caption(b) {
  const KEY = process.env.ANTHROPIC_API_KEY || ""; if (!KEY) throw new Error("ANTHROPIC_API_KEY 가 없습니다 (Vercel 환경변수)");
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-5-5", web = b.web !== false && process.env.CLAUDE_WEB !== "off";
  const facts = (b.facts || []).slice(0, 80).map((f) => f.id + ": " + String(f.text).slice(0, 300)).join("\n"); if (!facts) throw new Error("facts 가 비었습니다");
  const C = b.card || {}, B = b.base || {};
  const user = (b.note ? "[가장 중요한 요청] " + String(b.note).slice(0, 300) + "\n" : "") +
    "[카드] 제목: " + String(C.title || "").slice(0, 120) + " · 분류: " + String(C.cat || "") + " · 장 수: " + (C.pages || 1) + " · 출처: " + String(C.src || "").slice(0, 200) + " · 기준일: " + String(C.asOf || "카드 facts 참고") +
    "\n\n[카드 facts — 숫자는 이 안의 것만]\n" + facts +
    ((b.avoid || []).length ? "\n\n[최근에 쓴 첫 줄 — 이와 비슷한 첫 줄·구성은 피할 것]\n" + b.avoid.slice(0, 20).map((x) => "- " + String(x).slice(0, 80)).join("\n") : "") +
    "\n\n[기본 규칙 글 — 이것과 다른 각도로]\n인스타:\n" + String(B.insta || "").slice(0, 2500) + "\n\n스레드:\n" + String(B.threads || "").slice(0, 2500) +
    (web ? "\n\n먼저 이 주제에 보충할 최근 공식 사실(정책 시행일, 발표 일정, 관련 통계 발표)이 있는지 웹에서 1~3번만 찾아라. 카드 숫자와 다른 기준의 숫자는 섞지 말고, 없으면 보충하지 마라." : "\n\n웹 검색 없이 카드 facts 만으로 써라.") +
    "\n\n답은 아래 태그만 써라(태그 밖 글 금지).\n<insta>인스타 캡션 — 첫 줄 훅, 빈 줄로 나눈 3~6 문단, 핵심 숫자 3~6개, '함께 보면' 보충(있으면, 출처), 저장·댓글 유도 한 줄, 기준일·출처, '※ 참고 자료이며 투자 권유가 아닙니다.', 해시태그 8~12개(마지막 줄, #우상향연구소 포함). 2,000자 이내</insta>" +
    "\n<thread_main>스레드 본문 — 500자 이내. 독자가 이미 궁금해하는 질문 1줄 → 숫자 3~5줄 → 해석 1~2줄 → 기준일. 해시태그는 1개 이하</thread_main>" +
    "\n<reply1>답글 1 — 반대로 보이는 숫자나 한계, 또는 보충 사실(출처). 300자 이내</reply1>" +
    "\n<reply2>답글 2 — 댓글을 부르는 질문 하나(지역·조건을 묻기). 150자 이내</reply2>" +
    "\n<hooks>다른 첫 줄 후보 3개(숫자형 · 질문형 · 내 상황형 하나씩), 한 줄에 하나</hooks>" +
    "\n<adds>웹에서 보충한 사실, 한 줄에 하나: 내용 | 출처 이름 | 날짜 (없으면 비움)</adds>";
  const tools = web ? [{ type: "web_search_20250305", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" } }] : undefined;
  let msgs = [{ role: "user", content: user }], j = null, all = [];
  for (let k = 0; k < 3; k++) {   /* 검색이 길면 pause_turn — 받은 그대로 다시 보내 이어 쓰게 */
    j = await claudeCall(KEY, model, { max_tokens: 4000, system: CAP_SYS, messages: msgs, tools });
    all = all.concat(j.content || []);
    if (j.stop_reason !== "pause_turn") break;
    msgs = [{ role: "user", content: user }, { role: "assistant", content: j.content }];
  }
  const text = all.filter((c) => c.type === "text").map((c) => c.text).join("");
  const cites = [], srcs = {};
  all.forEach((c) => {
    (c.citations || []).forEach((x) => { if (x.cited_text) cites.push(String(x.cited_text)); if (x.url) srcs[x.url] = { url: x.url, title: x.title || x.url }; });
  });
  /* 숫자 검사: facts + 인용문 안에 있는 숫자만 허용. 2자리↑ 숫자가 근거 없으면 그 줄 빼기 */
  const okTxt = (facts + "\n" + String(C.asOf || "") + " " + String(C.title || "") + " " + String(C.src || "") + "\n" + cites.join("\n")).replace(/,/g, ""), dropped = [];
  const chk = numOk(okTxt); const clean = (s, add) => s.split("\n").filter((ln) => { if (/^\s*#/.test(ln)) return true; const bad = chk(add ? ln.split("|")[0] : ln); if (bad.length) { dropped.push(ln.trim().slice(0, 80) + "  [근거 없음: " + bad.join(", ") + "]"); return false; } return true; }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const out = { insta: clean(capPick(text, "insta")), threads: { main: clean(capPick(text, "thread_main")), r1: clean(capPick(text, "reply1")), r2: clean(capPick(text, "reply2")) },
    hooks: clean(capPick(text, "hooks")).split("\n").map((x) => x.replace(/^\s*(?:[-·•]|\d{1,2}[.)])\s*/, "").trim()).filter(Boolean).slice(0, 3),
    adds: clean(capPick(text, "adds"), 1).split("\n").map((x) => x.trim()).filter((x) => x && x.indexOf("|") > 0).slice(0, 5),
    sources: Object.values(srcs).slice(0, 8), dropped, model, searches: (j.usage && j.usage.server_tool_use && j.usage.server_tool_use.web_search_requests) || 0 };
  if (!out.insta && !out.threads.main) throw new Error("Claude 답에서 글을 찾지 못했습니다 — 다시 눌러 주세요");
  return out;
}
/* ══ v9.61 Claude 공통 — 웹 검색(선택) · pause_turn 이어 쓰기 · 인용문 모으기 · 숫자 근거 검사 ══ */
async function claudeRun(o) {
  const KEY = process.env.ANTHROPIC_API_KEY || ""; if (!KEY) throw new Error("ANTHROPIC_API_KEY 가 없습니다 (Vercel 환경변수)");
  const model = o.model || process.env.CLAUDE_MODEL || "claude-sonnet-5-5", web = o.web && process.env.CLAUDE_WEB !== "off";
  const tools = web ? [{ type: "web_search_20250305", name: "web_search", max_uses: o.web, user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" } }] : undefined;
  const t0 = Date.now(); let msgs = [{ role: "user", content: o.content }], j = null, all = [], searches = 0;
  for (let k = 0; k < 3; k++) {
    j = await claudeCall(KEY, model, { max_tokens: o.max || 4000, system: o.system, messages: msgs, tools }, Math.max(5000, 55000 - (Date.now() - t0)));
    all = all.concat(j.content || []); searches += (j.usage && j.usage.server_tool_use && j.usage.server_tool_use.web_search_requests) || 0;
    if (j.stop_reason !== "pause_turn" || Date.now() - t0 > 40000) break;
    msgs = [{ role: "user", content: o.content }, { role: "assistant", content: j.content }];
  }
  const text = all.filter((c) => c.type === "text").map((c) => c.text).join(""), cites = [], srcs = {};
  all.forEach((c) => {
    (c.citations || []).forEach((x) => { if (x.cited_text) cites.push(String(x.cited_text)); if (x.url) srcs[x.url] = { url: x.url, title: x.title || x.url }; });
    if (c.type === "web_search_tool_result" && Array.isArray(c.content)) c.content.forEach((r) => { if (r.url && !srcs[r.url]) srcs[r.url] = { url: r.url, title: r.title || r.url, seen: 1, age: r.page_age || "" }; });
  });
  return { text, cites, sources: Object.values(srcs).sort((a, b) => (a.seen ? 1 : 0) - (b.seen ? 1 : 0)).slice(0, 12), searches, model, cut: j && j.stop_reason === "pause_turn" };
}
function numOk(okTxt) { const T = String(okTxt || "").replace(/,/g, ""), T2 = T.replace(/\s+/g, "");
  const has = (n) => { if (n.indexOf("\u0001") > 0) { const a = n.split("\u0001"); return new RegExp("(?<![\\d.])" + a[0] + a[1].replace("%", "\\%")).test(T2); } const q = n.replace(/\./g, "\\."); return new RegExp("(?<![\\d.])" + q + "(?!\\d)").test(T) || new RegExp("(?<!\\d)\\d{2,4}\\.(?:\\d{1,2}\\.)?" + q + "(?![\\d])|(?<![\\d.])\\d{2,4}\\." + q + "\\.\\d{1,2}(?!\\d)").test(T); };
  return (s) => capNums(s).filter((n) => !has(n)).map((n) => n.replace("\u0001", "")); }
function jsonPick(t) { const s = capPick(t, "json") || t, m = s.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (e) { return null; } }
function factsText(b, n) { return (b.facts || []).slice(0, n || 80).map((f) => (f.id ? f.id + ": " : "") + String(f.text).slice(0, 300)).join("\n"); }
const NO_SELL = "투자 권유·매수/매도 추천·단정(무조건, 반드시) 금지. 이모지 금지. 한국어 존댓말, 쉬운 말.";

/* ① 카드 숫자 교차 검사 — 카드 이미지(보이는 그대로) ↔ 카드 칸 원본 ↔ 상식 */
async function cVerify(b) {
  const imgs = (b.images || []).filter((u) => /^data:image\/(jpeg|png);base64,/.test(String(u))).slice(0, 10);
  if (!imgs.length) throw new Error("카드 이미지가 없습니다");
  const facts = factsText(b, 120);
  const sys = "너는 부동산 데이터 카드의 최종 교정자다. 카드가 올라가기 전에 틀린 숫자·잘린 글자·앞뒤가 안 맞는 내용을 찾는다. 확실한 문제만 적고, 추측으로 고치라고 하지 않는다. 한국어.";
  const content = [{ type: "text", text: "[카드 칸 원본 — 카드가 그려진 자료]\n" + facts + "\n\n[카드 정보] " + String(b.info || "").slice(0, 400) +
    "\n\n아래 카드 이미지 " + imgs.length + "장을 순서대로 보고 점검하라:\n1) 이미지의 숫자·이름이 원본과 다른 곳(옮겨 적기 오류)\n2) 잘리거나 겹치거나 비어 있는 글자·칸\n3) 제목·핵심 줄과 표가 서로 안 맞는 곳(순위 순서, 오름/내림 표시, 합계, 단위·% 혼동)\n4) 상식 밖의 값(예: 아파트 1채 1,000억, 변동률 50%)과 같은 값이 반복되는 의심\n5) 기준일·출처 표기 누락, 투자 권유로 읽히는 말\n\n답은 <json>{\"ok\":true/false,\"summary\":\"한 줄\",\"issues\":[{\"page\":장번호,\"level\":\"오류|주의\",\"where\":\"위치\",\"what\":\"무엇이 문제\",\"fix\":\"고칠 방향(원본 값으로)\"}]}</json> 만. 문제가 없으면 issues 는 빈 배열." }];
  imgs.forEach((u, i) => { const m = /^data:(image\/\w+);base64,(.+)$/.exec(u); content.push({ type: "text", text: "카드 " + (i + 1) }); content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }); });
  const r = await claudeRun({ system: sys, content, max: 3000 });
  const J = jsonPick(r.text); if (!J) throw new Error("검사 결과를 읽지 못했습니다 — 다시 눌러 주세요");
  return { ok: true, verify: { ok: !!J.ok && !(J.issues || []).some((x) => x.level === "오류"), summary: String(J.summary || ""), issues: (J.issues || []).slice(0, 30) }, model: r.model };
}
/* ② 공고문 → 청약 조건 (Claude 우선, 키 없으면 OpenAI 그대로) */
async function cExtract(b) {
  const txt = String(b.text || "").slice(0, 120000); if (txt.length < 50) throw new Error("공고문 텍스트가 너무 짧습니다");
  const r = await claudeRun({ system: EX_GUIDE, content: "[공고문 텍스트]\n" + txt + "\n\n위 공고문에서 항목별 조건을 <json>{" + EX_FIELDS.map((k) => '"' + k + '":""').join(",") + "}</json> 형식으로만 답하라. 없으면 빈 문자열. 공고문에 없는 숫자는 쓰지 않는다.", max: 3000 });
  const J = jsonPick(r.text); if (!J) throw new Error("조건을 읽지 못했습니다");
  const bad = numOk(txt), terms = {}, dropped = [];
  EX_FIELDS.forEach((k) => { const v = String(J[k] || "").slice(0, 200); const x = bad(v); if (x.length) { dropped.push(k + ": " + v + " [공고문에 없음: " + x.join(", ") + "]"); terms[k] = ""; } else terms[k] = v; });
  return { ok: true, terms, dropped, model: r.model };
}
/* ③ 주간 브리핑 초안 / ⑤ 채널 코너 문구는 caption() 을 그대로 쓴다(코너 카드 = facts) */
async function cWeekly(b) {
  const facts = factsText(b, 120); if (!facts) throw new Error("facts 가 비었습니다");
  const news = (b.news || []).slice(0, 30).map((n, i) => "N" + (i + 1) + ": " + String(n.t || "").slice(0, 120) + " (" + String(n.s || "") + " " + String(n.d || "") + ")").join("\n");
  const sys = "너는 '우상향연구소(@uphill.lab)'의 주간 부동산 브리핑 편집자다. 이번 주 데이터를 바탕으로 독자가 '이번 주 무엇이 달라졌고, 다음 주 무엇을 봐야 하는지' 3분 안에 알게 쓴다. 숫자는 [facts] 원문 그대로(반올림·계산 금지), 웹에서 온 사실은 출처 이름을 괄호로. " + NO_SELL;
  const user = (b.note ? "[가장 중요한 요청] " + String(b.note).slice(0, 300) + "\n" : "") + "[기간] " + String(b.period || "") + "\n\n[facts — 앱 데이터]\n" + facts + (news ? "\n\n[이번 주 모인 기사 제목]\n" + news : "") +
    (b.web !== false ? "\n\n이번 주 발표된 정책·통계 일정 중 facts 에 없는 큰 것이 있으면 웹에서 1~3번 찾아 보충하라(공공기관·주요 언론만)." : "") +
    "\n\n답은 태그만:\n<brief>주간 브리핑 본문(블로그·뉴스레터용 1,200~2,000자): 제목 1줄 → 이번 주 한 줄 요약 → 소제목 3~5개(매매·거래 / 청약 / 금리·대출 / 정책·일정 / 다음 주 볼 것) 각 2~4문장 → 기준일·출처 → '※ 참고 자료이며 투자 권유가 아닙니다.'</brief>\n<insta>인스타 캡션 2,000자 이내, 첫 줄 훅, 해시태그 8~12개</insta>\n<thread_main>스레드 본문 500자 이내</thread_main>\n<reply1>답글 1 300자 이내</reply1>\n<reply2>답글 2 질문 하나</reply2>\n<cards>이번 주 카드로 만들면 좋은 주제 3~6개, 한 줄에 하나: 주제 | 이유</cards>";
  const r = await claudeRun({ system: sys, content: user, web: b.web !== false ? 3 : 0, max: 6000 });
  const bad = numOk(facts + "\n" + news + "\n" + String(b.period || "") + "\n" + r.cites.join("\n")), dropped = [];
  const clean = (s) => s.split("\n").filter((ln) => { if (/^\s*#/.test(ln)) return true; const x = bad(ln); if (x.length) { dropped.push(ln.trim().slice(0, 80) + "  [근거 없음: " + x.join(", ") + "]"); return false; } return true; }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const out = { ok: true, brief: clean(capPick(r.text, "brief")), insta: clean(capPick(r.text, "insta")), threads: { main: clean(capPick(r.text, "thread_main")), r1: clean(capPick(r.text, "reply1")), r2: clean(capPick(r.text, "reply2")) },
    cards: clean(capPick(r.text, "cards")).split("\n").map((x) => x.replace(/^\s*(?:[-·•]|\d{1,2}[.)])\s*/, "").trim()).filter(Boolean).slice(0, 6), sources: r.sources, dropped, model: r.model, searches: r.searches };
  if (!out.brief) throw new Error("브리핑을 받지 못했습니다 — 다시 눌러 주세요");
  return out;
}
/* 오늘 할 일 — 기사·이슈(수집 기사 + 웹 검색)를 모아 카드 만들기 주제와 채널 코너를 고른다. 개수는 이슈 양에 따라 10~20 */
async function cToday(b) {
  const recipes = (b.recipes || []).slice(0, 200).map((r) => r.id + " = " + String(r.nm || "") + " (" + String(r.grp || "") + ")").join("\n");
  const cands = (b.cands || []).slice(0, 40).map((c) => c.r + " · 점수 " + c.sc + " · " + String(c.why || "").slice(0, 120)).join("\n");
  const news = (b.news || []).slice(0, 40).map((n, i) => "N" + (i + 1) + ": " + String(n.t || "").slice(0, 140) + " (" + String(n.s || "") + " " + String(n.d || "") + ")").join("\n");
  const tabs = (b.tabs || []).map((t) => t[0] + " = " + t[1]).join(", ");
  const sys = "너는 부동산 데이터 SNS 채널 '우상향연구소'의 편집장이다. 매일 아침 '오늘 무엇을 올릴지' 고른다. 기준: 오늘 사람들이 실제로 궁금해할 이슈(기사·정책·일정)와 앱 데이터 신호가 겹치는 주제를 위로. 이슈가 많은 날은 많이, 조용한 날은 적게. " + NO_SELL;
  const user = "[오늘] " + String(b.today || "") + "\n\n[앱 데이터 신호로 고른 후보 — 점수 높을수록 데이터 신호가 강함]\n" + cands + "\n\n[만들 수 있는 카드 주제(id = 이름)]\n" + recipes + "\n\n[채널 코너(id = 이름)] " + tabs + " · 오늘 정기 코너: " + String(b.regular || "") +
    "\n\n[앱이 모은 오늘 기사 제목]\n" + (news || "(없음)") + (b.events ? "\n\n[오늘·이번 주 일정]\n" + String(b.events).slice(0, 1500) : "") +
    (b.web !== false ? "\n\n먼저 웹에서 오늘(최근 24~48시간) 한국 부동산 주요 이슈(정책 발표·통계 발표·청약·대출 규제·금리)를 2~4번 찾아라. 공공기관·주요 언론만." : "") +
    "\n\n답은 <json>{\"issues\":[{\"title\":\"이슈 제목(25자 이내)\",\"why\":\"왜 오늘 중요한지 한 줄\",\"points\":[\"핵심 사실 1~4줄(숫자는 기사·인용문 그대로)\"],\"src\":\"출처 이름\",\"date\":\"날짜\",\"url\":\"원문 주소(있으면)\",\"card\":\"연결할 카드 id(없으면 빈칸)\"}],\"cards\":[{\"r\":\"카드 id 또는 issue:이슈번호(0부터)\",\"why\":\"고른 이유 한 줄(기사·데이터 근거)\"}],\"corners\":[{\"tab\":\"코너 id\",\"why\":\"한 줄\"}],\"summary\":\"오늘 시장 한 줄\"}</json> 만. cards 는 10~20개(이슈가 적으면 10개), 중요한 순서. 같은 카드 id 반복 금지. corners 는 정기 코너 포함 2~5개.";
  const r = await claudeRun({ system: sys, content: user, web: b.web !== false ? 4 : 0, max: 5000 });
  const J = jsonPick(r.text); if (!J) throw new Error("추천을 읽지 못했습니다 — 다시 눌러 주세요");
  const bad = numOk(news + "\n" + cands + "\n" + String(b.events || "") + "\n" + r.cites.join("\n")), dropped = [];
  const ids = {}; (b.recipes || []).forEach((x) => { ids[x.id] = 1; }); const tabIds = {}; (b.tabs || []).forEach((t) => { tabIds[t[0]] = 1; });
  const issues = (J.issues || []).slice(0, 15).map((x) => {
    const pts = (x.points || []).map(String).filter((p) => { const z = bad(p); if (z.length) { dropped.push(p.slice(0, 80) + " [근거 없음: " + z.join(", ") + "]"); return false; } return true; }).slice(0, 4);
    const t = String(x.title || "").slice(0, 40), tz = bad(t); if (tz.length) dropped.push(t + " [근거 없음: " + tz.join(", ") + "]");
    return { title: tz.length ? "" : t, why: bad(String(x.why || "")).length ? "" : String(x.why || "").slice(0, 120), points: pts, src: String(x.src || "").slice(0, 40), date: String(x.date || "").slice(0, 20), url: /^https?:\/\//.test(String(x.url || "")) ? String(x.url) : "", card: ids[x.card] ? x.card : "" };
  }).filter((x) => x.title);
  const cards = [], seen = {};
  (J.cards || []).forEach((c) => { const id = String(c.r || ""); if (seen[id]) return; const why = String(c.why || "").slice(0, 140); const ok = ids[id] || (/^issue:\d+$/.test(id) && issues[Number(id.slice(6))]); if (!ok) return; seen[id] = 1; cards.push({ r: id, why: bad(why).length ? "기사·데이터 신호" : why }); });
  const corners = (J.corners || []).filter((c) => tabIds[c.tab]).slice(0, 5).map((c) => ({ tab: c.tab, why: bad(String(c.why || "")).length ? "" : String(c.why || "").slice(0, 120) }));
  return { ok: true, today: { issues, cards: cards.slice(0, 20), corners, summary: bad(String(J.summary || "")).length ? "" : String(J.summary || "").slice(0, 160), sources: r.sources, dropped, at: Date.now() }, model: r.model, searches: r.searches };
}
/* 분석 브리핑 외부 조사 — 프로그램이 만든 프롬프트 그대로 + 웹 검색. 값이 인용문에 있는지 항목마다 표시 */
async function cResearch(b) {
  const prompt = String(b.prompt || "").slice(0, 30000); if (prompt.length < 50) throw new Error("프롬프트가 비었습니다");
  const sys = "너는 한국 주택시장 애널리스트다. 웹 검색으로 최신 공개 자료(정부·공공기관·통계·한국은행·주요 언론·민간 리서치)를 찾아 답한다. 찾지 못한 값은 '확인 안 됨'. 수치마다 기준일·출처. JSON 하나만 출력.";
  const r = await claudeRun({ system: sys, content: prompt + "\n\n(JSON 은 <json></json> 안에)", web: Math.max(1, Math.min(6, Number(b.searches) || 5)), max: 6000 });
  const J = jsonPick(r.text); if (!J) throw new Error("조사 답에서 JSON 을 찾지 못했습니다" + (r.cut ? " (시간이 모자라 끊김 — 다시 눌러 주세요)" : ""));
  const known = String(b.known || ""), bad = numOk(known + "\n" + r.cites.join("\n"));
  (J.findings || []).forEach((f) => { const z = bad(String(f.value || "")); f.chk = z.length ? "인용 없음" : (r.cites.length ? "인용 확인" : "인용 없음"); if (z.length) f.miss = z.join(", "); });
  return { ok: true, j: J, raw: r.text.slice(0, 20000), sources: r.sources, model: r.model, searches: r.searches };
}
async function cRead(b) {   /* v9.63 카드 이미지 글자 읽기(검증용)도 Claude */
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(b.image || "")); if (!m) throw new Error("이미지가 없습니다");
  const r = await claudeRun({ system: "너는 이미지 속 글자를 있는 그대로 받아 적는 사람이다.", content: [{ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }, { type: "text", text: "이 카드 이미지에 실제로 보이는 글자를 줄 단위로 빠짐없이 그대로 받아 적어라. 숫자·기호·단위는 보이는 그대로(고치거나 추측하지 말 것). 읽을 수 없는 글자는 □. 답은 <json>{\"texts\":[\"줄\"]}</json> 하나만." }], max: 2000 });
  const J = jsonPick(r.text); return { ok: true, texts: J && Array.isArray(J.texts) ? J.texts.map(String) : [], model: r.model };
}
/* ══ v9.62 OpenAI 글 기능을 Claude 로(키가 있으면 · engine:"openai" 면 예전 그대로) — 릴스 기획(plan) · 칸 채우기(fill) · 인사이트(insight) · 데이터 점검 해설(valexplain) ══ */
function shapeOf(schema) {   /* JSON schema → 짧은 모양 설명(프롬프트용) */
  const w = (s) => { if (!s) return '""'; if (s.type === "array") return "[" + w(s.items) + "]"; if (s.type === "object") return "{" + Object.keys(s.properties || {}).map((k) => '"' + k + '":' + w(s.properties[k]) + (s.properties[k].description ? " /*" + s.properties[k].description.slice(0, 80) + "*/" : "")).join(",") + "}"; if (s.enum) return '"' + s.enum.join("|") + '"'; return s.type === "number" ? "0" : '""'; };
  return w(schema);
}
async function cPlan(b) {
  const facts = factsText(b, 80); if (!facts) throw new Error("facts 가 비었습니다");
  const user = (b.note ? "[가장 중요한 요청] " + b.note + "\n" : "") + "주제: " + (b.topic || "") + "\n목적: " + (b.purpose || "게시판 상세 카드로 유입") +
    "\n\n[facts — 이 안의 숫자·날짜만 쓸 것]\n" + facts + "\n\n위 facts로 릴스 표지 한 장을 설계하라. points.value 는 facts 원문을 그대로 복사. 같은 주제라도 사람들이 멈춰서 볼 각도(의외의 숫자, 내 돈과의 연결, 질문)를 고른다." + exampleText(b.example) +
    "\n\n답은 <json>" + shapeOf(PLAN_SCHEMA) + "</json> 모양의 JSON 하나만(주석 빼고). points 는 3~5개.";
  const refs = (b.refs || []).filter((u) => /^data:image\/(jpeg|png|webp|gif);base64,/.test(String(u))).slice(0, 3);
  const content = refs.length ? [{ type: "text", text: user + "\n\n[참고 이미지 " + refs.length + "장] 레이아웃·구성·톤만 참고(layout, visual 에 반영). 이미지 속 숫자·글자·사실은 절대 옮기지 말 것." }].concat(refs.map((u) => { const m = /^data:(image\/\w+);base64,(.+)$/.exec(u); return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }; })) : user;
  const r = await claudeRun({ system: SYS, content, max: 2500 });
  const J = jsonPick(r.text); if (!J || !Array.isArray(J.points)) throw new Error("기획을 읽지 못했습니다 — 다시 눌러 주세요");
  const bad = numOk(facts), dropped = [];
  J.points = J.points.filter((p) => { const z = bad(String(p.value || "") + " " + String(p.note || "")); if (z.length) { dropped.push(String(p.label || "") + " " + String(p.value || "") + " [facts 에 없음: " + z.join(", ") + "]"); return false; } return true; }).slice(0, 5);
  ["hook", "sub", "kicker", "cta"].forEach((k) => { if (bad(String(J[k] || "")).length) { dropped.push(k + ": " + J[k]); J[k] = ""; } });
  ["kicker", "hook", "sub", "layout", "cta", "visual"].forEach((k) => { if (typeof J[k] !== "string") J[k] = ""; });
  if (!["rank", "stat", "compare", "steps", "checklist"].includes(J.layout)) J.layout = J.points.length >= 3 ? "rank" : "stat";
  return { ok: true, plan: J, dropped, model: r.model };
}
async function cFill(b) {
  const T = b.template || {}, FL = Array.isArray(T.fields) ? T.fields.slice(0, 20) : []; if (!FL.length) throw new Error("template.fields 가 비었습니다");
  const facts = factsText(b, 80); if (!facts) throw new Error("facts 가 비었습니다");
  const shape = "{" + FL.map((f) => '"' + f.key + '":' + (f.kind === "text" ? '""' : f.kind === "rows" ? '[["칸","칸"]]' : '[""]')).join(",") + "}";
  const sys = SYS + " 지금은 '" + (T.name || "고정 양식") + "' 양식의 칸을 채운다. 각 칸의 설명과 예시 형식을 따르되 예시의 숫자·이름은 쓰지 않는다. 표의 줄(rows)은 칸 수를 머리(cols)와 맞춘다. facts 에 없는 항목은 빈 문자열/빈 배열.";
  const user = (b.note ? "[가장 중요한 요청] " + b.note + "\n" : "") + "[칸 설명]\n" + FL.map((f) => f.key + " (" + f.kind + "): " + f.label + (f.example ? " · 예시 형식: " + f.example : "")).join("\n") + "\n\n[facts — 이 안의 숫자·날짜·이름만 쓸 것]\n" + facts + "\n\n답은 <json>" + shape + "</json> 모양 JSON 하나만.";
  const r = await claudeRun({ system: sys, content: user, max: 4000 });
  const J = jsonPick(r.text); if (!J) throw new Error("칸 내용을 읽지 못했습니다 — 다시 눌러 주세요");
  const fill = {}; FL.forEach((f) => { const v = J[f.key]; fill[f.key] = f.kind === "text" ? String(v == null ? "" : v) : Array.isArray(v) ? v : []; });
  return { ok: true, fill, model: r.model };
}
async function cInsight(b) {   /* v9.63 깊게(기본 Opus) · 반대 논리 · 지역별 · 확인 일정 · 확신 정도 · 이어 묻기 */
  const facts = factsText(b, 160); if (!facts) throw new Error("facts 가 비었습니다");
  const q = String(b.question || "어떤 상황이야?").slice(0, 400), who = (Array.isArray(b.stances) ? b.stances : []).slice(0, 6).map(String), web = b.web !== false, deep = b.deep !== false;
  const sys = "너는 한국 아파트 시장을 20년 본 애널리스트이자 '우상향연구소' 운영자의 비공개 조언자다. 운영자는 이 답을 판단 메모와 콘텐츠 기획에 쓴다. 결론부터, 짧고 분명하게, 근거를 촘촘히. " +
    "원칙: (1) 앱 숫자는 [facts] 원문 그대로 복사하고 근거 id(F3)를 붙인다. 반올림·환산·추정·새 계산 금지. (2) 웹에서 찾은 사실은 출처 이름을 괄호로 붙이고 (웹)이라 적는다. 기준이 다른 숫자(KB vs 부동산원, 월 vs 주)는 섞지 말고 기준을 밝힌다. " +
    "(3) 확률(%)을 매기지 않는다. '어떤 조건이면 어느 쪽'으로 말한다. (4) 의견은 분명히, 단정 대신 조건. 상승 논리와 하락 논리를 모두 검토한 뒤 결론을 낸다. (5) 과거 패턴은 경향으로만, 표본 수를 함께. " +
    "(6) 지역마다 다르면 다르다고 말한다(서울 핵심·서울 외곽·경기 남부·경기 북부·인천·지방). (7) 숫자 나열보다 '그래서 무엇을 의미하는지'. (8) 한국어, 쉬운 말, 이모지 금지. 각 문장은 메모에 그대로 옮길 수 있게 완결된 문장.";
  const shape = '{"headline":"한 줄 결론(30자 안팎)","answer":"결론 3~5문장(첫 문장이 답, 근거 id)","because":["이유 3~5줄 — 숫자와 근거 id"],"counter":{"view":"반대로 볼 수 있는 논리 한 문장","because":["그 근거 1~3줄(근거 id)"],"rebut":"그래도 결론을 유지하는 이유 또는 결론을 바꿀 조건"},"regions":[{"region":"지역 묶음","view":"그 지역은 어떻게 다른가","why":"근거(근거 id)"}],"stances":[{"who":"입장","todo":"지금 할 일","why":"근거 한 줄"}],"scenarios":[{"name":"기준|상방|하방","cond":"조건(확인 가능한 숫자·사건)","then":"그때 벌어질 일"}],"calendar":[{"when":"날짜(facts·웹에 있는 것만)","what":"확인할 발표·일정","why":"왜 중요한지"}],"watch":["확인 신호 — 지표 · 수준 · 의미"],"confidence":{"level":"높음|보통|낮음","why":"근거가 충분한지·표본·데이터 지연"},"risk":"틀릴 수 있는 이유 1~2문장","followups":["이어서 물어보면 좋을 질문 3개"],"content":["이 판단으로 만들 만한 콘텐츠 주제 2~3개(정보형, 투자 권유 없이)"]}';
  const prev = b.prev && b.prev.q ? "\n\n[바로 전 질문과 답 — 이어지는 질문이다]\nQ: " + String(b.prev.q).slice(0, 300) + "\nA: " + String(b.prev.answer || "").slice(0, 1500) : "";
  const user = "[질문] " + q + (who.length ? "\n[입장 목록 — stances 는 이 중에서] " + who.join(" / ") : "") + prev + "\n\n[facts — 앱 숫자·메모·외부 조사·오늘 이슈]\n" + facts +
    (web ? "\n\n답하기 전에, 이 질문에 꼭 필요한데 facts 에 없는 최근 사실(정책 변화·금리 결정 일정·공급 계획·심리 지표·대출 규제)이 있으면 웹에서 1~4번 찾아라. 공공기관·통계·주요 언론만." : "") +
    "\n\n속으로 상승 논리·하락 논리·지역 차이를 먼저 따져 본 뒤, 답은 <json>" + shape + "</json> 하나만.";
  const model = deep ? (process.env.CLAUDE_MODEL_DEEP || "claude-opus-5-5") : undefined;
  const r = await claudeRun({ system: sys, content: user, web: web ? (deep ? 3 : 4) : 0, max: deep ? 5000 : 6000, model });
  const J = jsonPick(r.text); if (!J) throw new Error("답을 읽지 못했습니다 — 다시 눌러 주세요");
  ["because", "stances", "scenarios", "watch", "regions", "calendar", "followups", "content"].forEach((k) => { if (!Array.isArray(J[k])) J[k] = []; }); ["answer", "risk", "headline"].forEach((k) => { J[k] = String(J[k] || ""); });
  if (!J.counter || typeof J.counter !== "object") J.counter = null; if (!J.confidence || typeof J.confidence !== "object") J.confidence = null;
  /* 일정의 날짜는 facts·인용문에 있어야 — 없으면 그 줄 뺌 */
  const bad = numOk(facts + "\n" + r.cites.join("\n")); J.calendar = J.calendar.filter((c) => !bad(String(c.when || "") + " " + String(c.what || "")).length).slice(0, 6);
  return { ok: true, insight: J, web: r.cites.slice(0, 40).map((t, i) => ({ id: "W" + (i + 1), text: t.slice(0, 300) })), sources: r.sources, model: r.model, searches: r.searches };
}
const VAL_CTX = "TrackApt 수집 구조: GitHub Actions brief.yml(매일 03:00 KST 전체, 15:00 청약만, workflow_dispatch 입력 only 로 일부만) → scripts/daily_build.js(국토부 실거래·KOSIS 주간 지수·청약홈·금감원 금리) · macro_build.js(ECOS 기준금리·국고채·미국 금리, KOSIS 인허가·착공·미분양) · core_build.js(시군구 월별 지수·건수) · school_build.js · brief_build.js → scripts/validate.js 가 결과를 점검해 data/validate.json 에 남김. 키는 GitHub Secrets(ECOS_KEY, KOSIS_KEY, DATA_GO_KEY, RONE_KEY, FSS_KEY, SCHOOLINFO_API_KEY)와 Vercel(MOLIT_API_KEY). 실거래는 신고 기한 30일이라 최근 달은 늘 적게 보인다. 주인은 비개발자이며 GitHub 웹(휴대폰)으로 파일을 올린다.";
async function cValExplain(b) {
  const checks = (b.checks || []).slice(0, 40).map((c) => "[" + String(c.level || "") + "] " + String(c.id || "") + " " + String(c.title || "") + ": " + String(c.detail || "").slice(0, 300)).join("\n");
  if (!checks) throw new Error("점검 결과가 비었습니다");
  const sys = "너는 데이터 수집 파이프라인 운영 도우미다. 비개발자 주인이 이해하고 따라 할 수 있게 쉬운 말로, 가장 가능성 높은 원인과 확인 순서를 알려 준다. 모르는 것은 추측이라고 밝힌다. 이모지 금지.";
  const user = "[구조]\n" + VAL_CTX + "\n\n[점검 결과 · " + String(b.built || "") + " · 요약 " + JSON.stringify(b.summary || {}) + "]\n" + checks +
    "\n\n답은 <json>{\"overall\":\"전체 상태 한두 문장(지금 카드를 올려도 되는지 포함)\",\"items\":[{\"id\":\"점검 id\",\"level\":\"오류|주의\",\"meaning\":\"이 점검이 말하는 것\",\"cause\":\"가장 가능성 높은 원인(추측이면 추측이라고)\",\"check\":\"확인 순서(GitHub Actions 로그 어디, 어떤 파일)\",\"fix\":\"할 일 — 기다리면 되는지, 다시 실행(Run workflow, only 값), 키 확인, 개발 수정 필요\",\"safe\":\"이 상태로 카드에 쓰면 안 되는 숫자\"}]}</json> 하나만. 오류·주의만, 중요한 순서.";
  const r = await claudeRun({ system: sys, content: user, max: 3500 });
  const J = jsonPick(r.text); if (!J) throw new Error("해설을 읽지 못했습니다 — 다시 눌러 주세요");
  return { ok: true, explain: { overall: String(J.overall || ""), items: Array.isArray(J.items) ? J.items.slice(0, 40) : [] }, model: r.model };
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const OWN = process.env.OWNER_KEY || "", KEY = process.env.OPENAI_API_KEY || "";
  if (req.method === "GET") return res.status(200).json({ ok: !!(OWN && KEY), model: process.env.TEXT_MODEL || "gpt-6.1-sol", claude: !!(OWN && process.env.ANTHROPIC_API_KEY), textEngine: process.env.ANTHROPIC_API_KEY && process.env.TEXT_ENGINE !== "openai" ? "claude" : "openai", claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-5-5" });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!OWN) return res.status(500).json({ ok: false, error: "OWNER_KEY not set" });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
  if (!same(b.t, tokenOf(OWN))) return res.status(401).json({ ok: false, error: "주인 인증이 필요합니다" });
  const CM = { caption: async (x) => Object.assign({ ok: true }, await caption(x)), verify: cVerify, weekly: cWeekly, today: cToday, research: cResearch };
  CM.valexplain = cValExplain;
  if (process.env.ANTHROPIC_API_KEY && b.engine !== "openai" && process.env.TEXT_ENGINE !== "openai") { CM.extract = cExtract; CM.plan = cPlan; CM.fill = cFill; CM.insight = cInsight; CM.read = cRead; }   /* v9.62 글 기능은 Claude 우선 */
  if (CM[b.mode]) { try { return res.status(200).json(await CM[b.mode](b)); } catch (e) { return res.status(502).json({ ok: false, error: String(e && e.message || e).slice(0, 300) }); } }
  if (!KEY) return res.status(500).json({ ok: false, error: "OPENAI_API_KEY 가 없습니다" });
  try {
    if (b.mode === "plan") {
      const facts = (b.facts || []).slice(0, 80).map((f) => f.id + ": " + String(f.text).slice(0, 300)).join("\n");
      if (!facts) throw new Error("facts 가 비었습니다");
      const user = (b.note ? "[가장 중요한 요청] " + b.note + "\n" : "") + "주제: " + (b.topic || "") + "\n목적: " + (b.purpose || "게시판 상세 카드로 유입") + (b.note ? "\n추가 요청: " + b.note : "") +
        "\n\n[facts — 이 안의 숫자·날짜만 쓸 것]\n" + facts + "\n\n위 facts로 릴스 표지 한 장을 설계해 JSON으로 답하라. points.value 는 facts 원문을 그대로 복사." + exampleText(b.example);
      /* 참고 이미지(선택): 모양·구성·분위기만 참고. 그 이미지 속 숫자·글자는 사실로 쓰지 않는다 */
      const refs = (b.refs || []).filter((u) => /^data:image\//.test(String(u))).slice(0, 3);
      const content = refs.length ? [{ type: "input_text", text: user + "\n\n[참고 이미지 " + refs.length + "장] 레이아웃·구성·톤만 참고하라(layout, visual 에 반영). 참고 이미지 안의 숫자·글자·사실은 절대 카드에 옮기지 말 것." }].concat(refs.map((u) => ({ type: "input_image", image_url: u }))) : user;
      const out = await withFallback(KEY, [{ role: "system", content: SYS }, { role: "user", content }], { type: "json_schema", name: "reel_card", strict: true, schema: PLAN_SCHEMA });
      return res.status(200).json({ ok: true, plan: JSON.parse(out.text), model: out.model });
    }
    if (b.mode === "read") {
      if (!/^data:image\//.test(String(b.image || ""))) throw new Error("이미지가 없습니다");
      const schema = { type: "object", additionalProperties: false, required: ["texts"], properties: { texts: { type: "array", items: { type: "string" } } } };
      const out = await withFallback(KEY, [{ role: "user", content: [
        { type: "input_text", text: "이 카드 이미지에 실제로 보이는 글자를 줄 단위로 빠짐없이 그대로 받아 적어라. 숫자·기호·단위는 보이는 그대로(고치거나 추측하지 말 것). 읽을 수 없는 글자는 □ 로 적어라." },
        { type: "input_image", image_url: b.image }] }], { type: "json_schema", name: "card_text", strict: true, schema });
      return res.status(200).json({ ok: true, texts: JSON.parse(out.text).texts || [], model: out.model });
    }
    if (b.mode === "extract") {   /* v9.20.3 입주자모집공고문 텍스트 → 단지별 청약 조건 (사실만, 없으면 빈칸) */
      var txt = String(b.text || "").slice(0, 60000); if (txt.length < 50) throw new Error("공고문 텍스트가 너무 짧습니다");
      var props = {}; EX_FIELDS.forEach(function (k) { props[k] = { type: "string" }; });
      var schema = { type: "object", additionalProperties: false, required: EX_FIELDS, properties: props };
      var out = await withFallback(KEY, [{ role: "system", content: EX_GUIDE }, { role: "user", content: "[공고문 텍스트]\n" + txt + "\n\n위 공고문에서 항목별 조건을 JSON으로 답하라. 없으면 빈 문자열." }], { type: "json_schema", name: "notice_terms", strict: true, schema: schema });
      return res.status(200).json({ ok: true, terms: JSON.parse(out.text), model: out.model });
    }
    if (b.mode === "fill") {   /* v9.21 고정 양식 채우기 — 칸 설명(fields)대로 JSON. 숫자는 facts 원문만 */
      var T = b.template || {}, FL = Array.isArray(T.fields) ? T.fields.slice(0, 20) : [];
      if (!FL.length) throw new Error("template.fields 가 비었습니다");
      var facts2 = (b.facts || []).slice(0, 80).map(function (f) { return f.id + ": " + String(f.text).slice(0, 300); }).join("\n");
      if (!facts2) throw new Error("facts 가 비었습니다");
      var props2 = {}, req2 = [];
      FL.forEach(function (f) { req2.push(f.key); props2[f.key] = f.kind === "text" ? { type: "string", description: f.label + (f.example ? " (예: " + f.example + ")" : "") } : f.kind === "rows" ? { type: "array", description: f.label + " — 각 줄은 칸 배열" + (f.example ? " (예: " + f.example + ")" : ""), items: { type: "array", items: { type: "string" } } } : { type: "array", description: f.label + (f.example ? " (예: " + f.example + ")" : ""), items: { type: "string" } }; });
      var schema2 = { type: "object", additionalProperties: false, required: req2, properties: props2 };
      var sys2 = SYS + " 지금은 '" + (T.name || "고정 양식") + "' 양식의 칸을 채운다. 각 칸의 설명과 예시 형식을 따르되 예시의 숫자·이름은 쓰지 않는다. 표의 줄(rows)은 칸 수를 머리(cols)와 맞춘다. facts 에 없는 항목은 빈 문자열/빈 배열로 둔다.";
      var user2 = (b.note ? "[가장 중요한 요청] " + b.note + "\n" : "") + "[칸 설명]\n" + FL.map(function (f) { return f.key + " (" + f.kind + "): " + f.label + (f.example ? " · 예시 형식: " + f.example : ""); }).join("\n") + "\n\n[facts — 이 안의 숫자·날짜·이름만 쓸 것]\n" + facts2 + "\n\n위 facts 로 양식의 모든 칸을 JSON 으로 채워라.";
      var out2 = await withFallback(KEY, [{ role: "system", content: sys2 }, { role: "user", content: user2 }], { type: "json_schema", name: "tpl_fill", strict: true, schema: schema2 });
      return res.status(200).json({ ok: true, fill: JSON.parse(out2.text), model: out2.model });
    }
    if (b.mode === "insight") {   /* v9.33 인사이트(주인 전용) — 질문에 결론부터. 숫자는 facts 원문만 */
      var factsI = (b.facts || []).slice(0, 80).map(function (f) { return f.id + ": " + String(f.text).slice(0, 300); }).join("\n");
      if (!factsI) throw new Error("facts 가 비었습니다");
      var qI = String(b.question || "어떤 상황이야?").slice(0, 300), whoI = (Array.isArray(b.stances) ? b.stances : []).slice(0, 6).map(String);
      var schemaI = { type: "object", additionalProperties: false, required: ["answer", "because", "stances", "scenarios", "watch", "risk"], properties: {
        answer: { type: "string", description: "질문에 대한 결론 3~5문장. 첫 문장이 답. 숫자는 facts 원문 그대로, 근거 id를 괄호로 (예: (F3))" },
        because: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" }, description: "그렇게 보는 이유 — 각 줄에 근거 id" },
        stances: { type: "array", minItems: 0, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["who", "todo", "why"], properties: { who: { type: "string" }, todo: { type: "string", description: "그 입장에서 지금 할 일 한 문장" }, why: { type: "string", description: "근거 한 줄(근거 id)" } } } },
        scenarios: { type: "array", minItems: 2, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["name", "cond", "then"], properties: { name: { type: "string", description: "기준/상방/하방 등" }, cond: { type: "string", description: "이 시나리오로 가는 조건(확인 가능한 숫자·사건)" }, then: { type: "string", description: "그때 벌어질 일" } } } },
        watch: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" }, description: "앞으로 확인할 신호 — 어느 지표가 어느 수준이면 생각을 바꾸는지" },
        risk: { type: "string", description: "이 판단이 틀릴 수 있는 이유 1~2문장" } } };
      var sysI = "너는 한국 아파트 시장을 오래 본 애널리스트이자 '우상향연구소' 운영자의 비공개 조언자다. 운영자가 묻는 말에 결론부터, 짧고 분명하게 답한다. " +
        "원칙: (1) 숫자·날짜·퍼센트는 반드시 제공된 facts 원문에서 그대로 복사하고 근거 id를 붙인다. 반올림·환산·추정·새 숫자 금지. facts 에 없는 통계·사건을 아는 척하지 않는다. " +
        "(2) 확률(%)을 매기지 않는다. 대신 '어떤 조건이면 어느 쪽'으로 말한다. (3) 비공개 메모이므로 의견을 분명히 말하되 단정(무조건·반드시) 대신 조건을 단다. " +
        "(4) 과거 패턴(facts 의 회상 줄)은 '경향'으로만 쓰고 표본이 적음을 안다. (5) 한국어, 쉬운 말, 이모지 금지. 각 문장은 운영자가 그대로 메모에 옮길 수 있게 완결된 문장으로.";
      var userI = "[질문] " + qI + (whoI.length ? "\n[입장 목록 — stances 는 이 중에서] " + whoI.join(" / ") : "") + "\n\n[facts — 이 안의 숫자만 쓸 것]\n" + factsI;
      var outI = await withFallback(KEY, [{ role: "system", content: sysI }, { role: "user", content: userI }], { type: "json_schema", name: "insight", strict: true, schema: schemaI });
      return res.status(200).json({ ok: true, insight: JSON.parse(outI.text), model: outI.model });
    }
    throw new Error("mode 는 plan · read · extract · fill · insight · caption · verify · weekly · today · research · valexplain");
  } catch (e) { return res.status(502).json({ ok: false, error: String(e && e.message || e).slice(0, 300) }); }
};
