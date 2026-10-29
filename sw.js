// Guarda o app no aparelho para funcionar sem internet.
// Com internet, sempre busca a versão mais nova dos arquivos do app.
const VERSAO = 'massa-pizza-v13';
const ARQUIVOS = [
  './',
  'index.html',
  'style.css',
  'receitas.js',
  'app.js',
  'planejador.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
const ESPERA_REDE_MS = 4000;

self.addEventListener('install', (e) => {
  // cache: 'reload' ignora o cache HTTP do navegador (o GitHub Pages manda guardar por 10 min)
  e.waitUntil(
    caches.open(VERSAO)
      .then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO && k !== FOTOS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fotos do Wikimedia Commons: guardadas na primeira vez que aparecem, para funcionar offline
const FOTOS = 'massa-pizza-fotos';
const ehFoto = (url) => /(^|\.)wikimedia\.org$/.test(url.hostname);

// Arquivos do app: tenta a rede primeiro (versão mais nova, revalidando com o servidor)
// e usa a cópia salva se estiver sem internet ou a rede demorar demais.
async function redePrimeiro(request) {
  const cache = await caches.open(VERSAO);
  const url = new URL(request.url);
  url.search = '';
  const chave = url.href;

  const rede = fetch(chave, { cache: 'no-cache' }).then((resp) => {
    if (resp.ok) cache.put(chave, resp.clone());
    return resp;
  });
  const salvo = await cache.match(chave);
  if (!salvo) return rede;

  const limite = new Promise((resolver) => setTimeout(() => resolver(salvo), ESPERA_REDE_MS));
  return Promise.race([rede.catch(() => salvo), limite]);
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (ehFoto(url)) {
    e.respondWith(
      caches.open(FOTOS).then(async (cache) => {
        const salvo = await cache.match(e.request);
        if (salvo) return salvo;
        const resp = await fetch(e.request);
        if (resp.ok || resp.type === 'opaque') cache.put(e.request, resp.clone());
        return resp;
      })
    );
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(redePrimeiro(e.request));
});
