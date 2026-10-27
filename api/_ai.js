// Shared AI caller: uses Google Gemini (free tier) when GEMINI_API_KEY is set, otherwise Anthropic Claude.
// turns: [{role:'user'|'assistant', content:string}]
export function aiProvider() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}
export async function aiText({ system, turns, maxTokens = 400, json = false, fast = false, budgetMs = 0 }) {
  const t0 = Date.now();
  const p = aiProvider();
  if (!p) { const e = new Error('Chưa cấu hình khoá AI trên Vercel.'); e.code = 'missing_key'; throw e; }
  if (p === 'gemini') {
    // try the configured model, then lighter fallbacks when Google reports overload or quota
    const models = fast
      ? [...new Set(['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-3.8-flash'].filter(Boolean))]
      : [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite'].filter(Boolean))];
    let last;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (budgetMs && Date.now() - t0 > budgetMs) { const e = new Error('AI phản hồi chậm.'); e.status = 504; throw e; }
        const left = budgetMs ? Math.max(3000, budgetMs - (Date.now() - t0)) : 60000;
        let r;
        try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY.trim() },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
            generationConfig: { maxOutputTokens: Math.max(maxTokens * 4, 2048), temperature: 0.8, ...(json ? { responseMimeType: 'application/json' } : {}) },
          }),
          signal: AbortSignal.timeout(Math.min(left, fast ? 12000 : 60000)),
        }); } catch (err) { last = new Error('AI phản hồi chậm.'); last.status = 504; console.log('ai timeout', model); break; }
        const data = await r.json().catch(() => ({}));
        if (!r.ok) console.log('ai', model, r.status);
        if (r.ok) { const text = (data.candidates?.[0]?.content?.parts || []).filter(x => !x.thought).map(x => x.text || '').join('').trim(); if (text) return text; }
        last = new Error(data?.error?.message || 'AI lỗi.'); last.status = r.status;
        if (![429, 500, 503, 404].includes(r.status) && r.ok === false) throw last;
        if (r.status === 404) break; // model name not available → next model
        await new Promise(res => setTimeout(res, 600));
      }
    }
    throw last || new Error('AI lỗi.');
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
