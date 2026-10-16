/* Service worker — M&I Daily Checklist
   Trang chính: stale-while-revalidate — mở ngay bản đã lưu (nhanh, đỡ băng thông, chạy offline), đồng thời
   tải bản mới ở nền (HTTP cache/ETag của GitHub Pages → thường chỉ 304); có bản khác thì báo trang hiện nút "Tải lại".
   Icon/manifest + thư viện Firebase (gstatic, có số phiên bản): ưu tiên bộ nhớ đệm. Đổi CACHE khi thêm/bớt file trong SHELL. */
const CACHE = 'mi-checklist-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('mi-checklist-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const sig = r => r ? (r.headers.get('etag') || '') + '|' + (r.headers.get('last-modified') || '') + '|' + (r.headers.get('content-length') || '') : '';
async function notifyUpdate() {
  const list = await self.clients.matchAll({ type: 'window' });
  list.forEach(c => c.postMessage({ type: 'mi-update' }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;              // không can thiệp request khác ra ngoài (Firestore, Auth…)

  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match('./index.html');
      const net = fetch(req, { cache: 'no-cache' }).then(async res => {
        if (res.ok && res.type === 'basic') {
          const changed = hit && sig(hit) !== sig(res);
          await cache.put('./index.html', res.clone());
          if (changed) notifyUpdate();
        }
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || (await caches.match('./')) || Response.error();
    })());
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
