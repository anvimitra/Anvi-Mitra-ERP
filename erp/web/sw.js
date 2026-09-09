const CACHE='anvi-mitra-erp-web-v1';
const SHELL=['/erp/web/login.html','/erp/web/portal-dashboard.html','/erp/web/api.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy));}return response}).catch(()=>caches.match(request).then(cached=>cached||new Response('Offline',{status:503,statusText:'Offline'}))));
});
