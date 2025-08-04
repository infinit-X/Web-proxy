// Simple Path-Based Proxy
// File: /api/browse.js
// URL Structure: /api/browse?p=https/www.google.com/search&q=hello

const axios = require('axios');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { p: pathParam } = req.query;
  
  if (!pathParam) {
    return res.status(400).json({
      error: 'Missing path parameter',
      message: 'Expected format: /api/browse?p=https/domain.com/path',
      example: '/api/browse?p=https/www.google.com/search'
    });
  }

  try {
    // Parse the path parameter: "https/www.google.com/search"
    const parts = pathParam.split('/');
    if (parts.length < 2) {
      throw new Error('Invalid path format');
    }
    
    const protocol = parts[0]; // 'https'
    const domain = parts[1];   // 'www.google.com'
    const path = parts.slice(2).join('/'); // 'search'
    
    // Build query string excluding the 'p' parameter
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'p') {
        queryParams.append(key, value);
      }
    }
    const queryString = queryParams.toString();
    
    const targetUrl = `${protocol}://${domain}${path ? '/' + path : ''}${queryString ? '?' + queryString : ''}`;
    
    console.log(`[BROWSE-PROXY] Target URL: ${targetUrl}`);

    // Make the request
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        ...req.headers,
        host: domain,
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
      
      // Rewrite URLs to use browse proxy
      htmlContent = rewriteHtmlForBrowseProxy(htmlContent, targetUrl);

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
    console.error('[BROWSE-PROXY] Error:', error.message);
    res.status(500).json({
      error: 'Proxy request failed',
      message: error.message,
      pathParam: pathParam
    });
  }
};

function rewriteHtmlForBrowseProxy(html, baseUrl) {
  const baseUrlObj = new URL(baseUrl);
  const proxyOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  
  // Remove existing base tags
  html = html.replace(/<base[^>]*>/gi, '');
  
  // Create base tag that points to our browse proxy
  const baseProxyPath = `${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}/`;
  const baseTag = `<base href="${baseProxyPath}" target="_blank">`;
  
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n  ${baseTag}`);
  } else if (html.includes('<HEAD>')) {
    html = html.replace('<HEAD>', `<HEAD>\n  ${baseTag}`);
  } else {
    html = `${baseTag}\n${html}`;
  }

  console.log(`[BROWSE-PROXY] Injected base tag: ${baseTag}`);

  // Rewrite absolute URLs
  html = html.replace(/href=["']https?:\/\/([^"'\/]+)(\/[^"']*)?["']/gi, (match, domain, path) => {
    const protocol = match.includes('https://') ? 'https' : 'http';
    const cleanPath = (path || '').replace(/^\//, '');
    return `href="${proxyOrigin}/api/browse?p=${protocol}/${domain}${cleanPath ? '/' + cleanPath : ''}"`;
  });

  html = html.replace(/src=["']https?:\/\/([^"'\/]+)(\/[^"']*)?["']/gi, (match, domain, path) => {
    const protocol = match.includes('https://') ? 'https' : 'http';
    const cleanPath = (path || '').replace(/^\//, '');
    return `src="${proxyOrigin}/api/browse?p=${protocol}/${domain}${cleanPath ? '/' + cleanPath : ''}"`;
  });

  // Handle forms - this is the key fix for search forms
  html = html.replace(/(<form[^>]*?)(?:\s+action\s*=\s*["']([^"']*)["'])?([^>]*>)/gi, (match, formStart, action, formEnd) => {
    let targetAction;
    
    if (!action || action === '' || action === '#') {
      // Form submits to current page
      targetAction = `${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${baseUrlObj.pathname.replace(/^\//, '') ? '/' + baseUrlObj.pathname.replace(/^\//, '') : ''}`;
    } else if (action.startsWith('/')) {
      // Root-relative URL
      targetAction = `${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${action.replace(/^\//, '') ? '/' + action.replace(/^\//, '') : ''}`;
    } else if (action.startsWith('http')) {
      // Already absolute, will be handled by the regex above
      return match;
    } else {
      // Relative URL
      const currentPath = baseUrlObj.pathname.split('/').slice(0, -1).join('/');
      targetAction = `${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${currentPath ? currentPath : ''}/${action}`;
    }
    
    console.log(`[BROWSE-PROXY] Form action rewrite: "${action}" -> "${targetAction}"`);
    return `${formStart} action="${targetAction}"${formEnd}`;
  });

  // Inject enhanced script for runtime URL handling
  const script = generateBrowseProxyScript(baseUrl, proxyOrigin);
  html = html.replace('</body>', `${script}\n</body>`);
  
  return html;
}

function generateBrowseProxyScript(baseUrl, proxyOrigin) {
  const baseUrlObj = new URL(baseUrl);
  
  return `
<script>
(function() {
  const PROXY_ORIGIN = '${proxyOrigin}';
  const BASE_PROTOCOL = '${baseUrlObj.protocol.slice(0, -1)}';
  const BASE_HOST = '${baseUrlObj.host}';
  
  console.log('[BROWSE-PROXY] Script initialized for:', BASE_PROTOCOL + '://' + BASE_HOST);
  
  function convertToBrowseProxy(url) {
    if (!url || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('data:')) {
      return url;
    }
    
    try {
      let absoluteUrl;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        absoluteUrl = new URL(url);
      } else if (url.startsWith('//')) {
        absoluteUrl = new URL(BASE_PROTOCOL + ':' + url);
      } else if (url.startsWith('/')) {
        absoluteUrl = new URL(BASE_PROTOCOL + '://' + BASE_HOST + url);
      } else {
        absoluteUrl = new URL(url, BASE_PROTOCOL + '://' + BASE_HOST + '/');
      }
      
      const protocol = absoluteUrl.protocol.slice(0, -1);
      const host = absoluteUrl.host;
      const pathname = absoluteUrl.pathname.replace(/^\//, '');
      const search = absoluteUrl.search;
      
      return PROXY_ORIGIN + '/api/browse?p=' + protocol + '/' + host + 
             (pathname ? '/' + pathname : '') + search;
    } catch (e) {
      console.error('[BROWSE-PROXY] URL conversion error:', e);
      return url;
    }
  }
  
  // Override form submissions
  document.addEventListener('submit', function(e) {
    if (e.target && e.target.tagName === 'FORM') {
      const form = e.target;
      let action = form.getAttribute('action') || '';
      
      if (!action || action === '#') {
        action = window.location.pathname + window.location.search;
      }
      
      if (!action.includes('/api/browse')) {
        const newAction = convertToBrowseProxy(action);
        form.setAttribute('action', newAction);
        console.log('[BROWSE-PROXY] Form action converted:', action, '->', newAction);
      }
    }
  });
  
})();
</script>`;
}
