// Vercel serverless function: AI conversation tutor for Elocu.
// Needs GEMINI_API_KEY (free, aistudio.google.com) or ANTHROPIC_API_KEY in Vercel → Project → Settings → Environment Variables.
import { aiText, aiProvider } from './_ai.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!aiProvider()) return res.status(503).json({ error: 'missing_key', message: 'Chưa cấu hình khoá AI trên Vercel.' });

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
    const text = await aiText({ system, turns: messages, maxTokens: 400 });
    return res.status(200).json({ text });
  } catch (err) {
    const status = err.status === 429 ? 429 : 502;
    return res.status(status).json({ error: status === 429 ? 'rate_limited' : 'upstream_error', message: err.status ? err.message : 'Không kết nối được AI.' });
  }
}
