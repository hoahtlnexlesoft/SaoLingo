/* Elocu service worker: offline shell + daily reminder checks. */
const VERSION = 'elocu-v290';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
const STATE_CACHE = 'elocu-state';
const STATE_URL = '/__elocu_state';

const LINES = [
  ['Chỉ 5 phút thôi', 'Một bài nghe ngắn là đủ giữ nhịp hôm nay.'],
  ['Giọng nói của bạn đang chờ', 'Đọc to 2 câu, xem điểm phát âm mới.'],
  ['Đừng để chuỗi ngày bị đứt', 'Bạn đang có chuỗi {streak} ngày. Giữ lửa nhé!'],
  ['Một từ mới mỗi ngày', 'Mở thẻ từ vựng và ôn nhanh 10 thẻ.'],
  ['Gia sư đang rảnh', 'Trò chuyện 3 lượt với AI, được sửa lỗi ngay.'],
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k !== STATE_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request.url, { cache: 'no-store', credentials: 'same-origin' }).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put('/index.html', copy)); return r; })
      .catch(() => caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  })));
});

async function readState() {
  try { const r = await (await caches.open(STATE_CACHE)).match(STATE_URL); return r ? await r.json() : null; } catch { return null; }
}
async function writeState(s) {
  const c = await caches.open(STATE_CACHE);
  await c.put(STATE_URL, new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json' } }));
}
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

async function maybeRemind() {
  const s = await readState();
  if (!s || !s.enabled) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin >= 19 * 60 || nowMin < 7 * 60) return; // quiet hours 19:00–07:00
  const [h, m] = (s.time || '18:30').split(':').map(Number);
  const past = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  if (!past || s.studiedDay === today() || s.notifiedDay === today()) return;
  const pick = s.streak > 0 ? LINES[2] : LINES[now.getDate() % LINES.length];
  await self.registration.showNotification(pick[0], {
    body: pick[1].replace('{streak}', s.streak), icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: 'daily-reminder', renotify: false, data: { url: '/#home' },
  });
  s.notifiedDay = today(); await writeState(s);
}

self.addEventListener('message', e => {
  if (e.data?.type === 'state') e.waitUntil(readState().then(old => writeState({ ...(old || {}), ...e.data.state })).then(maybeRemind));
  if (e.data?.type === 'check') e.waitUntil(maybeRemind());
});
self.addEventListener('periodicsync', e => { if (e.tag === 'daily-reminder') e.waitUntil(maybeRemind()); });

/* Server push (optional, see README): payload {title, body, url} */
self.addEventListener('push', e => {
  let p = {}; try { p = e.data ? e.data.json() : {}; } catch { p = { body: e.data?.text() }; }
  const hm = new Date().getHours() * 60 + new Date().getMinutes();
  if ((hm >= 19 * 60 || hm < 7 * 60) && !p.force) return; // quiet hours
  e.waitUntil(self.registration.showNotification(p.title || 'SáoVoxy', {
    body: p.body || 'Đến giờ luyện tiếng Anh rồi.', icon: '/icons/icon-192.png', tag: 'daily-reminder', data: { url: p.url || '/#home' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if ('focus' in w) { w.navigate(target).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(target);
  })());
});
