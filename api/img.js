// api/img.js — 카드용 AI 이미지 만들기·보정 (v9.12)
// 주인만 쓸 수 있다: 요청마다 '나만 보기' 토큰(t)을 OWNER_KEY 로 확인한다(api/owner.js 와 같은 방식).
// 환경변수 (Vercel → Settings → Environment Variables):
//   OPENAI_API_KEY   — 있으면 OpenAI 이미지 모델 사용 (ChatGPT 이미지와 같은 계열)
//   IMG_MODEL        — 새로 만들기 모델 (기본 gpt-image-2.5-flare · 빠르고 SNS용에 맞춤)
//   IMG_EDIT_MODEL   — 보정·카드 전체 다시 그리기 모델 (기본 gpt-image-2.5-sunburst · 고칠 때 원본을 더 정확히 지킴)
//   모델을 못 쓰는 계정이면 gpt-image-1 로 한 번 더 시도한다
//   GEMINI_API_KEY   — OpenAI 키가 없거나 IMG_PROVIDER=gemini 이면 Google Gemini 이미지 모델 사용
//   GEMINI_IMG_MODEL — 기본 gemini-2.5-flash-image
//   IMG_PROVIDER     — openai | gemini (생략하면 있는 키로 자동)
// 요청  POST { t, mode:"gen"|"edit", prompt, size:"1024x1536"|"1024x1024"|"1536x1024", transparent?:bool, image?:"data:image/...;base64,..." }
// 응답  { ok:true, image:"data:image/...;base64,...", provider, model }  ·  실패 { ok:false, error }
const crypto = require("crypto");
function tokenOf(key) { return crypto.createHmac("sha256", key).update("trackapt-owner-v1").digest("hex"); }
function same(a, b) { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function dataUrlParts(u) { const m = /^data:([^;]+);base64,(.+)$/.exec(String(u || "")); return m ? { mime: m[1], b64: m[2] } : null; }

async function openai(body, key) {
  const want = body.mode === "edit" ? (process.env.IMG_EDIT_MODEL || process.env.IMG_MODEL || "gpt-image-2.5-sunburst") : (process.env.IMG_MODEL || "gpt-image-2.5-flare");
  try { return await openaiWith(body, key, want); }
  catch (e) { if (want !== "gpt-image-1" && /model|not found|does not exist|access/i.test(String(e.message))) return await openaiWith(body, key, "gpt-image-1"); throw e; }
}
async function openaiWith(body, key, model) {
  const size = body.size || "1024x1536";
  const fmt = body.transparent ? "png" : "jpeg";
  let r;
  if (body.mode === "edit" && body.image) {
    const p = dataUrlParts(body.image); if (!p) throw new Error("보정할 이미지가 없습니다");
    const fd = new FormData();
    fd.append("model", model); fd.append("prompt", body.prompt); fd.append("size", size);
    fd.append("image", new Blob([Buffer.from(p.b64, "base64")], { type: p.mime }), "src." + (p.mime.split("/")[1] || "png"));
    if (body.transparent) fd.append("background", "transparent");
    else if (/^gpt-image/.test(model)) { fd.append("output_format", "jpeg"); fd.append("output_compression", "85"); }
    r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + key }, body: fd });
  } else {
    const q = { model, prompt: body.prompt, size, n: 1 };
    if (/^gpt-image/.test(model)) { q.quality = body.quality || "medium"; q.output_format = fmt; if (fmt === "jpeg") q.output_compression = 85; if (body.transparent) q.background = "transparent"; }
    r = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify(q) });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || ("OpenAI 응답 " + r.status));
  const d = j.data && j.data[0];
  if (!d) throw new Error("이미지가 오지 않았습니다");
  if (d.b64_json) return { image: "data:image/" + fmt + ";base64," + d.b64_json, model };
  if (d.url) { const ir = await fetch(d.url); const buf = Buffer.from(await ir.arrayBuffer()); return { image: "data:image/png;base64," + buf.toString("base64"), model }; }
  throw new Error("이미지 형식을 알 수 없습니다");
}
async function gemini(body, key) {
  const model = process.env.GEMINI_IMG_MODEL || "gemini-2.5-flash-image";
  const ratio = { "1024x1536": "2:3 세로", "1024x1024": "1:1 정사각형", "1536x1024": "3:2 가로" }[body.size] || "세로";
  const parts = [{ text: body.prompt + "\nAspect ratio: " + ratio + (body.transparent ? ". Plain pure white background, isolated object." : "") }];
  const p = body.mode === "edit" ? dataUrlParts(body.image) : null;
  if (p) parts.push({ inline_data: { mime_type: p.mime, data: p.b64 } });
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"] } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || ("Gemini 응답 " + r.status));
  const out = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const im = out.find((x) => x.inlineData || x.inline_data);
  if (!im) throw new Error("이미지가 오지 않았습니다");
  const d = im.inlineData || im.inline_data;
  return { image: "data:" + (d.mimeType || d.mime_type || "image/png") + ";base64," + d.data, model };
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const OWN = process.env.OWNER_KEY || "";
  if (req.method === "GET") {   // 설정 확인용 — 키 값은 돌려주지 않는다
    const prov = process.env.IMG_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : process.env.GEMINI_API_KEY ? "gemini" : "");
    return res.status(200).json({ ok: !!prov && !!OWN, provider: prov || null, model: prov === "gemini" ? (process.env.GEMINI_IMG_MODEL || "gemini-2.5-flash-image") : prov ? (process.env.IMG_MODEL || "gpt-image-2.5-flare") + " / 보정 " + (process.env.IMG_EDIT_MODEL || process.env.IMG_MODEL || "gpt-image-2.5-sunburst") : null });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!OWN) return res.status(500).json({ ok: false, error: "OWNER_KEY not set" });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  if (!same(body.t, tokenOf(OWN))) return res.status(401).json({ ok: false, error: "주인 인증이 필요합니다" });
  if (!body.prompt || String(body.prompt).length > 4000) return res.status(400).json({ ok: false, error: "프롬프트가 비었거나 너무 깁니다" });
  const prov = process.env.IMG_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : process.env.GEMINI_API_KEY ? "gemini" : "");
  try {
    let out;
    if (prov === "openai") { if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 가 없습니다"); out = await openai(body, process.env.OPENAI_API_KEY); }
    else if (prov === "gemini") { if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY 가 없습니다"); out = await gemini(body, process.env.GEMINI_API_KEY); }
    else throw new Error("이미지 API 키가 없습니다 (OPENAI_API_KEY 또는 GEMINI_API_KEY)");
    return res.status(200).json({ ok: true, image: out.image, provider: prov, model: out.model });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e && e.message || e).slice(0, 300) });
  }
};
