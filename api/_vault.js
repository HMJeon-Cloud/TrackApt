// api/_vault.js — 보관함(배경·내 스타일·구성·아이콘·카드 양식)을 서버(Upstash Redis)에 저장 (v9.26)
// 별도 함수가 아니다(파일명이 _ 로 시작 → Vercel 함수 수에 안 셈). api/img.js 가 { vault:1 } 요청을 이리로 넘긴다.
// PC·휴대폰 어디서나 같은 보관함. 주인 토큰(OWNER_KEY HMAC)이 있어야 읽고 쓸 수 있다.
// 환경변수(Vercel): UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  (또는 Vercel KV 연동 시 KV_REST_API_URL + KV_REST_API_TOKEN)
//   TrackStock 과 같은 Upstash DB 를 써도 된다 — 키는 모두 "ta:v:" 로 시작해 겹치지 않는다.
// 키: ta:v:idx (항목 목록 JSON — 이미지 없이 이름·종류·태그 등) · ta:v:img:<id> (압축 이미지 data URL) · ta:v:th:<id> (썸네일)
// 한도: 이미지 있는 항목 VAULT_MAX(기본 300)장. 넘으면 즐겨찾기·고정 아이콘이 아닌 것 중 가장 오래 안 쓴 것부터 지운다.
// POST /api/img { vault:1, t, op, ... }
//   list                         → { ok, items:[meta…] }
//   thumbs  { ids:[…] }          → { ok, thumbs:{id: dataURL} }
//   get     { id }               → { ok, item:meta, img }
//   add     { item:meta, img?, thumb? } → { ok, item, removed:[ids] }
//   update  { id, patch:{name?, fav?, tags?, pin?, cat?} } → { ok, item }
//   use     { id }               → { ok }
//   del     { id }               → { ok }
// GET → { ok, configured }  (설정 확인용)
const crypto = require("crypto");
function tokenOf(key) { return crypto.createHmac("sha256", key).update("trackapt-owner-v1").digest("hex"); }
function same(a, b) { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && crypto.timingSafeEqual(x, y); }
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const TOK_ = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const P = "ta:v:", MAX = Number(process.env.VAULT_MAX || 300);
async function redis(cmds) {
  const r = await fetch(URL_.replace(/\/$/, "") + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + TOK_, "content-type": "application/json" }, body: JSON.stringify(cmds) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(j)) throw new Error("Redis 응답 " + r.status + (j && j.error ? " " + j.error : ""));
  return j.map((x) => { if (x && x.error) throw new Error(x.error); return x ? x.result : null; });
}
async function readIdx() { const [v] = await redis([["GET", P + "idx"]]); try { return v ? JSON.parse(v) : []; } catch (e) { return []; } }
async function writeIdx(L) { await redis([["SET", P + "idx", JSON.stringify(L)]]); }
const KINDS = { bg: 1, style: 1, preset: 1, icon: 1, insight: 1 };   /* insight = 인사이트 예상 기록(v9.33) — 이미지 없음 */
function clean(m) {
  const s = (v, n) => String(v == null ? "" : v).slice(0, n || 120);
  return { id: s(m.id, 40), kind: KINDS[m.kind] ? m.kind : "bg", name: s(m.name, 80), type: s(m.type, 20), form: s(m.form, 40), scope: s(m.scope, 40), cat: s(m.cat, 20), kw: (Array.isArray(m.kw) ? m.kw : []).slice(0, 40).map((x) => s(x, 20)), tags: (Array.isArray(m.tags) ? m.tags : []).slice(0, 10).map((x) => s(x, 30)),
    prompt: s(m.prompt, 600), data: m.data && typeof m.data === "object" && JSON.stringify(m.data).length <= 60000 ? m.data : null, sig: s(m.sig, 90), hasImg: !!m.hasImg, fav: !!m.fav, pin: !!m.pin, at: Number(m.at) || Date.now(), lastUse: Number(m.lastUse) || 0, uses: Number(m.uses) || 0, from: s(m.from, 30) };
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ ok: true, configured: !!(URL_ && TOK_ && process.env.OWNER_KEY) });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const OWN = process.env.OWNER_KEY || "";
  if (!OWN) return res.status(500).json({ ok: false, error: "OWNER_KEY not set" });
  if (!URL_ || !TOK_) return res.status(500).json({ ok: false, error: "Upstash Redis 환경변수가 없습니다 (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)" });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
  if (!same(b.t, tokenOf(OWN))) return res.status(401).json({ ok: false, error: "주인 인증이 필요합니다" });
  try {
    if (b.op === "list") return res.status(200).json({ ok: true, items: await readIdx(), max: MAX });
    if (b.op === "thumbs") { const ids = (b.ids || []).slice(0, 60).map(String); if (!ids.length) return res.status(200).json({ ok: true, thumbs: {} }); const [vals] = await redis([["MGET"].concat(ids.map((i) => P + "th:" + i))]); const out = {}; ids.forEach((i, k) => { if (vals && vals[k]) out[i] = vals[k]; }); return res.status(200).json({ ok: true, thumbs: out }); }
    if (b.op === "get") { const L = await readIdx(), it = L.find((x) => x.id === String(b.id)); if (!it) return res.status(404).json({ ok: false, error: "없음" }); const [img] = await redis([["GET", P + "img:" + it.id]]); return res.status(200).json({ ok: true, item: it, img: img || null }); }
    if (b.op === "add") {
      const m = clean(Object.assign({}, b.item || {}, { id: (b.item && b.item.id) || Date.now().toString(36) + crypto.randomBytes(3).toString("hex"), hasImg: !!b.img, at: Date.now() }));
      const img = b.img ? String(b.img) : null, th = b.thumb ? String(b.thumb) : null;
      if (img && (!/^data:image\//.test(img) || img.length > 900000)) throw new Error("이미지가 너무 큽니다(압축 후 다시)");
      const L = await readIdx(); L.unshift(m);
      const cmds = []; if (img) cmds.push(["SET", P + "img:" + m.id, img]); if (th) cmds.push(["SET", P + "th:" + m.id, th.slice(0, 120000)]);
      /* 한도: 이미지 있는 것만 센다. 즐겨찾기·고정은 남긴다 */
      const removed = []; const withImg = L.filter((x) => x.hasImg);
      if (withImg.length > MAX) { const cand = withImg.filter((x) => !x.fav && !x.pin).sort((a, c) => (a.lastUse || a.at) - (c.lastUse || c.at)); for (let i = 0; i < withImg.length - MAX && i < cand.length; i++) removed.push(cand[i].id); }
      const keep = L.filter((x) => removed.indexOf(x.id) < 0);
      removed.forEach((id) => { cmds.push(["DEL", P + "img:" + id]); cmds.push(["DEL", P + "th:" + id]); });
      cmds.push(["SET", P + "idx", JSON.stringify(keep)]);
      await redis(cmds);
      return res.status(200).json({ ok: true, item: m, removed });
    }
    if (b.op === "update" || b.op === "use") {
      const L = await readIdx(), it = L.find((x) => x.id === String(b.id)); if (!it) return res.status(404).json({ ok: false, error: "없음" });
      if (b.op === "use") { it.uses = (it.uses || 0) + 1; it.lastUse = Date.now(); }
      else { const p = b.patch || {}; if (p.name != null) it.name = String(p.name).slice(0, 80); if (p.data && typeof p.data === "object" && JSON.stringify(p.data).length <= 60000) it.data = p.data; if (p.fav != null) it.fav = !!p.fav; if (p.tags) it.tags = p.tags.slice(0, 10).map((x) => String(x).slice(0, 30)); if (p.cat != null) it.cat = String(p.cat).slice(0, 20);
        if (p.pin != null) { it.pin = !!p.pin; if (it.pin && it.kind === "icon") L.forEach((x) => { if (x !== it && x.kind === "icon" && x.cat === it.cat) x.pin = false; }); } }   /* 카테고리마다 고정 아이콘은 하나 */
      await writeIdx(L); return res.status(200).json({ ok: true, item: it });
    }
    if (b.op === "del") { const L = await readIdx(); const keep = L.filter((x) => x.id !== String(b.id)); await redis([["SET", P + "idx", JSON.stringify(keep)], ["DEL", P + "img:" + b.id], ["DEL", P + "th:" + b.id]]); return res.status(200).json({ ok: true }); }
    throw new Error("op 는 list · thumbs · get · add · update · use · del");
  } catch (e) { return res.status(502).json({ ok: false, error: String(e && e.message || e).slice(0, 300) }); }
};
