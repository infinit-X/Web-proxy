// Vercel Serverless Function for Web Proxy
// File: /api/proxy.js

const axios = require('axios');

// Main serverless function handler
module.exports = async (req, res) => {
  // Set CORS headers to allow requests from our frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = req.query.url;

  // Validate the URL parameter
  if (!targetUrl) {
    return res.status(400).json({
      error: 'Missing URL parameter',
      message: 'Please provide a URL to proxy in the ?url= parameter'
    });
  }

  try {
    // Validate URL format
    const urlObj = new URL(targetUrl);
    
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

    console.log(`[PROXY] Fetching: ${targetUrl}`);

    // Configure the request with appropriate headers
    const requestConfig = {
      method: req.method || 'GET',
      url: targetUrl,
      responseType: 'stream',
      timeout: 30000, // 30 second timeout
      maxRedirects: 5,
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
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    // Forward POST data if present
    if (req.method === 'POST' && req.body) {
      requestConfig.data = req.body;
      requestConfig.headers['Content-Type'] = req.headers['content-type'] || 'application/x-www-form-urlencoded';
    }

    // Make the request to the target URL
    const response = await axios(requestConfig);

    // Set response headers
    const responseHeaders = { ...response.headers };
    
    // Remove headers that might cause issues in iframe context
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['content-security-policy-report-only'];
    
    // Set proper CORS headers
    responseHeaders['Access-Control-Allow-Origin'] = '*';
    responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, HEAD';
    
    // If it's HTML content, we might need to modify it to work better in iframe
    const contentType = responseHeaders['content-type'] || '';
    
    if (contentType.includes('text/html')) {
      // For HTML content, we'll stream it directly but modify headers
      responseHeaders['X-Frame-Options'] = 'ALLOWALL';
      delete responseHeaders['x-frame-options'];
    }

    // Write the response headers
    res.writeHead(response.status, responseHeaders);
    
    // Stream the response data directly to the client
    response.data.pipe(res);

    // Handle streaming errors
    response.data.on('error', (error) => {
      console.error('[PROXY] Streaming error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Streaming error',
          message: 'Error occurred while streaming content'
        });
      }
    });

  } catch (error) {
    console.error('[PROXY] Error:', error.message);
    
    // Handle different types of errors
    if (error.response) {
      // HTTP error response from target server
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
        message: 'The request took too long to complete. The server might be slow or unreachable.',
        url: targetUrl
      });
      
    } else if (error.code === 'ECONNREFUSED') {
      return res.status(502).json({
        error: 'Connection refused',
        message: 'The target server refused the connection.',
        url: targetUrl
      });
      
    } else {
      // Generic error
      return res.status(500).json({
        error: 'Proxy error',
        message: `Failed to fetch the URL: ${error.message}`,
        url: targetUrl,
        code: error.code
      });
    }
  }
};
