// Natural English voice via Gemini TTS. GET /api/tts?t=<text>&v=<voice>&a=us|uk → audio/wav (cached by the CDN).
export const config = { maxDuration: 60 };

const VOICES = new Set(['Kore', 'Aoede', 'Zephyr', 'Puck', 'Charon', 'Leda', 'Callirrhoe', 'Autonoe', 'Sulafat', 'Achird']);
const MODELS = () => [...new Set([process.env.GEMINI_TTS_MODEL, 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts'].filter(Boolean))];

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'missing_key' });
  const url = new URL(req.url, 'http://x');
  const text = String(url.searchParams.get('t') || '').trim().slice(0, 400);
  const voice = VOICES.has(url.searchParams.get('v')) ? url.searchParams.get('v') : 'Kore';
  const uk = url.searchParams.get('a') === 'uk';
  if (!text) return res.status(400).json({ error: 'bad_request' });
  const prompt = `Read this aloud clearly and naturally for an English learner, in a warm, friendly ${uk ? 'British' : 'American'} accent, at a natural pace:\n${text}`;
  let last = 0;
  for (const model of MODELS()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key.trim() },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
          }),
          signal: AbortSignal.timeout(20000),
        });
      } catch { last = 504; break; }
      last = r.status;
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
        if (part) {
          const m = /rate=(\d+)/.exec(part.inlineData.mimeType || '');
          const buf = wav(Buffer.from(part.inlineData.data, 'base64'), m ? +m[1] : 24000);
          res.setHeader('content-type', 'audio/wav');
          res.setHeader('cache-control', 'public, max-age=31536000, s-maxage=31536000, immutable');
          console.log('tts ok', model, voice, text.length);
          return res.status(200).send(buf);
        }
      } else console.log('tts', model, r.status, (await r.text().catch(() => '')).slice(0, 160));
      if (r.status === 404 || r.status === 400) break;
      if (![429, 500, 503].includes(r.status)) break;
      await new Promise(s => setTimeout(s, 700));
    }
  }
  return res.status(last === 429 ? 429 : 502).json({ error: last === 429 ? 'rate_limited' : 'tts_failed' });
}
