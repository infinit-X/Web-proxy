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
  const proxyOrigin = req.headers['x-proxy-origin'] || req.headers.origin || '';

  // Validate the URL parameter
  if (!targetUrl) {
    return res.status(400).json({
      error: 'Missing URL parameter',
      message: 'Please provide a URL to proxy in the ?url= parameter'
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
      let htmlContent = response.data;
      
      // Get the base URL for relative link resolution
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      const currentUrl = normalizedUrl;
      
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
      let cssContent = response.data;
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      cssContent = rewriteCssUrls(cssContent, baseUrl, proxyOrigin);
      
      res.writeHead(response.status, {
        ...responseHeaders,
        'Content-Type': 'text/css',
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
  
  // Rewrite different types of URLs
  html = html.replace(/href=["']([^"']+)["']/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `href="${rewrittenUrl}"`;
  });
  
  html = html.replace(/src=["']([^"']+)["']/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `src="${rewrittenUrl}"`;
  });
  
  html = html.replace(/action=["']([^"']+)["']/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `action="${rewrittenUrl}"`;
  });
  
  // Rewrite CSS @import and url() references
  html = html.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
    const rewrittenUrl = rewriteUrl(url, baseUrl, proxyOrigin);
    return `url("${rewrittenUrl}")`;
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
        
        // Override form submissions
        document.addEventListener('submit', function(e) {
          if (e.target.tagName === 'FORM') {
            const form = e.target;
            const action = form.getAttribute('action');
            if (action) {
              const newAction = rewriteProxyUrl(action);
              form.setAttribute('action', newAction);
            }
          }
        });
        
        // Override link clicks
        document.addEventListener('click', function(e) {
          if (e.target.tagName === 'A' || e.target.closest('a')) {
            const link = e.target.tagName === 'A' ? e.target : e.target.closest('a');
            const href = link.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
              e.preventDefault();
              const newHref = rewriteProxyUrl(href);
              window.location.href = newHref;
            }
          }
        });
        
        // Override window.open
        const originalOpen = window.open;
        window.open = function(url, name, features) {
          if (url) {
            url = rewriteProxyUrl(url);
          }
          return originalOpen.call(this, url, name, features);
        };
        
        // Override location changes
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(state, title, url) {
          if (url) {
            url = rewriteProxyUrl(url);
          }
          return originalPushState.call(this, state, title, url);
        };
        
        history.replaceState = function(state, title, url) {
          if (url) {
            url = rewriteProxyUrl(url);
          }
          return originalReplaceState.call(this, state, title, url);
        };
        
        function rewriteProxyUrl(url) {
          try {
            if (!url || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('mailto:') || url.startsWith('#')) {
              return url;
            }
            
            let absoluteUrl;
            if (url.startsWith('http://') || url.startsWith('https://')) {
              absoluteUrl = url;
            } else if (url.startsWith('//')) {
              absoluteUrl = location.protocol + url;
            } else {
              absoluteUrl = new URL(url, BASE_URL).href;
            }
            
            return PROXY_ORIGIN + '/api/proxy?url=' + encodeURIComponent(absoluteUrl);
          } catch (error) {
            console.error('Proxy URL rewrite error:', error);
            return url;
          }
        }
        
        // Fix relative URLs that might have been missed
        setTimeout(function() {
          document.querySelectorAll('img[src], link[href], script[src]').forEach(function(el) {
            const attr = el.tagName === 'IMG' || el.tagName === 'SCRIPT' ? 'src' : 'href';
            const url = el.getAttribute(attr);
            if (url && !url.startsWith(PROXY_ORIGIN) && !url.startsWith('data:') && !url.startsWith('javascript:')) {
              el.setAttribute(attr, rewriteProxyUrl(url));
            }
          });
        }, 100);
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
