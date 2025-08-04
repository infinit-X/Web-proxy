// Service Worker for Web Proxy
// This service worker intercepts all network requests and routes them through our proxy

const PROXY_BASE = '/api/proxy?url=';

// Install the service worker
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  // Skip waiting and activate immediately
  self.skipWaiting();
});

// Activate the service worker
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  // Claim all clients immediately
  event.waitUntil(self.clients.claim());
});

// Intercept fetch requests
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Only intercept requests that should go through the proxy
  if (shouldProxy(url)) {
    console.log('[Service Worker] Intercepting request:', request.url);
    
    // Route through our proxy
    const proxyUrl = new URL(PROXY_BASE + encodeURIComponent(request.url), self.location.origin);
    
    // Create new request with proxy URL
    const proxyRequest = new Request(proxyUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'X-Proxy-Origin': self.location.origin
      },
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      mode: 'cors',
      credentials: 'omit'
    });
    
    event.respondWith(fetch(proxyRequest));
  } else {
    // Let the request go through normally
    event.respondWith(fetch(request));
  }
});

// Determine if a URL should be proxied
function shouldProxy(url) {
  // Don't proxy requests to our own domain
  if (url.origin === self.location.origin) {
    return false;
  }
  
  // Don't proxy data URLs, blob URLs, etc.
  if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'javascript:') {
    return false;
  }
  
  // Don't proxy chrome-extension URLs
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return false;
  }
  
  // Proxy HTTP and HTTPS requests to external domains
  return url.protocol === 'http:' || url.protocol === 'https:';
}

// Handle messages from the main thread
self.addEventListener('message', event => {
  console.log('[Service Worker] Received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
