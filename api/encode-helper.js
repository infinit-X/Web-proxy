// URL Encoding/Decoding API Helper
// File: /api/encode-helper.js

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, data } = req.query;

  try {
    if (action === 'encode') {
      if (!data) {
        return res.status(400).json({ error: 'Missing data parameter' });
      }
      
      const encoded = Buffer.from(decodeURIComponent(data)).toString('base64');
      const proxyUrl = `${req.headers.origin || 'http://localhost:3000'}/api/encode/${encoded}`;
      
      return res.json({
        original: decodeURIComponent(data),
        encoded: encoded,
        proxyUrl: proxyUrl
      });
      
    } else if (action === 'decode') {
      if (!data) {
        return res.status(400).json({ error: 'Missing data parameter' });
      }
      
      const decoded = Buffer.from(data, 'base64').toString('utf-8');
      
      return res.json({
        encoded: data,
        decoded: decoded
      });
      
    } else {
      return res.status(400).json({ 
        error: 'Invalid action',
        message: 'Use action=encode or action=decode'
      });
    }
    
  } catch (error) {
    return res.status(500).json({
      error: 'Processing error',
      message: error.message
    });
  }
};
