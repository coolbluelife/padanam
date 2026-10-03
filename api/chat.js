// Vercel serverless function: forwards chat requests to Anthropic.
// The API key never reaches the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
  try {
    const { system, messages, max_tokens } = req.body || {};
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.MODEL || "claude-sonnet-4-6", max_tokens: max_tokens || 800, system, messages }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: (data.error && data.error.message) || "Anthropic error" });
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
