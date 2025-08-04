// Alternative Path-Based Proxy API
// File: /api/proxy-path/[...path].js
// This uses dynamic paths instead of query parameters for better navigation

const axios = require('axios');
const { URL } = require('url');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Proxy-Origin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract the path segments
  const pathSegments = req.query.path || [];
  
  // The first segment should be the encoded origin
  if (!pathSegments.length) {
    return res.status(400).json({
      error: 'Missing path segments',
      message: 'Please provide a path with encoded origin'
    });
  }

  try {
    // Reconstruct the target URL
    const encodedOrigin = pathSegments[0];
    const origin = decodeURIComponent(encodedOrigin);
    const pathPart = pathSegments.slice(1).join('/');
    const targetUrl = `${origin}/${pathPart}${req.url.includes('?') ? '?' + req.url.split('?')[1].replace(/path=[^&]*/g, '').replace(/^&/, '').replace(/&&/g, '&') : ''}`;

    console.log(`[PATH-PROXY] Request: ${req.method} ${targetUrl}`);

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

    const contentType = responseHeaders['content-type'] || '';

    if (contentType.includes('text/html')) {
      // Process HTML content
      const chunks = [];
      response.data.on('data', chunk => chunks.push(chunk));
      
      await new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });

      let htmlContent = Buffer.concat(chunks).toString('utf8');
      
      // Rewrite URLs to use path-based proxy
      htmlContent = rewriteHtmlForPathProxy(htmlContent, origin);

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

function rewriteHtmlForPathProxy(html, origin) {
  const proxyBase = '/api/proxy-path/' + encodeURIComponent(origin);
  
  // Rewrite various URL patterns
  html = html.replace(/href=["']([^"']+)["']/gi, (match, url) => {
    const newUrl = rewriteUrlForPath(url, origin, proxyBase);
    return `href="${newUrl}"`;
  });

  html = html.replace(/src=["']([^"']+)["']/gi, (match, url) => {
    const newUrl = rewriteUrlForPath(url, origin, proxyBase);
    return `src="${newUrl}"`;
  });

  html = html.replace(/action=["']([^"']+)["']/gi, (match, url) => {
    const newUrl = rewriteUrlForPath(url, origin, proxyBase);
    return `action="${newUrl}"`;
  });

  return html;
}

function rewriteUrlForPath(url, origin, proxyBase) {
  if (!url || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#')) {
    return url;
  }

  try {
    let absoluteUrl;
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      absoluteUrl = url;
    } else if (url.startsWith('//')) {
      const originObj = new URL(origin);
      absoluteUrl = originObj.protocol + url;
    } else if (url.startsWith('/')) {
      absoluteUrl = origin + url;
    } else {
      absoluteUrl = new URL(url, origin).href;
    }

    // If it's the same origin, use path proxy
    const urlObj = new URL(absoluteUrl);
    if (urlObj.origin === origin) {
      return proxyBase + urlObj.pathname + urlObj.search + urlObj.hash;
    } else {
      // Different origin, use regular proxy
      return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
    }
  } catch (error) {
    console.error('[PATH-PROXY] URL rewrite error:', error);
    return url;
  }
}
