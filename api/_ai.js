// Shared AI caller: uses Google Gemini (free tier) when GEMINI_API_KEY is set, otherwise Anthropic Claude.
// turns: [{role:'user'|'assistant', content:string}]
export function aiProvider() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}
export async function aiText({ system, turns, maxTokens = 400, json = false }) {
  const p = aiProvider();
  if (!p) { const e = new Error('Chưa cấu hình khoá AI trên Vercel.'); e.code = 'missing_key'; throw e; }
  if (p === 'gemini') {
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY.trim() },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
        generationConfig: { maxOutputTokens: Math.max(maxTokens * 4, 2048), temperature: 0.8, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data?.error?.message || 'AI lỗi.'); e.status = r.status; throw e; }
    return (data.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('').trim();
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY.trim(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ELOCU_MODEL || 'claude-haiku-5-5', max_tokens: maxTokens, system, messages: turns }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data?.error?.message || 'AI lỗi.'); e.status = r.status; throw e; }
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}
