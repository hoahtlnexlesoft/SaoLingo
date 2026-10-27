// Vercel serverless function: VOA Learning English reader.
// VOA Learning English texts and MP3s are public domain (credit learningenglish.voanews.com);
// stories credited to AP, Reuters or AFP are copyrighted and are filtered out here.
const BASE = 'https://learningenglish.voanews.com/api/';
const FEEDS = ['z-ptqml-vomx-tper-kqy','z-qvqvl-vomx-tperkuqt','zt-pq_l-vomx-tpekyyqv','zgptqil-vomx-tpe-jkqm','z-viqql-vomx-tpero_qq','zbptq_l-vomx-tpeq-kqv','zj-pqrl-vomx-tpebyyqo','z_yrool-vomx-tpevrioq'];
const ID_RE = /^[a-z0-9_\-$]{6,40}$/i;

const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]).trim() : ''; };
const toParas = html => decode(html)
  .replace(/<\s*(br|\/p|\/h\d|\/li)[^>]*>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .split(/\n+/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
const WIRE = /\b(Associated Press|AP|Reuters|AFP|Agence France-Presse)\b/;

async function getFeed(id) {
  const r = await fetch(BASE + id, { headers: { 'user-agent': 'SaoVoxy/1.0 (+https://saovoxy.vercel.app)' } });
  if (!r.ok) throw new Error('feed ' + r.status);
  const xml = await r.text();
  const channel = tag(xml.split('<item')[0], 'title');
  const items = (xml.match(/<item[\s\S]*?<\/item>/gi) || []).map(it => {
    const enc = (it.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="audio[^"]*"/i) || it.match(/<enclosure[^>]*type="audio[^"]*"[^>]*url="([^"]+)"/i) || [])[1] || '';
    const body = tag(it, 'content:encoded') || tag(it, 'description');
    const paras = toParas(body);
    return { title: tag(it, 'title'), link: tag(it, 'link'), date: tag(it, 'pubDate'), audio: enc, author: tag(it, 'author') || tag(it, 'dc:creator'), paras };
  });
  return { channel, items };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  try {
    if (req.query.raw) {
      const id = String(req.query.raw); if (!ID_RE.test(id)) return res.status(400).end();
      const r = await fetch(BASE + id, { headers: { 'user-agent': 'SaoVoxy/1.0' } }); const xml = await r.text();
      const it = (xml.match(/<item[\s\S]*?<\/item>/i) || [''])[0];
      return res.status(200).json({ item: it.slice(0, 3000) });
    }
    if (req.query.page) {
      const u = String(req.query.page); if (!/^https:\/\/learningenglish\.voanews\.com\/a\//.test(u)) return res.status(400).end();
      const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 SaoVoxy/1.0' } }); const html = await r.text();
      const ps = [...html.matchAll(/<p[^>]*>([^<]{80,})/g)]; const i = html.indexOf('class="body-container"'); const markers = [...new Set((html.match(/(id|class)="[^"]*(article|content|body|wsw)[^"]*"/g) || []))].slice(0, 30); const mp3 = [...new Set((html.match(/https:[^"' ]+\.mp3/g) || []))].slice(0, 5);
      return res.status(200).json({ status: r.status, len: html.length, mp3, np: ps.length, markers, snippet: i>=0 ? html.slice(i, i + 6000).replace(/\s+/g,' ') : '', tail: ps.length ? html.slice(ps[ps.length-1].index, ps[ps.length-1].index + 1500) : '' });
    }
    if (req.query.discover) {
      const r = await fetch('https://learningenglish.voanews.com/rssfeeds', { headers: { 'user-agent': 'SaoVoxy/1.0' } });
      const html = await r.text();
      const links = [...html.matchAll(/href="(\/api\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({ id: m[1].replace('/api/', ''), name: m[2].replace(/<[^>]+>/g, '').trim() }));
      return res.status(200).json({ status: r.status, n: links.length, links: links.slice(0, 80) });
    }
    if (req.query.list) {
      const ids = String(req.query.ids || '').split(',').filter(x => ID_RE.test(x)); const use = ids.length ? ids.slice(0, 50) : FEEDS;
      const out = await Promise.all(use.map(async id => { try { const f = await getFeed(id); return { id, channel: f.channel, n: f.items.length, withText: f.items.filter(i => i.paras.length > 3).length, withAudio: f.items.filter(i => i.audio).length }; } catch (e) { return { id, error: String(e.message) }; } }));
      return res.status(200).json({ feeds: out });
    }
    const id = String(req.query.feed || FEEDS[0]);
    if (!ID_RE.test(id)) return res.status(400).json({ error: 'bad_feed' });
    const f = await getFeed(id);
    const items = f.items
      .filter(i => i.title && i.paras.length >= 3)
      .filter(i => !WIRE.test(i.author) && !i.paras.slice(-4).some(p => WIRE.test(p) && p.length < 160))
      .slice(0, 20)
      .map(i => ({ ...i, paras: i.paras.slice(0, 40) }));
    return res.status(200).json({ channel: f.channel, items, credit: 'VOA Learning English (learningenglish.voanews.com), public domain' });
  } catch (e) {
    return res.status(502).json({ error: 'upstream_error', message: 'Không tải được bài VOA.' });
  }
}
