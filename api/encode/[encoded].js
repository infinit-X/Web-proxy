// Base64 URL Encoded Proxy - Simple and Effective
// File: /api/encode/[encoded].js
// This uses base64 encoded URLs to avoid query parameter issues

const axios = require('axios');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { encoded } = req.query;
  
  if (!encoded) {
    return res.status(400).json({
      error: 'Missing encoded URL',
      message: 'Please provide a base64 encoded URL'
    });
  }

  try {
    // Decode the base64 URL
    const targetUrl = Buffer.from(encoded, 'base64').toString('utf-8');
    
    console.log(`[ENCODED-PROXY] Request: ${req.method} ${targetUrl}`);

    // Make the request
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        ...req.headers,
        host: new URL(targetUrl).host,
        'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      data: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      responseType: 'stream',
      validateStatus: () => true,
      timeout: 30000,
      maxRedirects: 5
    });

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
      
      // Rewrite URLs to use encoded proxy
      htmlContent = rewriteHtmlForEncoded(htmlContent, targetUrl);

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
    console.error('[ENCODED-PROXY] Error:', error.message);
    res.status(500).json({
      error: 'Proxy request failed',
      message: error.message
    });
  }
};

function rewriteHtmlForEncoded(html, baseUrl) {
  const proxyOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  
  // Remove existing base tags
  html = html.replace(/<base[^>]*>/gi, '');
  
  // Inject our encoded proxy base tag
  const encodedBase = Buffer.from(new URL(baseUrl).origin + '/').toString('base64');
  const baseTag = `<base href="${proxyOrigin}/api/encode/${encodedBase}" target="_blank">`;
  
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n  ${baseTag}`);
  } else if (html.includes('<HEAD>')) {
    html = html.replace('<HEAD>', `<HEAD>\n  ${baseTag}`);
  } else {
    html = `${baseTag}\n${html}`;
  }

  // Rewrite absolute URLs
  html = html.replace(/href=["']https?:\/\/[^"']+["']/gi, (match) => {
    const url = match.slice(6, -1); // Remove href=" and "
    const encoded = Buffer.from(url).toString('base64');
    return `href="${proxyOrigin}/api/encode/${encoded}"`;
  });

  html = html.replace(/src=["']https?:\/\/[^"']+["']/gi, (match) => {
    const url = match.slice(5, -1); // Remove src=" and "
    const encoded = Buffer.from(url).toString('base64');
    return `src="${proxyOrigin}/api/encode/${encoded}"`;
  });

  html = html.replace(/action=["']https?:\/\/[^"']+["']/gi, (match) => {
    const url = match.slice(8, -1); // Remove action=" and "
    const encoded = Buffer.from(url).toString('base64');
    return `action="${proxyOrigin}/api/encode/${encoded}"`;
  });

  // Inject enhanced script for runtime URL handling
  const script = generateEncodedProxyScript(baseUrl, proxyOrigin);
  html = html.replace('</body>', `${script}\n</body>`);
  
  return html;
}

function generateEncodedProxyScript(baseUrl, proxyOrigin) {
  return `
<script>
(function() {
  const PROXY_ORIGIN = '${proxyOrigin}';
  const BASE_URL = '${baseUrl}';
  
  console.log('[ENCODED-PROXY] Initializing encoded proxy script');
  
  function encodeUrl(url) {
    if (!url || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#')) return url;
    
    try {
      let absoluteUrl;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        absoluteUrl = url;
      } else if (url.startsWith('//')) {
        absoluteUrl = new URL(BASE_URL).protocol + url;
      } else if (url.startsWith('/')) {
        absoluteUrl = new URL(BASE_URL).origin + url;
      } else {
        absoluteUrl = new URL(url, BASE_URL).href;
      }
      
      const encoded = btoa(absoluteUrl);
      return PROXY_ORIGIN + '/api/encode/' + encoded;
    } catch (e) {
      console.error('[ENCODED-PROXY] URL encoding error:', e);
      return url;
    }
  }
  
  // Override form submissions
  document.addEventListener('submit', function(e) {
    if (e.target && e.target.tagName === 'FORM') {
      const form = e.target;
      let action = form.getAttribute('action') || '';
      
      if (!action) {
        action = window.location.href;
      }
      
      if (!action.includes('/api/encode/')) {
        const newAction = encodeUrl(action);
        form.setAttribute('action', newAction);
        console.log('[ENCODED-PROXY] Form action encoded:', action, '->', newAction);
      }
    }
  });
  
  // Override link clicks
  document.addEventListener('click', function(e) {
    let link = e.target.closest && e.target.closest('a') || (e.target.tagName === 'A' ? e.target : null);
    
    if (link && link.href && !link.href.startsWith('#') && !link.href.includes('/api/encode/')) {
      e.preventDefault();
      const newHref = encodeUrl(link.getAttribute('href'));
      console.log('[ENCODED-PROXY] Link click encoded:', link.href, '->', newHref);
      
      if (link.target === '_blank' || e.ctrlKey || e.metaKey) {
        window.open(newHref, '_blank');
      } else {
        window.location.href = newHref;
      }
    }
  });
  
  // Override window.open
  const originalOpen = window.open;
  window.open = function(url, name, features) {
    if (url && !url.includes('/api/encode/')) {
      url = encodeUrl(url);
    }
    return originalOpen.call(this, url, name, features);
  };
  
})();
</script>`;
}
