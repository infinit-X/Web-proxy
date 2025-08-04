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
    console.error('[BROWSE-PROXY] Missing path parameter');
    console.error('[BROWSE-PROXY] Query params:', req.query);
    console.error('[BROWSE-PROXY] Request URL:', req.url);
    
    // Check if this is a misdirected form submission
    if (Object.keys(req.query).length > 0) {
      const referer = req.headers.referer;
      if (referer && referer.includes('/api/browse?p=')) {
        try {
          // Extract the p parameter from referer
          const refererUrl = new URL(referer);
          const refererPParam = refererUrl.searchParams.get('p');
          
          if (refererPParam) {
            // Reconstruct the request with the p parameter from referer
            console.log('[BROWSE-PROXY] Reconstructing request from referer:', refererPParam);
            
            // Parse the referer p parameter to get the base URL
            const parts = refererPParam.split('/');
            if (parts.length >= 2) {
              const protocol = parts[0];
              const domain = parts[1];
              
              // Build new p parameter for search request
              const searchPath = req.url.includes('/search') ? 'search' : '';
              const newPParam = `${protocol}/${domain}${searchPath ? '/' + searchPath : ''}`;
              
              // Redirect to correct URL
              const queryString = new URLSearchParams(req.query).toString();
              const redirectUrl = `/api/browse?p=${newPParam}&${queryString}`;
              
              console.log('[BROWSE-PROXY] Redirecting to:', redirectUrl);
              return res.redirect(302, redirectUrl);
            }
          }
        } catch (error) {
          console.error('[BROWSE-PROXY] Error reconstructing from referer:', error);
        }
      }
    }
    
    return res.status(400).json({
      error: 'Missing path parameter',
      message: 'Expected format: /api/browse?p=https/domain.com/path',
      example: '/api/browse?p=https/www.google.com/search',
      receivedQuery: req.query,
      requestUrl: req.url
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
  const currentPath = baseUrlObj.pathname === '/' ? '' : baseUrlObj.pathname.replace(/^\//, '');
  const baseProxyPath = `${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${currentPath ? '/' + currentPath : ''}`;
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

  // Rewrite root-relative URLs (starting with /)
  html = html.replace(/href=["']\/(?!api\/browse)([^"']*)["']/gi, (match, path) => {
    const cleanPath = path.replace(/^\//, '');
    return `href="${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${cleanPath ? '/' + cleanPath : ''}"`;
  });

  html = html.replace(/src=["']\/(?!api\/browse)([^"']*)["']/gi, (match, path) => {
    const cleanPath = path.replace(/^\//, '');
    return `src="${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${cleanPath ? '/' + cleanPath : ''}"`;
  });

  // Rewrite relative URLs (that don't start with / or http)
  html = html.replace(/href=["'](?!https?:\/\/|\/|#|javascript:|mailto:)([^"']*)["']/gi, (match, path) => {
    try {
      const resolvedUrl = new URL(path, baseUrl);
      const resolvedPath = resolvedUrl.pathname === '/' ? '' : resolvedUrl.pathname.replace(/^\//, '');
      return `href="${proxyOrigin}/api/browse?p=${resolvedUrl.protocol.slice(0, -1)}/${resolvedUrl.host}${resolvedPath ? '/' + resolvedPath : ''}"`;
    } catch (e) {
      return match;
    }
  });

  html = html.replace(/src=["'](?!https?:\/\/|\/|data:|javascript:)([^"']*)["']/gi, (match, path) => {
    try {
      const resolvedUrl = new URL(path, baseUrl);
      const resolvedPath = resolvedUrl.pathname === '/' ? '' : resolvedUrl.pathname.replace(/^\//, '');
      return `src="${proxyOrigin}/api/browse?p=${resolvedUrl.protocol.slice(0, -1)}/${resolvedUrl.host}${resolvedPath ? '/' + resolvedPath : ''}"`;
    } catch (e) {
      return match;
    }
  });

  // Handle forms - CRITICAL FIX for search forms
  html = html.replace(/(<form[^>]*?)(?:\s+action\s*=\s*["']([^"']*)["'])?([^>]*>)/gi, (match, formStart, action, formEnd) => {
    let targetAction;
    
    if (!action || action === '' || action === '#') {
      // Form submits to current page - preserve the full path including query parameters
      const currentUrl = new URL(baseUrl);
      const currentPath = currentUrl.pathname === '/' ? '' : currentUrl.pathname.replace(/^\//, '');
      
      // For search pages, we need to make sure the form posts to the search endpoint
      if (currentUrl.pathname.includes('/search') || currentPath.includes('search')) {
        targetAction = `${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}/search`;  
      } else {
        targetAction = `${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${currentPath ? '/' + currentPath : ''}`;
      }
    } else if (action.startsWith('/')) {
      // Root-relative URL
      const cleanAction = action.replace(/^\//, '');
      targetAction = `${proxyOrigin}/api/browse?p=${baseUrlObj.protocol.slice(0, -1)}/${baseUrlObj.host}${cleanAction ? '/' + cleanAction : ''}`;
    } else if (action.startsWith('http')) {
      // Already absolute - convert to browse format
      try {
        const actionUrl = new URL(action);
        const actionPath = actionUrl.pathname === '/' ? '' : actionUrl.pathname.replace(/^\//, '');
        targetAction = `${proxyOrigin}/api/browse?p=${actionUrl.protocol.slice(0, -1)}/${actionUrl.host}${actionPath ? '/' + actionPath : ''}`;
      } catch (e) {
        return match;
      }
    } else {
      // Relative URL - resolve against current page
      try {
        const resolvedUrl = new URL(action, baseUrl);
        const resolvedPath = resolvedUrl.pathname === '/' ? '' : resolvedUrl.pathname.replace(/^\//, '');
        targetAction = `${proxyOrigin}/api/browse?p=${resolvedUrl.protocol.slice(0, -1)}/${resolvedUrl.host}${resolvedPath ? '/' + resolvedPath : ''}`;
      } catch (e) {
        return match;
      }
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
      
      console.log('[BROWSE-PROXY] Form submission intercepted. Action:', action);
      
      // If action is empty or #, use current page
      if (!action || action === '#') {
        // Get current page path from window location
        const currentUrl = window.location.href;
        if (currentUrl.includes('/api/browse?p=')) {
          // Extract the p parameter and use it as action
          const urlParams = new URLSearchParams(window.location.search);
          const pParam = urlParams.get('p');
          if (pParam) {
            action = PROXY_ORIGIN + '/api/browse?p=' + pParam;
            form.setAttribute('action', action);
            console.log('[BROWSE-PROXY] Set empty form action to current page:', action);
            return; // Let form submit normally
          }
        }
        // Fallback
        action = window.location.pathname + window.location.search;
      }
      
      // Only rewrite if not already a browse proxy URL
      if (!action.includes('/api/browse?p=')) {
        const newAction = convertToBrowseProxy(action);
        form.setAttribute('action', newAction);
        console.log('[BROWSE-PROXY] Form action converted:', action, '->', newAction);
      }
    }
  });
  
})();
</script>`;
}
