// Proxy Status and Information API
// File: /api/status.js

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const baseUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  
  const status = {
    timestamp: new Date().toISOString(),
    status: 'operational',
    proxy_methods: {
      encoded: {
        name: 'Base64 Encoded Proxy',
        endpoint: '/api/encode/[encoded]',
        status: 'recommended',
        example: `${baseUrl}/api/encode/aHR0cHM6Ly93d3cuZ29vZ2xlLmNvbQ==`,
        description: 'Most reliable method using base64 URL encoding'
      },
      query: {
        name: 'Query Parameter Proxy',
        endpoint: '/api/proxy',
        status: 'enhanced',
        example: `${baseUrl}/api/proxy?url=https%3A//www.google.com`,
        description: 'Enhanced with base tag injection and service worker'
      },
      path: {
        name: 'Path-Based Proxy',
        endpoint: '/api/proxy-path/[...path]',
        status: 'experimental',
        example: `${baseUrl}/api/proxy-path/aHR0cHM6Ly93d3cuZ29vZ2xlLmNvbQ==/search`,
        description: 'REST-like URL structure for better navigation'
      }
    },
    interfaces: {
      main: `${baseUrl}/`,
      encoder: `${baseUrl}/encoder.html`,
      tester: `${baseUrl}/test.html`,
      documentation: `${baseUrl}/IMPLEMENTATION.md`
    },
    utilities: {
      encode_helper: `${baseUrl}/api/encode-helper?action=encode&data=URL`,
      debug: `${baseUrl}/api/debug`,
      status: `${baseUrl}/api/status`
    },
    features: [
      'Base tag injection for relative URL resolution',
      'Service worker request interception',
      'Enhanced form handling',
      'JavaScript URL rewriting',
      'CORS and security header management',
      'Multi-method proxy support'
    ],
    version: '2.0.0',
    last_updated: '2025-08-04'
  };

  res.json(status);
};
