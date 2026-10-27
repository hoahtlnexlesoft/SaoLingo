// Vercel serverless function: AI subtitles (English transcript + Vietnamese translation) for a VOA Learning English MP3.
// VOA audio is public domain. Uses the free Gemini key (GEMINI_API_KEY). Results are cached at the CDN for a year.
export const config = { maxDuration: 120 };
const OK_HOST = /^https:\/\/voa-audio\.voanews\.eu\/[\w\/\-.]+\.mp3$/;
const PROMPT = `Transcribe this English audio (VOA Learning English) for a Vietnamese learner.
Return ONLY JSON: {"segs":[{"t":<start time in seconds, number>,"en":"<one sentence, exactly as spoken>","vi":"<natural Vietnamese translation>"}]}
Rules: one sentence per segment, in order, covering the whole audio; timestamps accurate to about a second; keep speaker words verbatim; skip music; Vietnamese must be natural, not word-for-word.`;

export default async function handler(req, res) {
  const audio = String(req.query.audio || '');
  if (!OK_HOST.test(audio)) return res.status(400).json({ error: 'bad_audio' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'missing_key', message: 'Cần GEMINI_API_KEY để tạo phụ đề.' });
  try {
    const a = await fetch(audio);
    if (!a.ok) return res.status(502).json({ error: 'audio_fetch' });
    const buf = Buffer.from(await a.arrayBuffer());
    if (buf.length > 18 * 1024 * 1024) return res.status(413).json({ error: 'too_long', message: 'Bài quá dài để tạo phụ đề.' });
    const models = [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash'].filter(Boolean))];
    let last = 'AI lỗi.';
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key.trim() },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'audio/mp3', data: buf.toString('base64') } }, { text: PROMPT }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32000, temperature: 0.2 },
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          const text = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
          let j = null; try { j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch {}
          const segs = (j?.segs || []).filter(x => x && typeof x.en === 'string' && x.en.trim())
            .map(x => ({ t: Math.max(0, +x.t || 0), en: x.en.trim().slice(0, 400), vi: String(x.vi || '').trim().slice(0, 400) }))
            .sort((p, q) => p.t - q.t);
          if (segs.length >= 3) {
            res.setHeader('Cache-Control', 'public, s-maxage=31536000, immutable');
            return res.status(200).json({ segs, model });
          }
          last = 'Phụ đề chưa hợp lệ.';
        } else last = data?.error?.message || last;
        if (r.status === 404) break;
        await new Promise(s => setTimeout(s, 800));
      }
    }
    return res.status(502).json({ error: 'upstream_error', message: last });
  } catch (e) {
    return res.status(502).json({ error: 'upstream_error', message: 'Không tạo được phụ đề.' });
  }
}
