// Enhanced Vercel Serverless Function for Web Proxy
// File: /api/proxy.js

const axios = require('axios');
const { URL } = require('url');

// Main serverless function handler
module.exports = async (req, res) => {
  // Set CORS headers to allow requests from our frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Proxy-Origin');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = req.query.url;
  const proxyOrigin = req.headers['x-proxy-origin'] || 
                     req.headers.origin || 
                     req.headers.referer?.split('/api/proxy')[0] ||
                     `https://${req.headers.host}` || '';

  console.log(`[PROXY] Request: ${req.method} ${req.url}`);
  console.log(`[PROXY] Target URL: ${targetUrl}`);
  console.log(`[PROXY] Proxy Origin: ${proxyOrigin}`);
  console.log(`[PROXY] Headers:`, JSON.stringify(req.headers, null, 2));

  // Validate the URL parameter
  if (!targetUrl) {
    console.error('[PROXY] Missing URL parameter');
    return res.status(400).json({
      error: 'Missing URL parameter',
      message: 'Please provide a URL to proxy in the ?url= parameter',
      receivedQuery: req.query,
      requestUrl: req.url
    });
  }

  try {
    // Validate and normalize URL format
    let normalizedUrl = targetUrl;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + targetUrl;
    }
    
    const urlObj = new URL(normalizedUrl);
    
    // Security check: prevent accessing internal/local networks
    const hostname = urlObj.hostname.toLowerCase();
    const forbiddenHosts = [
      'localhost', '127.0.0.1', '0.0.0.0', '::1',
      '10.', '172.', '192.168.', 'internal', 'local'
    ];
    
    if (forbiddenHosts.some(host => hostname.includes(host))) {
      return res.status(403).json({
        error: 'Forbidden URL',
        message: 'Cannot proxy requests to internal/local addresses'
      });
    }

    console.log(`[PROXY] Fetching: ${normalizedUrl}`);

    // Configure the request with appropriate headers
    const requestConfig = {
      method: req.method || 'GET',
      url: normalizedUrl,
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Accept 4xx errors
      // Don't set responseType to 'stream' by default - let axios handle it
      headers: {
        // Mimic a real browser to avoid blocking
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': req.headers.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Upgrade-Insecure-Requests': '1',
        'Referer': urlObj.origin
      }
    };

    // Forward POST/PUT data if present
    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
      requestConfig.data = req.body;
      requestConfig.headers['Content-Type'] = req.headers['content-type'] || 'application/x-www-form-urlencoded';
    }

    // Make the request to the target URL
    const response = await axios(requestConfig);

    // Get response headers and content type
    const responseHeaders = { ...response.headers };
    const contentType = responseHeaders['content-type'] || '';
    
    // Remove headers that might cause issues in iframe context
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['content-security-policy-report-only'];
    delete responseHeaders['strict-transport-security'];
    delete responseHeaders['x-content-type-options'];
    
    // Set proper CORS headers
    responseHeaders['Access-Control-Allow-Origin'] = '*';
    responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, HEAD, PUT, DELETE';
    responseHeaders['X-Frame-Options'] = 'ALLOWALL';

    // Handle different content types
    if (contentType.includes('text/html')) {
      // For HTML content, we need to rewrite URLs to go through our proxy
      let htmlContent;
      
      // Handle both string and buffer responses
      if (typeof response.data === 'string') {
        htmlContent = response.data;
      } else if (Buffer.isBuffer(response.data)) {
        htmlContent = response.data.toString('utf8');
      } else {
        // For streamed responses, we need to collect the data
        const chunks = [];
        response.data.on('data', chunk => chunks.push(chunk));
        await new Promise((resolve, reject) => {
          response.data.on('end', () => resolve());
          response.data.on('error', reject);
        });
        htmlContent = Buffer.concat(chunks).toString('utf8');
      }
      
      // Get the base URL for relative link resolution
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      
      // URL rewriting patterns
      htmlContent = rewriteHtmlUrls(htmlContent, baseUrl, proxyOrigin);
      
      // Inject our proxy persistence script
      const proxyScript = generateProxyScript(baseUrl, proxyOrigin);
      htmlContent = injectProxyScript(htmlContent, proxyScript);
      
      // Set response headers for HTML
      res.writeHead(response.status, {
        ...responseHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(htmlContent, 'utf8')
      });
      
      return res.end(htmlContent);
      
    } else if (contentType.includes('text/css')) {
      // For CSS content, rewrite URL references
      let cssContent;
      
      if (typeof response.data === 'string') {
        cssContent = response.data;
      } else if (Buffer.isBuffer(response.data)) {
        cssContent = response.data.toString('utf8');
      } else {
        // For streamed responses, collect the data
        const chunks = [];
        response.data.on('data', chunk => chunks.push(chunk));
        await new Promise((resolve, reject) => {
          response.data.on('end', () => resolve());
          response.data.on('error', reject);
        });
        cssContent = Buffer.concat(chunks).toString('utf8');
      }
      
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      cssContent = rewriteCssUrls(cssContent, baseUrl, proxyOrigin);
      
      res.writeHead(response.status, {
        ...responseHeaders,
        'Content-Type': 'text/css; charset=utf-8',
        'Content-Length': Buffer.byteLength(cssContent, 'utf8')
      });
      
      return res.end(cssContent);
      
    } else {
      // For other content types (images, JS, etc.), stream directly
      res.writeHead(response.status, responseHeaders);
      
      if (response.data && typeof response.data.pipe === 'function') {
        // Stream the response
        response.data.pipe(res);
      } else {
        // Send the data directly
        res.end(response.data);
      }
    }

  } catch (error) {
    console.error('[PROXY] Error:', error.message);
    
    // Handle different types of errors
    if (error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      
      return res.status(status).json({
        error: `HTTP ${status}`,
        message: `Target server responded with: ${status} ${statusText}`,
        url: targetUrl
      });
      
    } else if (error.code === 'ENOTFOUND') {
      return res.status(404).json({
        error: 'Domain not found',
        message: 'The requested domain could not be found. Please check the URL.',
        url: targetUrl
      });
      
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return res.status(408).json({
        error: 'Request timeout',
        message: 'The request took too long to complete.',
        url: targetUrl
      });
      
    } else {
      return res.status(500).json({
        error: 'Proxy error',
        message: `Failed to fetch the URL: ${error.message}`,
        url: targetUrl
      });
    }
  }
};

// Function to rewrite URLs in HTML content
function rewriteHtmlUrls(html, baseUrl, proxyOrigin) {
  const baseUrlObj = new URL(baseUrl);
  
  // Rewrite different types of URLs with more comprehensive patterns
  html = html.replace(/href\s*=\s*["']([^"']+)["']/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `href="${rewrittenUrl}"`;
  });
  
  html = html.replace(/src\s*=\s*["']([^"']+)["']/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `src="${rewrittenUrl}"`;
  });
  
  html = html.replace(/action\s*=\s*["']([^"']+)["']/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `action="${rewrittenUrl}"`;
  });
  
  // Rewrite CSS @import and url() references
  html = html.replace(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `url("${rewrittenUrl}")`;
  });
  
  // Rewrite @import statements
  html = html.replace(/@import\s+["']([^"']+)["']/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `@import "${rewrittenUrl}"`;
  });
  
  // Rewrite meta refresh URLs
  html = html.replace(/content\s*=\s*["'][^"']*url\s*=\s*([^"';]+)[^"']*["']/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url.trim(), baseUrl, proxyOrigin);
    return match.replace(url, rewrittenUrl);
  });
  
  return html;
}

// Function to rewrite URLs in CSS content
function rewriteCssUrls(css, baseUrl, proxyOrigin) {
  return css.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `url("${rewrittenUrl}")`;
  });
}

// Function to rewrite a single URL
function rewriteUrl(url, baseUrl, proxyOrigin) {
  try {
    // Skip data URLs, javascript URLs, and empty URLs
    if (!url || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('#')) {
      return url;
    }
    
    let absoluteUrl;
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // Already absolute URL
      absoluteUrl = url;
    } else if (url.startsWith('//')) {
      // Protocol-relative URL
      const baseUrlObj = new URL(baseUrl);
      absoluteUrl = `${baseUrlObj.protocol}${url}`;
    } else {
      // Relative URL - resolve against base URL
      absoluteUrl = new URL(url, baseUrl).href;
    }
    
    // Return the proxy URL
    return `${proxyOrigin}/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
    
  } catch (error) {
    console.error('[URL_REWRITE] Error rewriting URL:', url, error.message);
    return url; // Return original URL if rewriting fails
  }
}

// Function to generate the proxy persistence script
function generateProxyScript(baseUrl, proxyOrigin) {
  return `
    <script>
      (function() {
        const PROXY_ORIGIN = '${proxyOrigin}';
        const BASE_URL = '${baseUrl}';
        const PROXY_ENDPOINT = '/api/proxy';
        
        console.log('[PROXY] Initializing proxy persistence script');
        console.log('[PROXY] Base URL:', BASE_URL);
        console.log('[PROXY] Proxy Origin:', PROXY_ORIGIN);
        
        function rewriteProxyUrl(url) {
          try {
            if (!url || typeof url !== 'string') return url;
            
            // Skip certain URLs
            if (url.startsWith('data:') || 
                url.startsWith('javascript:') || 
                url.startsWith('mailto:') || 
                url.startsWith('tel:') || 
                url.startsWith('#') ||
                url.startsWith('blob:')) {
              return url;
            }
            
            // Skip if already proxied
            if (url.includes(PROXY_ENDPOINT)) {
              return url;
            }
            
            let absoluteUrl;
            
            if (url.startsWith('http://') || url.startsWith('https://')) {
              // Already absolute URL
              absoluteUrl = url;
            } else if (url.startsWith('//')) {
              // Protocol-relative URL
              const baseUrlObj = new URL(BASE_URL);
              absoluteUrl = baseUrlObj.protocol + url;
            } else if (url.startsWith('/')) {
              // Root-relative URL
              const baseUrlObj = new URL(BASE_URL);
              absoluteUrl = baseUrlObj.origin + url;
            } else {
              // Relative URL - resolve against current page URL or base URL
              const currentUrl = window.location.href.includes(PROXY_ENDPOINT) ? 
                decodeURIComponent(window.location.href.split('url=')[1] || BASE_URL) : BASE_URL;
              absoluteUrl = new URL(url, currentUrl).href;
            }
            
            const proxyUrl = PROXY_ORIGIN + PROXY_ENDPOINT + '?url=' + encodeURIComponent(absoluteUrl);
            console.log('[PROXY] Rewriting URL:', url, '->', proxyUrl);
            return proxyUrl;
            
          } catch (error) {
            console.error('[PROXY] URL rewrite error:', error, 'Original URL:', url);
            return url;
          }
        }
        
        // Override form submissions
        document.addEventListener('submit', function(e) {
          try {
            if (e.target && e.target.tagName === 'FORM') {
              const form = e.target;
              const action = form.getAttribute('action');
              if (action) {
                const newAction = rewriteProxyUrl(action);
                form.setAttribute('action', newAction);
                console.log('[PROXY] Form action rewritten:', action, '->', newAction);
              }
            }
          } catch (error) {
            console.error('[PROXY] Form submit error:', error);
          }
        });
        
        // Override link clicks with better handling
        document.addEventListener('click', function(e) {
          try {
            let link = null;
            
            // Find the link element (could be nested)
            if (e.target.tagName === 'A') {
              link = e.target;
            } else if (e.target.closest && e.target.closest('a')) {
              link = e.target.closest('a');
            }
            
            if (link) {
              const href = link.getAttribute('href');
              if (href && 
                  !href.startsWith('#') && 
                  !href.startsWith('javascript:') && 
                  !href.startsWith('mailto:') &&
                  !href.startsWith('tel:')) {
                
                e.preventDefault();
                const newHref = rewriteProxyUrl(href);
                console.log('[PROXY] Link click intercepted:', href, '->', newHref);
                
                // Check if it should open in new tab
                if (link.target === '_blank' || e.ctrlKey || e.metaKey || e.button === 1) {
                  window.open(newHref, '_blank');
                } else {
                  window.location.href = newHref;
                }
              }
            }
          } catch (error) {
            console.error('[PROXY] Link click error:', error);
          }
        });
        
        // Override window.open
        const originalOpen = window.open;
        window.open = function(url, name, features) {
          if (url) {
            url = rewriteProxyUrl(url);
            console.log('[PROXY] window.open intercepted:', url);
          }
          return originalOpen.call(this, url, name, features);
        };
        
        // Override location changes
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(state, title, url) {
          if (url) {
            url = rewriteProxyUrl(url);
            console.log('[PROXY] pushState intercepted:', url);
          }
          return originalPushState.call(this, state, title, url);
        };
        
        history.replaceState = function(state, title, url) {
          if (url) {
            url = rewriteProxyUrl(url);
            console.log('[PROXY] replaceState intercepted:', url);
          }
          return originalReplaceState.call(this, state, title, url);
        };
        
        // Override fetch API
        const originalFetch = window.fetch;
        window.fetch = function(resource, options) {
          if (typeof resource === 'string') {
            resource = rewriteProxyUrl(resource);
            console.log('[PROXY] fetch intercepted:', resource);
          } else if (resource && resource.url) {
            resource.url = rewriteProxyUrl(resource.url);
            console.log('[PROXY] fetch Request intercepted:', resource.url);
          }
          return originalFetch.call(this, resource, options);
        };
        
        // Override XMLHttpRequest
        const originalXMLHttpRequest = window.XMLHttpRequest;
        window.XMLHttpRequest = function() {
          const xhr = new originalXMLHttpRequest();
          const originalOpen = xhr.open;
          
          xhr.open = function(method, url, async, user, password) {
            if (url) {
              url = rewriteProxyUrl(url);
              console.log('[PROXY] XMLHttpRequest intercepted:', url);
            }
            return originalOpen.call(this, method, url, async, user, password);
          };
          
          return xhr;
        };
        
        // Fix elements that might have been missed in server-side rewriting
        function fixMissedUrls() {
          try {
            // Fix images
            document.querySelectorAll('img[src]').forEach(function(img) {
              const src = img.getAttribute('src');
              if (src && !src.includes(PROXY_ENDPOINT) && !src.startsWith('data:')) {
                const newSrc = rewriteProxyUrl(src);
                if (newSrc !== src) {
                  img.setAttribute('src', newSrc);
                  console.log('[PROXY] Fixed img src:', src, '->', newSrc);
                }
              }
            });
            
            // Fix links
            document.querySelectorAll('a[href]').forEach(function(link) {
              const href = link.getAttribute('href');
              if (href && !href.includes(PROXY_ENDPOINT) && !href.startsWith('#') && !href.startsWith('javascript:')) {
                const newHref = rewriteProxyUrl(href);
                if (newHref !== href) {
                  link.setAttribute('href', newHref);
                  console.log('[PROXY] Fixed link href:', href, '->', newHref);
                }
              }
            });
            
            // Fix stylesheets
            document.querySelectorAll('link[rel="stylesheet"][href]').forEach(function(link) {
              const href = link.getAttribute('href');
              if (href && !href.includes(PROXY_ENDPOINT)) {
                const newHref = rewriteProxyUrl(href);
                if (newHref !== href) {
                  link.setAttribute('href', newHref);
                  console.log('[PROXY] Fixed stylesheet href:', href, '->', newHref);
                }
              }
            });
            
            // Fix scripts
            document.querySelectorAll('script[src]').forEach(function(script) {
              const src = script.getAttribute('src');
              if (src && !src.includes(PROXY_ENDPOINT)) {
                const newSrc = rewriteProxyUrl(src);
                if (newSrc !== src) {
                  script.setAttribute('src', newSrc);
                  console.log('[PROXY] Fixed script src:', src, '->', newSrc);
                }
              }
            });
            
            // Fix forms
            document.querySelectorAll('form[action]').forEach(function(form) {
              const action = form.getAttribute('action');
              if (action && !action.includes(PROXY_ENDPOINT)) {
                const newAction = rewriteProxyUrl(action);
                if (newAction !== action) {
                  form.setAttribute('action', newAction);
                  console.log('[PROXY] Fixed form action:', action, '->', newAction);
                }
              }
            });
            
          } catch (error) {
            console.error('[PROXY] Error fixing missed URLs:', error);
          }
        }
        
        // Run fixes when DOM is ready and periodically for dynamic content
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', fixMissedUrls);
        } else {
          fixMissedUrls();
        }
        
        // Fix URLs periodically for dynamic content
        setInterval(fixMissedUrls, 2000);
        
        // Also fix on mutations for SPAs
        if (window.MutationObserver) {
          const observer = new MutationObserver(function(mutations) {
            let shouldFix = false;
            mutations.forEach(function(mutation) {
              if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                shouldFix = true;
              }
            });
            if (shouldFix) {
              setTimeout(fixMissedUrls, 100);
            }
          });
          
          observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
          });
        }
        
        // Add debug function to window for troubleshooting
        window.proxyDebug = function() {
          console.log('[PROXY DEBUG] Current URL:', window.location.href);
          console.log('[PROXY DEBUG] Base URL:', BASE_URL);
          console.log('[PROXY DEBUG] Proxy Origin:', PROXY_ORIGIN);
          console.log('[PROXY DEBUG] Links found:', document.querySelectorAll('a[href]').length);
          console.log('[PROXY DEBUG] Images found:', document.querySelectorAll('img[src]').length);
          console.log('[PROXY DEBUG] Forms found:', document.querySelectorAll('form').length);
          
          // Test URL rewriting
          const testUrls = ['/test', './test', '../test', 'https://example.com'];
          testUrls.forEach(url => {
            console.log('[PROXY DEBUG] Test rewrite:', url, '->', rewriteProxyUrl(url));
          });
        };
        
        console.log('[PROXY] Proxy persistence script initialized successfully');
        console.log('[PROXY] Type proxyDebug() in console for debugging info');
      })();
    </script>
  `;
}

// Function to inject the proxy script into HTML
function injectProxyScript(html, script) {
  // Try to inject before closing </head> tag
  if (html.includes('</head>')) {
    return html.replace('</head>', script + '</head>');
  }
  // If no head tag, inject before closing </body> tag
  else if (html.includes('</body>')) {
    return html.replace('</body>', script + '</body>');
  }
  // If no body tag, append to end
  else {
    return html + script;
  }
}
