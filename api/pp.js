// ProxyProxy-style implementation with permalink and stable URLs
// File: /api/pp.js (ProxyProxy Pattern)

const axios = require('axios');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { __cpo: encodedUrl, ko } = req.query;
  
  if (!encodedUrl) {
    return res.status(400).json({
      error: 'Missing encoded URL parameter',
      message: 'Expected format: /api/pp?__cpo=BASE64_ENCODED_URL&ko=s',
      example: '/api/pp?__cpo=aHR0cHM6Ly93d3cuZ29vZ2xlLmNvbQ&ko=s'
    });
  }

  try {
    // Decode the base64 URL
    const targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
    
    console.log(`[PP-PROXY] Target URL: ${targetUrl}`);
    console.log(`[PP-PROXY] Method: ${req.method}`);

    // Handle POST requests (form submissions)
    let requestUrl = targetUrl;
    let requestData = null;

    if (req.method === 'POST') {
      // For POST requests, we might need to append form data to the URL or send as body
      if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
        // Read the POST body
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        await new Promise(resolve => req.on('end', resolve));
        const postData = Buffer.concat(chunks).toString();
        
        console.log(`[PP-PROXY] POST data: ${postData}`);
        
        // For search forms, append to URL as query parameters
        if (postData.includes('q=') || postData.includes('query=')) {
          const separator = targetUrl.includes('?') ? '&' : '?';
          requestUrl = `${targetUrl}${separator}${postData}`;
          console.log(`[PP-PROXY] Search request URL: ${requestUrl}`);
        } else {
          requestData = postData;
        }
      }
    }

    // Make the request
    const response = await axios({
      method: req.method === 'POST' && !requestData ? 'GET' : req.method,
      url: requestUrl,
      headers: {
        ...req.headers,
        host: new URL(targetUrl).host,
        'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        origin: new URL(targetUrl).origin,
        referer: targetUrl
      },
      data: requestData,
      responseType: 'stream',  
      validateStatus: () => true,
      timeout: 30000,
      maxRedirects: 5
    });

    // Handle redirects by updating the encoded URL
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      const redirectUrl = new URL(response.headers.location, targetUrl).href;
      const newEncodedUrl = Buffer.from(redirectUrl).toString('base64');
      const proxyOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const redirectProxyUrl = `${proxyOrigin}/api/pp?__cpo=${newEncodedUrl}&ko=s`;
      
      return res.redirect(302, redirectProxyUrl);
    }

    // Set response headers
    const responseHeaders = { ...response.headers };
    delete responseHeaders['content-encoding'];
    delete responseHeaders['content-length'];
    delete responseHeaders['transfer-encoding'];
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['content-security-policy'];

    const contentType = responseHeaders['content-type'] || '';

    if (contentType.includes('text/html')) {
      // Process HTML content
      const chunks = [];
      response.data.on('data', chunk => chunks.push(chunk));
      
      await new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });

      let htmlContent = Buffer.concat(chunks).toString('utf-8');
      
      // Rewrite HTML with ProxyProxy pattern
      htmlContent = rewriteHtmlProxyProxy(htmlContent, targetUrl, encodedUrl);

      res.writeHead(response.status, {
        ...responseHeaders,
        'Content-Type': 'text/html; charset=utf-8'
      });
      
      return res.end(htmlContent);
    } else {
      // Stream other content directly
      res.writeHead(response.status, responseHeaders);
      response.data.pipe(res);
    }

  } catch (error) {
    console.error('[PP-PROXY] Error:', error.message);
    res.status(500).json({
      error: 'Proxy request failed',
      message: error.message,
      encodedUrl: encodedUrl
    });
  }
};

function rewriteHtmlProxyProxy(html, targetUrl, encodedUrl) {
  const targetUrlObj = new URL(targetUrl);
  const proxyOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  
  // Remove existing base tags
  html = html.replace(/<base[^>]*>/gi, '');
  
  // Inject ProxyProxy-style base tag that maintains the same proxy URL
  const baseTag = `<base href="${proxyOrigin}/api/pp?__cpo=${encodedUrl}&ko=s" target="_self">`;
  
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n  ${baseTag}`);
  } else if (html.includes('<HEAD>')) {
    html = html.replace('<HEAD>', `<HEAD>\n  ${baseTag}`);
  } else {
    html = `${baseTag}\n${html}`;
  }

  console.log(`[PP-PROXY] Injected base tag: ${baseTag}`);

  // Rewrite absolute URLs to use new encoded format
  html = html.replace(/href=["']https?:\/\/([^"']+)["']/gi, (match, url) => {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const newEncodedUrl = Buffer.from(fullUrl).toString('base64');
    return `href="${proxyOrigin}/api/pp?__cpo=${newEncodedUrl}&ko=s"`;
  });

  html = html.replace(/src=["']https?:\/\/([^"']+)["']/gi, (match, url) => {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const newEncodedUrl = Buffer.from(fullUrl).toString('base64');
    return `src="${proxyOrigin}/api/pp?__cpo=${newEncodedUrl}&ko=s"`;
  });

  // Handle forms - keep them pointing to the same proxy URL but with POST method
  html = html.replace(/(<form[^>]*?)(?:\s+action\s*=\s*["']([^"']*)["'])?([^>]*>)/gi, (match, formStart, action, formEnd) => {
    // All forms should POST to the current proxy URL
    const currentProxyUrl = `${proxyOrigin}/api/pp?__cpo=${encodedUrl}&ko=s`;
    
    console.log(`[PP-PROXY] Form rewrite: "${action}" -> "${currentProxyUrl}"`);
    
    // Ensure form has POST method and points to proxy
    let attributes = formStart + formEnd;
    if (!attributes.includes('method=')) {
      attributes = attributes.replace('>', ' method="POST">');
    }
    attributes = attributes.replace(/action=["'][^"']*["']/, '');
    attributes = attributes.replace('>', ` action="${currentProxyUrl}">`);
    
    return attributes;
  });

  // Inject permalink bar and enhanced script
  const permalinkBar = createPermalinkBar(targetUrl);
  const script = generateProxyProxyScript(targetUrl, encodedUrl, proxyOrigin);
  
  // Inject permalink bar after body opening
  if (html.includes('<body>')) {
    html = html.replace('<body>', `<body>\n${permalinkBar}`);
  } else if (html.includes('<body ')) {
    html = html.replace(/(<body[^>]*>)/, `$1\n${permalinkBar}`);
  }
  
  // Inject script before body closing
  html = html.replace('</body>', `${script}\n</body>`);
  
  return html;
}

function createPermalinkBar(targetUrl) {
  return `
<div id="proxy-permalink-bar" style="
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 8px 15px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  z-index: 999999;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  border-bottom: 1px solid rgba(255,255,255,0.2);
">
  <div style="display: flex; align-items: center; gap: 10px;">
    <span style="opacity: 0.8;">🌐 Browsing:</span>
    <input type="text" id="proxy-address-bar" value="${targetUrl}" readonly 
           style="flex: 1; background: rgba(255,255,255,0.2); border: none; color: white; padding: 5px 10px; border-radius: 4px; font-size: 13px;"
           onclick="this.select()">
    <button onclick="copyPermalink()" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">
      📋 Copy
    </button>
  </div>
</div>
<style>
  body { margin-top: 50px !important; }
  #proxy-permalink-bar input::selection { background: rgba(255,255,255,0.3); }
</style>`;
}

function generateProxyProxyScript(targetUrl, encodedUrl, proxyOrigin) {
  return `
<script>
(function() {
  const TARGET_URL = '${targetUrl}';
  const ENCODED_URL = '${encodedUrl}';
  const PROXY_ORIGIN = '${proxyOrigin}';
  
  console.log('[PP-PROXY] Script initialized for:', TARGET_URL);
  
  // Copy permalink function
  window.copyPermalink = function() {
    const addressBar = document.getElementById('proxy-address-bar');
    addressBar.select();
    document.execCommand('copy');
    
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = '✅ Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  };
  
  // Update address bar on navigation (for AJAX sites)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // Extract new target URL if changed
      const urlParams = new URLSearchParams(window.location.search);
      const newEncodedUrl = urlParams.get('__cpo');
      if (newEncodedUrl && newEncodedUrl !== ENCODED_URL) {
        try {
          const newTargetUrl = atob(newEncodedUrl);
          document.getElementById('proxy-address-bar').value = newTargetUrl;
        } catch (e) {
          console.error('[PP-PROXY] Error decoding new URL:', e);
        }
      }
    }
  }, 1000);
  
  // Enhanced form handling
  document.addEventListener('submit', function(e) {
    if (e.target && e.target.tagName === 'FORM') {
      console.log('[PP-PROXY] Form submission intercepted');
      // Form will naturally POST to the proxy URL due to base tag and action rewriting
    }
  });
  
})();
</script>`;
}
