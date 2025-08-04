// Debug endpoint for troubleshooting proxy issues
// File: /api/debug.js

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const debugInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    query: req.query,
    headers: req.headers,
    body: req.body,
    host: req.headers.host,
    userAgent: req.headers['user-agent'],
    referer: req.headers.referer,
    origin: req.headers.origin,
    proxyOriginGuess: req.headers.origin || 
                     req.headers.referer?.split('/api/')[0] ||
                     `https://${req.headers.host}` || 'unknown'
  };

  res.status(200).json({
    message: 'Proxy Debug Information',
    debug: debugInfo,
    instructions: {
      note: 'This endpoint helps debug proxy issues',
      usage: 'Call /api/debug from your proxied pages to see request details',
      commonIssues: [
        'Missing URL parameter: Check if ?url= is properly encoded',
        'CORS issues: Verify Origin headers are set correctly',
        'URL encoding: Ensure URLs are properly encoded with encodeURIComponent()',
        'Relative URLs: Check if base URL resolution is working'
      ]
    }
  });
};
