// Vercel serverless function: AI-generated practice for SáoVoxy.
// kind=lesson → fresh exercises for a topic/level; kind=reading → comprehension questions + glossary for a passage.
import { aiText, aiProvider } from './_ai.js';
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

const LESSON_SYS = `You write English practice for Vietnamese learners. Output ONLY a JSON object, no prose, no code fences.
Schema: {"ex":[ ...exactly N items (N is given by the user)... ]} using these item shapes:
{"t":"mc","p":"question in Vietnamese or English","o":["opt1","opt2","opt3"],"a":0}
{"t":"fill","p":"English sentence with ___ for one missing word","o":["word1","word2","word3"],"a":0}
{"t":"build","p":"Vietnamese sentence","a":"Its natural English translation without final punctuation","d":["distractor1","distractor2"]}
{"t":"listen","s":"Short natural English sentence","p":"Câu bạn vừa nghe có nghĩa là gì?","o":["nghĩa tiếng Việt 1","2","3"],"a":0}
Rules: mix types (about 25% mc, 20% fill, 40% build, 15% listen); "a" is the 0-based index of the ONLY correct option; randomize the correct index; distractors must be clearly wrong; English must be natural and correct; Vietnamese must be natural; build answers 3-9 words; match the requested CEFR level and topic; no sensitive or adult content.`;

const OUTLINE_SYS = `You design the next stage of an English course for Vietnamese adults. Output ONLY a JSON object, no prose.
Schema: {"name":"short stage name in Vietnamese (2-4 words)","sub":"one short Vietnamese line listing the themes","topics":[{"title":"short English topic title (1-4 words)","desc":"one short Vietnamese line: what the learner will practise"}, ...exactly 4 topics]}
Rules: topics must be practical and clearly different from the topics already studied; suit the requested CEFR level; no sensitive or adult content.`;

const READING_SYS = `You help Vietnamese learners read an English passage. Output ONLY a JSON object, no prose, no code fences.
Schema: {"summary":"2-sentence summary in Vietnamese","vocab":[["english word or phrase","nghĩa tiếng Việt"], ...6 items],"qs":[["question in English",["opt1","opt2","opt3"],0], ...4 items]}
Rules: questions must be answerable from the passage only; exactly one correct option; randomize the correct index; vocab picks useful words that appear in the passage.`;

const clean = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
function validEx(e) {
  if (!e || typeof e !== 'object') return null;
  const opts = o => Array.isArray(o) && o.length >= 2 && o.length <= 4 && o.every(x => typeof x === 'string' && x.trim());
  if ((e.t === 'mc' || e.t === 'fill') && opts(e.o) && Number.isInteger(e.a) && e.a >= 0 && e.a < e.o.length && e.p && (e.t !== 'fill' || e.p.includes('___')))
    return { t: e.t, p: clean(e.p), o: e.o.map(x => clean(x, 120)), a: e.a };
  if (e.t === 'listen' && opts(e.o) && Number.isInteger(e.a) && e.a >= 0 && e.a < e.o.length && e.s)
    return { t: 'listen', s: clean(e.s, 160), p: 'Câu bạn vừa nghe có nghĩa là gì?', o: e.o.map(x => clean(x, 120)), a: e.a };
  if (e.t === 'build' && e.p && e.a && Array.isArray(e.d)) {
    const a = clean(e.a, 120).replace(/[.?!]+$/, ''); if (a.split(' ').length < 2 || a.split(' ').length > 12) return null;
    return { t: 'build', p: clean(e.p), a, d: e.d.slice(0, 3).map(x => clean(x, 20).split(' ')[0]).filter(Boolean) };
  }
  return null;
}
function parseJSON(text) { const i = text.indexOf('{'), j = text.lastIndexOf('}'); if (i < 0 || j < i) return null; try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; } }

export default async function handler(req, res) {
  const probe = req.method === 'GET' && req.query.probe === 'outline-svx';
  if (!probe && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!aiProvider()) return res.status(503).json({ error: 'missing_key', message: 'Chưa cấu hình khoá AI trên Vercel.' });
  let body = probe ? { kind: 'outline', level: 'C1', no: 1, done: ['Small Talk', 'At Work', 'Travel', 'Job Interview', 'Opinions'] } : req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const kind = ['reading', 'outline'].includes(body?.kind) ? body.kind : 'lesson';
  let system, user;
  if (kind === 'lesson') {
    const level = LEVELS.includes(body?.level) ? body.level : 'A2';
    const topic = clean(body?.topic, 80) || 'everyday life';
    const desc = clean(body?.desc, 160);
    const avoid = Array.isArray(body?.avoid) ? body.avoid.slice(0, 20).map(x => clean(x, 80)).join(' | ') : '';
    const n = Math.min(14, Math.max(6, +body?.count || 8));
    system = LESSON_SYS;
    user = `N = ${n}. Topic: ${topic}${desc ? ' (' + desc + ')' : ''}. CEFR level: ${level}. Make new sentences${avoid ? `, different from: ${avoid}` : ''}.`;
  } else if (kind === 'outline') {
    const level = LEVELS.includes(body?.level) ? body.level : 'C1';
    const done = Array.isArray(body?.done) ? body.done.slice(0, 60).map(x => clean(x, 40)).join(', ') : '';
    system = OUTLINE_SYS; user = `CEFR level: ${level}. Stage number: ${+body?.no || 1}. Topics already studied: ${done || 'none'}.`;
  } else {
    const text = clean(body?.text, 6000); if (text.length < 200) return res.status(400).json({ error: 'bad_request' });
    system = READING_SYS; user = `Title: ${clean(body?.title, 160)}\n\n${text}`;
  }
  try {
    const text = await aiText({ system, turns: [{ role: 'user', content: user }], maxTokens: 2500, json: true });
    const j = parseJSON(text);
    if (kind === 'outline') {
      const topics = (j?.topics || []).filter(t => t && t.title).slice(0, 5).map(t => ({ title: clean(t.title, 40), desc: clean(t.desc, 120) }));
      if (topics.length < 3) return res.status(502).json({ error: 'bad_output', message: 'AI chưa tạo được chặng, thử lại nhé.' });
      return res.status(200).json({ name: clean(j.name, 40) || 'Chặng mới', sub: clean(j.sub, 120), topics });
    }
    if (kind === 'lesson') {
      const ex = (j?.ex || []).map(validEx).filter(Boolean);
      if (ex.length < 4) return res.status(502).json({ error: 'bad_output', message: 'AI trả về bài chưa hợp lệ, thử lại nhé.' });
      return res.status(200).json({ ex });
    }
    const qs = (j?.qs || []).filter(q => Array.isArray(q) && q[0] && Array.isArray(q[1]) && q[1].length >= 2 && Number.isInteger(q[2]) && q[2] >= 0 && q[2] < q[1].length)
      .slice(0, 5).map(q => [clean(q[0], 200), q[1].slice(0, 4).map(x => clean(x, 120)), q[2]]);
    const vocab = (j?.vocab || []).filter(v => Array.isArray(v) && v[0] && v[1]).slice(0, 8).map(v => [clean(v[0], 40), clean(v[1], 80)]);
    return res.status(200).json({ summary: clean(j?.summary, 400), vocab, qs });
  } catch (err) {
    const status = err.status === 429 ? 429 : 502;
    return res.status(status).json({ error: status === 429 ? 'rate_limited' : 'upstream_error', message: err.status ? err.message : 'Không kết nối được AI.' });
  }
}
