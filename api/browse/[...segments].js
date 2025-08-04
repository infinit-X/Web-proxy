// Path-Embedded Proxy - Following CGIProxy Pattern
// File: /api/browse/[...segments].js
// URL Structure: /api/browse/https/www.google.com/search?q=hello

const axios = require('axios');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { segments } = req.query;
  
  if (!segments || segments.length < 2) {
    return res.status(400).json({
      error: 'Invalid URL structure',
      message: 'Expected format: /api/browse/https/domain.com/path',
      example: '/api/browse/https/www.google.com/search'
    });
  }

  try {
    // Reconstruct the target URL from path segments
    const protocol = segments[0]; // 'https' or 'http'
    const domain = segments[1];   // 'www.google.com'
    const path = segments.slice(2).join('/'); // 'search' or 'search/more'
    
    // Add query parameters if they exist
    const queryString = req.url.includes('?') ? 
      req.url.split('?').slice(1).join('?').replace(/segments=[^&]*/g, '').replace(/^&/, '').replace(/&&/g, '&') : 
      '';
    
    const targetUrl = `${protocol}://${domain}${path ? '/' + path : ''}${queryString ? '?' + queryString : ''}`;
    
    console.log(`[PATH-PROXY] Reconstructed URL: ${targetUrl}`);

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
      
      // Rewrite URLs to use path-embedded structure
      htmlContent = rewriteHtmlForPathProxy(htmlContent, targetUrl);

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
    console.error('[PATH-PROXY] Error:', error.message);
    res.status(500).json({
      error: 'Proxy request failed',
      message: error.message
    });
  }
};

function rewriteHtmlForPathProxy(html, baseUrl) {
  const baseUrlObj = new URL(baseUrl);
  const proxyOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  
  // Remove existing base tags
  html = html.replace(/<base[^>]*>/gi, '');
  
  // Inject path-embedded base tag
  const baseProxyPath = `${proxyOrigin}/api/browse/${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}/`;
  const baseTag = `<base href="${baseProxyPath}" target="_blank">`;
  
  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n  ${baseTag}`);
  } else if (html.includes('<HEAD>')) {
    html = html.replace('<HEAD>', `<HEAD>\n  ${baseTag}`);
  } else {
    html = `${baseTag}\n${html}`;
  }

  console.log(`[PATH-PROXY] Injected base tag: ${baseTag}`);

  // Rewrite absolute URLs to path-embedded format
  html = html.replace(/href=["']https?:\/\/([^"'\/]+)(\/[^"']*)?["']/gi, (match, domain, path) => {
    const protocol = match.includes('https://') ? 'https' : 'http';
    const cleanPath = (path || '').replace(/^\//, '');
    return `href="${proxyOrigin}/api/browse/${protocol}/${domain}${cleanPath ? '/' + cleanPath : ''}"`;
  });

  html = html.replace(/src=["']https?:\/\/([^"'\/]+)(\/[^"']*)?["']/gi, (match, domain, path) => {
    const protocol = match.includes('https://') ? 'https' : 'http';
    const cleanPath = (path || '').replace(/^\//, '');
    return `src="${proxyOrigin}/api/browse/${protocol}/${domain}${cleanPath ? '/' + cleanPath : ''}"`;
  });

  html = html.replace(/action=["']https?:\/\/([^"'\/]+)(\/[^"']*)?["']/gi, (match, domain, path) => {
    const protocol = match.includes('https://') ? 'https' : 'http';
    const cleanPath = (path || '').replace(/^\//, '');
    return `action="${proxyOrigin}/api/browse/${protocol}/${domain}${cleanPath ? '/' + cleanPath : ''}"`;
  });

  // Handle relative URLs and forms without action
  html = html.replace(/(<form[^>]*?)(?:\s+action\s*=\s*["']([^"']*)["'])?([^>]*>)/gi, (match, formStart, action, formEnd) => {
    if (!action || action === '' || action === '#') {
      // Form submits to current page
      const currentPath = `${proxyOrigin}/api/browse/${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${baseUrlObj.pathname}`;
      return `${formStart} action="${currentPath}"${formEnd}`;
    } else if (action.startsWith('/')) {
      // Root-relative URL
      const currentPath = `${proxyOrigin}/api/browse/${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${action}`;
      return `${formStart} action="${currentPath}"${formEnd}`;
    }
    return match; // Keep absolute URLs as they are (already rewritten above)
  });

  // Inject enhanced script for runtime URL handling
  const script = generatePathProxyScript(baseUrl, proxyOrigin);
  html = html.replace('</body>', `${script}\n</body>`);
  
  return html;
}

function generatePathProxyScript(baseUrl, proxyOrigin) {
  const baseUrlObj = new URL(baseUrl);
  
  return `
<script>
(function() {
  const PROXY_ORIGIN = '${proxyOrigin}';
  const BASE_PROTOCOL = '${baseUrlObj.protocol.slice(0, -1)}';
  const BASE_HOST = '${baseUrlObj.host}';
  
  console.log('[PATH-PROXY] Enhanced script initialized');
  
  function convertToPathProxy(url) {
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
      
      return PROXY_ORIGIN + '/api/browse/' + protocol + '/' + host + 
             (pathname ? '/' + pathname : '') + search;
    } catch (e) {
      console.error('[PATH-PROXY] URL conversion error:', e);
      return url;
    }
  }
  
  // Override form submissions
  document.addEventListener('submit', function(e) {
    if (e.target && e.target.tagName === 'FORM') {
      const form = e.target;
      let action = form.getAttribute('action') || '';
      
      if (!action || action === '#') {
        action = window.location.pathname;
      }
      
      if (!action.includes('/api/browse/')) {
        const newAction = convertToPathProxy(action);
        form.setAttribute('action', newAction);
        console.log('[PATH-PROXY] Form action converted:', action, '->', newAction);
      }
    }
  });
  
  // Override link clicks
  document.addEventListener('click', function(e) {
    let link = e.target.closest && e.target.closest('a') || (e.target.tagName === 'A' ? e.target : null);
    
    if (link && link.href && !link.href.startsWith('#') && !link.href.includes('/api/browse/')) {
      e.preventDefault();
      const newHref = convertToPathProxy(link.getAttribute('href'));
      console.log('[PATH-PROXY] Link click converted:', link.href, '->', newHref);
      
      if (link.target === '_blank' || e.ctrlKey || e.metaKey) {
        window.open(newHref, '_blank');
      } else {
        window.location.href = newHref;
      }
    }
  });
  
})();
</script>`;
}
