// Vercel serverless function: VOA Learning English listening shelf.
// VOA Learning English texts and MP3s are public domain (credit learningenglish.voanews.com);
// material credited to AP, Reuters or AFP is copyrighted, so any episode whose page mentions them is skipped.
const BASE = 'https://learningenglish.voanews.com';
const SHELVES = [
  { id: 'zmmpql-vomx-tpey-_q', name: 'Sức khỏe & đời sống' },
  { id: 'zmg_pl-vomx-tpeymtm', name: 'Khoa học & công nghệ' },
  { id: 'z_gjqyl-vomx-tpevmrov', name: 'Mẹo học tập' },
  { id: 'zmypyl-vomx-tpeyry_', name: 'Từ ngữ & thành ngữ' },
  { id: 'zoroqql-vomx-tpeptpqq', name: 'Ngữ pháp hằng ngày' },
  { id: 'zyg__l-vomx-tpetmty', name: 'Truyện Mỹ' },
];
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; SaoVoxy/1.0; +https://saovoxy.vercel.app)' };
const WIRE = /Associated Press|\bAP\b photo|Reuters|AFP|Agence France-Presse/;
const dec = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const meta = (html, p) => dec((html.match(new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]*)"`, 'i')) || [])[1]);

async function feedItems(id, n) {
  const r = await fetch(`${BASE}/api/${id}`, { headers: UA }); if (!r.ok) return [];
  const xml = await r.text();
  return (xml.match(/<item[\s\S]*?<\/item>/gi) || []).slice(0, n).map(it => ({
    title: dec((it.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]),
    link: dec((it.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]),
    date: dec((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1]),
    image: (it.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i) || [])[1] || '',
  })).filter(i => /^https:\/\/learningenglish\.voanews\.com\/a\//.test(i.link));
}
async function episode(it) {
  try {
    const r = await fetch(it.link, { headers: UA }); if (!r.ok) return null;
    const html = await r.text();
    if (WIRE.test(html.replace(/<script[\s\S]*?<\/script>/gi, ''))) return null;
    const audio = (html.match(/https:\/\/voa-audio\.voanews\.eu\/[^"'&\s]+?(?<!_hq)\.mp3/) || [])[0];
    if (!audio) return null;
    const dur = +((html.match(/"duration"\s*:\s*"?(\d+)/i) || [])[1] || 0);
    return { title: it.title, link: it.link, date: it.date, image: it.image.replace(/_w\d+_h\d+/, '_w400_h225'), audio, desc: meta(html, 'og:description').slice(0, 300), dur };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  try {
    const per = Math.min(8, Math.max(2, +req.query.n || 5));
    const shelves = await Promise.all(SHELVES.map(async s => {
      const items = await feedItems(s.id, per + 3);
      const seen = new Set(); const eps = (await Promise.all(items.map(episode))).filter(e => e && !seen.has(e.audio) && seen.add(e.audio)).slice(0, per);
      return { name: s.name, items: eps };
    }));
    return res.status(200).json({ shelves: shelves.filter(s => s.items.length), credit: 'VOA Learning English · learningenglish.voanews.com (public domain)' });
  } catch (e) {
    return res.status(502).json({ error: 'upstream_error', message: 'Không tải được bài VOA.' });
  }
}
