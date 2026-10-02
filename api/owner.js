// api/owner.js — '나만 보기' 화면(지금 시장·채널 브리핑) 잠금 해제 (v7.3)
// 환경변수 OWNER_KEY (Vercel → Settings → Environment Variables). 비밀번호는 index.html 에 들어가지 않는다.
//  POST {key}  → 맞으면 {ok:true, token}   (token = HMAC-SHA256(OWNER_KEY, "trackapt-owner-v1"))
//  GET  ?t=토큰 → {ok:true|false}           (앱이 열릴 때마다 확인 — 틀리면 앱이 잠금 상태로 되돌린다)
const crypto = require("crypto");
function tokenOf(key) { return crypto.createHmac("sha256", key).update("trackapt-owner-v1").digest("hex"); }
function same(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const KEY = process.env.OWNER_KEY || "";
  if (!KEY) return res.status(500).json({ ok: false, error: "OWNER_KEY not set" });
  const tok = tokenOf(KEY);
  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const key = (body && body.key) || "";
    await new Promise((r) => setTimeout(r, 400));          // 마구 대입 늦추기
    if (!same(key, KEY)) return res.status(401).json({ ok: false });
    return res.status(200).json({ ok: true, token: tok });
  }
  const t = (req.query && req.query.t) || "";
  return res.status(same(t, tok) ? 200 : 401).json({ ok: same(t, tok) });
};
