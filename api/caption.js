// Vercel serverless function: AI subtitles (English transcript + Vietnamese translation) for a VOA Learning English MP3.
// VOA audio is public domain. Uses the free Gemini key (GEMINI_API_KEY). Results are cached at the CDN for a year.
export const config = { maxDuration: 300 };
const OK_HOST = /^https:\/\/voa-audio\.voanews\.eu\/[\w\/\-.]+\.mp3$/;
const PROMPT = `Transcribe this English audio (VOA Learning English) for a Vietnamese learner.
Return ONLY JSON: {"segs":[{"t":"<start time as MM:SS string, e.g. 01:05>","en":"<one sentence, exactly as spoken>","vi":"<natural Vietnamese translation>"}]}
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
    const models = [...new Set([process.env.GEMINI_CAPTION_MODEL, 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'].filter(Boolean))];
    const t0 = Date.now();
    let last = 'AI lỗi.';
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (Date.now() - t0 > 200000) break;
        let r;
        try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key.trim() },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'audio/mp3', data: buf.toString('base64') } }, { text: PROMPT }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32000, temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(150000),
        }); } catch (e) { console.log('caption', model, 'timeout/err', e.name, Date.now() - t0); last = 'AI phản hồi quá lâu.'; break; }
        console.log('caption', model, r.status, Date.now() - t0);
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          const text = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
          let j = null; try { j = JSON.parse(text); } catch { try { j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch {} }
          const arr = Array.isArray(j) ? j : (j?.segs || j?.segments || j?.subtitles || Object.values(j || {}).find(Array.isArray) || []);
          console.log('caption out', model, text.length, arr.length, text.slice(0, 160).replace(/\s+/g, ' '));
          const segs = arr.map(x => x && ({ t: x.t ?? x.start ?? x.time ?? x.startTime, en: x.en ?? x.text ?? x.english, vi: x.vi ?? x.vietnamese ?? x.translation })).filter(x => x && typeof x.en === 'string' && x.en.trim())
            .map(x => ({ t: Math.max(0, typeof x.t === 'string' && x.t.includes(':') ? x.t.split(':').reduce((a, b) => a * 60 + +b, 0) : +x.t || 0), en: x.en.trim().slice(0, 400), vi: String(x.vi || '').trim().slice(0, 400) }))
            .sort((p, q) => p.t - q.t);
          // some models write 1:04 as 104; detect that pattern and convert
          if (segs.length && Math.max(...segs.map(x => x.t)) >= 100 && segs.every(x => x.t % 100 < 60)) segs.forEach(x => { x.t = Math.floor(x.t / 100) * 60 + (x.t % 100); });
          // stories credited to wire services (AP, Reuters, AFP) are copyrighted, so they are not republished
          if (segs.some(x => /Associated Press|\bReuters\b|\bAFP\b|Agence France-Presse/.test(x.en))) { res.setHeader('Cache-Control', 'public, s-maxage=31536000, immutable'); return res.status(200).json({ wire: true }); }
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
