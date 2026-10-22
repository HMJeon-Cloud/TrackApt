// api/ai.js — 릴스 대표 카드용 글 설계(plan) · 이미지 글자 읽기(read) (v9.13)
// 주인 토큰(OWNER_KEY) 확인 후 OpenAI Responses API 호출. 키는 서버에만.
// 환경변수: OPENAI_API_KEY (필수) · TEXT_MODEL (기본 gpt-6.1-sol, 못 쓰면 gpt-4.1 로 다시 시도)
// POST { t, mode:"plan", facts:[{id,text}], purpose, topic, note, example? }  → { ok, plan:{hook, sub, kicker, layout, points:[{label,value,note,fact}], cta, visual} }
// POST { t, mode:"read", image:"data:..." }                         → { ok, texts:[...] }   (카드 이미지에 실제로 찍힌 글자·숫자 받아 적기)
// POST { t, mode:"fill", template:{name, fields:[{key,label,kind,example}]}, facts, note } → { ok, fill:{key: 값} } (v9.21 고정 양식)
// POST { t, mode:"insight", facts, question, stances? }                → { ok, insight:{answer, because[], stances[], scenarios[], watch[], risk} } (v9.33 인사이트)
// POST { t, mode:"caption", facts, card:{title,cat,src,asOf,pages}, base:{insta,threads}, note, web } → { ok, insta, threads:{main,r1,r2}, hooks[], adds[], sources[], dropped[] } (v9.60 Claude 문구 · 누를 때만)
//   환경변수: ANTHROPIC_API_KEY (문구 전용) · CLAUDE_MODEL (기본 claude-sonnet-5-5) · CLAUDE_WEB=off 이면 웹 검색 끔
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
/* ══ v9.60 Claude 문구(인스타·스레드) — 버튼 누를 때만. 우리 카드 숫자가 중심, 웹 검색은 보충(출처 있는 것만) ══
   틀린 숫자 방지: 결과의 모든 숫자(2자리 이상)는 facts 또는 웹 검색 인용문(cited_text)에 있어야 한다. 없으면 그 줄을 뺀다. */
const CAP_SYS = "너는 부동산 데이터 SNS 채널 '우상향연구소(@uphill.lab)'의 카피라이터다. 목표: 같은 카드라도 매번 다른 각도로, 저장·공유·댓글·프로필 방문을 부르는 글을 써서 노출을 늘리는 것. " +
  "원칙: (1) 숫자·날짜·금액·퍼센트는 [카드 facts] 원문 그대로 쓴다. 반올림·환산·계산한 새 숫자 금지. (2) 웹 검색은 카드 내용을 보충할 때만(정책 일정, 공식 발표, 같은 주제의 최근 사실) 쓰고, 정부·공공기관·통계기관·주요 언론만 믿는다. 웹에서 온 숫자는 그 문장에 반드시 출처 이름을 괄호로 붙이고 인용으로 남긴다. 확실하지 않으면 쓰지 않는다. " +
  "(3) 투자 권유·매수/매도 추천·단정(무조건, 반드시 오른다, 지금 사야) 금지. 공포 조장 금지. (4) 이모지 금지. 존댓말. 짧은 문장. 기준일을 꼭 적는다. " +
  "(5) 글의 역할: 첫 줄 = 스크롤을 멈추게 하는 질문이나 의외의 숫자(낚시 금지, 카드 안 사실로) · 본문 = 독자에게 도움이 되는 해석(내 돈·내 동네·내 대출 관점) · 끝 = 저장/댓글/프로필 방문을 부르는 한 줄(예: 우리 동네가 궁금하면 댓글로 지역을). (6) 기본 규칙 글(아래)과 다른 구성과 첫 줄로 쓴다.";
function capNums(s) { return (String(s || "").replace(/#[^\s#]+/g, " ").match(/\d[\d,]*(?:\.\d+)?/g) || []).map((x) => x.replace(/,/g, "")).filter((x) => x.replace(/\./g, "").length >= 2); }
function capPick(t, tag) { const m = new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">").exec(t); return m ? m[1].trim() : ""; }
async function claudeCall(key, model, body) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(Object.assign({ model }, body)) });
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
    "\n\n[기본 규칙 글 — 이것과 다른 각도로]\n인스타:\n" + String(B.insta || "").slice(0, 2500) + "\n\n스레드:\n" + String(B.threads || "").slice(0, 2500) +
    (web ? "\n\n먼저 이 주제에 보충할 최근 공식 사실(정책 시행일, 발표 일정, 관련 통계 발표)이 있는지 웹에서 1~3번만 찾아라. 카드 숫자와 다른 기준의 숫자는 섞지 말고, 없으면 보충하지 마라." : "\n\n웹 검색 없이 카드 facts 만으로 써라.") +
    "\n\n답은 아래 태그만 써라(태그 밖 글 금지).\n<insta>인스타 캡션 — 첫 줄 훅, 빈 줄로 나눈 3~6 문단, 핵심 숫자 3~6개, '함께 보면' 보충(있으면, 출처), 저장·댓글 유도 한 줄, 기준일·출처, '※ 참고 자료이며 투자 권유가 아닙니다.', 해시태그 8~12개(마지막 줄, #우상향연구소 포함). 2,000자 이내</insta>" +
    "\n<thread_main>스레드 본문 — 500자 이내. 독자가 이미 궁금해하는 질문 1줄 → 숫자 3~5줄 → 해석 1~2줄 → 기준일. 해시태그는 1개 이하</thread_main>" +
    "\n<reply1>답글 1 — 반대로 보이는 숫자나 한계, 또는 보충 사실(출처). 300자 이내</reply1>" +
    "\n<reply2>답글 2 — 댓글을 부르는 질문 하나(지역·조건을 묻기). 150자 이내</reply2>" +
    "\n<hooks>다른 첫 줄 후보 3개, 한 줄에 하나</hooks>" +
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
  const clean = (s, add) => s.split("\n").filter((ln) => { if (/^\s*#/.test(ln)) return true; const bad = capNums(add ? ln.split("|")[0] : ln).filter((n) => okTxt.indexOf(n) < 0); if (bad.length) { dropped.push(ln.trim().slice(0, 80) + "  [근거 없음: " + bad.join(", ") + "]"); return false; } return true; }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const out = { insta: clean(capPick(text, "insta")), threads: { main: clean(capPick(text, "thread_main")), r1: clean(capPick(text, "reply1")), r2: clean(capPick(text, "reply2")) },
    hooks: clean(capPick(text, "hooks")).split("\n").map((x) => x.replace(/^\s*(?:[-·•]|\d{1,2}[.)])\s*/, "").trim()).filter(Boolean).slice(0, 3),
    adds: clean(capPick(text, "adds"), 1).split("\n").map((x) => x.trim()).filter((x) => x && x.indexOf("|") > 0).slice(0, 5),
    sources: Object.values(srcs).slice(0, 8), dropped, model, searches: (j.usage && j.usage.server_tool_use && j.usage.server_tool_use.web_search_requests) || 0 };
  if (!out.insta && !out.threads.main) throw new Error("Claude 답에서 글을 찾지 못했습니다 — 다시 눌러 주세요");
  return out;
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const OWN = process.env.OWNER_KEY || "", KEY = process.env.OPENAI_API_KEY || "";
  if (req.method === "GET") return res.status(200).json({ ok: !!(OWN && KEY), model: process.env.TEXT_MODEL || "gpt-6.1-sol", claude: !!(OWN && process.env.ANTHROPIC_API_KEY), claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-5-5" });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!OWN) return res.status(500).json({ ok: false, error: "OWNER_KEY not set" });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
  if (!same(b.t, tokenOf(OWN))) return res.status(401).json({ ok: false, error: "주인 인증이 필요합니다" });
  if (b.mode === "caption") { try { return res.status(200).json(Object.assign({ ok: true }, await caption(b))); } catch (e) { return res.status(502).json({ ok: false, error: String(e && e.message || e).slice(0, 300) }); } }
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
      var FIELDS = ["res", "resPeriod", "prior", "resale", "live", "rewin", "firstRank", "point", "down", "mid", "balance", "option", "move", "etc"];
      var props = {}; FIELDS.forEach(function (k) { props[k] = { type: "string" }; });
      var schema = { type: "object", additionalProperties: false, required: FIELDS, properties: props };
      var guide = "너는 입주자모집공고문에서 청약 조건을 '있는 그대로' 뽑아 적는 사람이다. 공고문에 없는 내용은 빈 문자열로 둔다. 추측·일반 규칙 보충 금지. 각 항목은 한국어 한 줄(40자 이내), 공고문의 숫자·기간·지역명 그대로.\n" +
        "res: 신청 자격 거주지 요건(예: '서울특별시 거주자' / '수도권 거주자') · resPeriod: 거주 기간 요건(예: '공고일 기준 2년 이상') · prior: 지역 우선 공급 비율·순서(예: '해당지역 50% → 경기 20% → 수도권 30%') · resale: 전매 제한(예: '당첨자 발표일부터 3년') · live: 실거주 의무(예: '최초 입주 가능일부터 2년') · rewin: 재당첨 제한 · firstRank: 1순위 요건(통장 기간·예치금·세대주·주택 수) · point: 가점제/추첨제 비율 · down: 계약금(비율·납부일) · mid: 중도금(비율·회차·대출 알선 여부) · balance: 잔금 · option: 발코니 확장·옵션 비용 요약 · move: 입주 예정 시기 · etc: 그 밖에 신청 전 꼭 알아야 할 특이 조건(예: '중복 청약 불가', '부적격 시 1년 제한').";
      var out = await withFallback(KEY, [{ role: "system", content: guide }, { role: "user", content: "[공고문 텍스트]\n" + txt + "\n\n위 공고문에서 항목별 조건을 JSON으로 답하라. 없으면 빈 문자열." }], { type: "json_schema", name: "notice_terms", strict: true, schema: schema });
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
    throw new Error("mode 는 plan · read · extract · fill · insight · caption");
  } catch (e) { return res.status(502).json({ ok: false, error: String(e && e.message || e).slice(0, 300) }); }
};
