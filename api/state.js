// Optional cross-device sync. Works when an Upstash Redis database is connected
// to the Vercel project (sets UPSTASH_REDIS_REST_URL / _TOKEN automatically).
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  return (await r.json()).result;
}

export default async function handler(req, res) {
  if (!url || !token) return res.status(200).json({ enabled: false });
  const pin = String(req.query.pin || (req.body && req.body.pin) || "");
  if (!/^[0-9]{4,8}$/.test(pin)) return res.status(400).json({ error: "PIN must be 4-8 digits" });
  const key = `padanam:${pin}`;
  if (req.method === "GET") {
    const v = await redis(["GET", key]);
    return res.status(200).json({ enabled: true, state: v ? JSON.parse(v) : null });
  }
  if (req.method === "POST") {
    await redis(["SET", key, JSON.stringify(req.body.state)]);
    return res.status(200).json({ enabled: true, ok: true });
  }
  res.status(405).end();
}
