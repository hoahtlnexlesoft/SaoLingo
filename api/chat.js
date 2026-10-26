// Vercel serverless function: AI conversation tutor for Elocu.
// Needs the environment variable ANTHROPIC_API_KEY (Vercel → Project → Settings → Environment Variables).
const MODEL = process.env.ELOCU_MODEL || 'claude-haiku-5-5';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'missing_key', message: 'Chưa cấu hình ANTHROPIC_API_KEY trên Vercel.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const system = String(body?.system || '').slice(0, 4000);
  const turns = Array.isArray(body?.turns) ? body.turns.slice(-16) : [];
  const messages = turns
    .filter(t => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .map(t => ({ role: t.role, content: t.content.slice(0, 2000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift(); // API requires a user turn first
  if (!system || !messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'bad_request', message: 'Thiếu nội dung hội thoại.' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages }),
    });
    const data = await r.json();
    if (!r.ok) {
      const status = r.status === 429 ? 429 : 502;
      return res.status(status).json({ error: status === 429 ? 'rate_limited' : 'upstream_error', message: data?.error?.message || 'AI lỗi.' });
    }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(502).json({ error: 'upstream_error', message: 'Không kết nối được AI.' });
  }
}
