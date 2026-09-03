// Instalação do robô de PWA
self.addEventListener('install', (e) => {
  console.log('[Service Worker] App CCO Sorocaba Instalado!');
  self.skipWaiting();
});

// Mantém a internet fluindo normalmente para a API
self.addEventListener('fetch', (e) => {
  // Em um PWA avançado, aqui faríamos o cache offline. 
  // Por agora, deixamos passar livre.
});