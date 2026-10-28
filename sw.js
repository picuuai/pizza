// Guarda o app no aparelho para funcionar sem internet.
// Ao mudar qualquer arquivo, aumente a versão para os celulares baixarem de novo.
const VERSAO = 'massa-pizza-v1';
const ARQUIVOS = [
  './',
  'index.html',
  'style.css',
  'receitas.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Responde com a cópia salva (rápido e offline) e atualiza a cópia em segundo plano;
// a versão nova aparece na próxima vez que o app for aberto.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSAO).then(async (cache) => {
      const salvo = await cache.match(e.request, { ignoreSearch: true });
      const rede = fetch(e.request)
        .then((resp) => {
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        })
        .catch(() => salvo);
      if (salvo) {
        e.waitUntil(rede);
        return salvo;
      }
      return rede;
    })
  );
});
