# Enhanced Web Proxy - Implementation Guide

## 🚀 Overview

This web proxy implementation provides multiple methods to access blocked websites through corporate networks, each designed to solve different navigation and persistence issues.

## 🔧 Implementation Methods

### 1. **Base64 Encoded Proxy** (Recommended)
- **Endpoint**: `/api/encode/[encoded]`
- **Usage**: `https://yourproxy.vercel.app/api/encode/aHR0cHM6Ly93d3cuZ29vZ2xlLmNvbQ==`
- **Benefits**: 
  - No query parameter issues
  - Clean URLs that don't break navigation
  - Base64 encoding prevents URL parsing problems
  - Works well with forms and JavaScript redirects

### 2. **Enhanced Query Parameter Proxy**
- **Endpoint**: `/api/proxy?url=TARGET_URL`
- **Usage**: `https://yourproxy.vercel.app/api/proxy?url=https%3A//www.google.com`
- **Features**:
  - Base tag injection for proper relative URL resolution
  - Service worker registration for complete request interception
  - Enhanced form handling and JavaScript URL rewriting
  - Comprehensive server-side URL rewriting

### 3. **Path-Based Proxy** (Experimental)
- **Endpoint**: `/api/proxy-path/[encodedOrigin]/[...path]`
- **Usage**: `https://yourproxy.vercel.app/api/proxy-path/aHR0cHM6Ly93d3cuZ29vZ2xlLmNvbQ==/search?q=test`
- **Benefits**: REST-like URLs, no query parameter issues

## 🛠️ Key Technical Solutions

### Base Tag Injection
```html
<base href="https://yourproxy.vercel.app/api/encode/aHR0cHM6Ly93d3cuZ29vZ2xlLmNvbQ==/" target="_blank">
```
This ensures all relative URLs on the page are automatically resolved through the proxy.

### Service Worker Request Interception
The service worker (`/sw.js`) intercepts all network requests and routes them through the proxy, providing complete navigation control.

### Enhanced URL Rewriting
- Server-side HTML/CSS URL rewriting
- Client-side JavaScript injection for runtime URL handling
- Form action rewriting with special Google search handling
- Fetch/XHR API overrides

## 📁 File Structure

```
/api/
├── proxy.js                 # Main enhanced proxy
├── encode/[encoded].js       # Base64 encoded proxy
├── proxy-path/[...path].js   # Path-based proxy
├── encode-helper.js          # URL encoding utilities
└── debug.js                  # Debug endpoint

/public/
├── sw.js                     # Service worker
├── index.html                # Main interface
├── encoder.html              # Encoded proxy interface
├── test.html                 # Testing interface
└── form-test.html            # Form testing

/vercel.json                  # Deployment configuration
```

## 🔍 Testing Endpoints

1. **Main Interface**: `https://yourproxy.vercel.app/`
2. **Encoded Proxy**: `https://yourproxy.vercel.app/encoder.html`
3. **Debug Tools**: `https://yourproxy.vercel.app/test.html`
4. **Encode Helper**: `https://yourproxy.vercel.app/api/encode-helper?action=encode&data=https://www.google.com`

## 🚦 Usage Examples

### Direct Access
```javascript
// Encode URL
const url = 'https://www.google.com';
const encoded = btoa(url);
window.open(`/api/encode/${encoded}`, '_blank');
```

### Form Handling
The proxy automatically handles form submissions by:
1. Server-side form action rewriting
2. Client-side form submit event interception
3. Special handling for search engines like Google

### Navigation Persistence
- Base tag ensures relative URLs work correctly
- Service worker intercepts navigation requests
- JavaScript overrides handle dynamic URL changes

## 🛡️ Security Features

- CORS headers for cross-origin requests
- Content Security Policy header removal
- X-Frame-Options header removal for iframe compatibility
- Request validation and sanitization
- Timeout protection (30 seconds)

## 🐛 Troubleshooting

### Common Issues:
1. **404 on navigation**: Use encoded proxy method instead of query parameters
2. **Form submissions fail**: Check if base tag is properly injected
3. **Service worker not registering**: Ensure `/sw.js` is accessible
4. **JavaScript errors**: Check console for URL rewriting issues

### Debug Tools:
- Use `/test.html` for comprehensive testing
- Check browser console for proxy debug messages
- Use `/api/debug` endpoint for request inspection

## 🚀 Deployment

1. Push to GitHub repository
2. Connect to Vercel
3. Deploy automatically
4. Test with `/encoder.html` for best results

The encoded proxy method (`/api/encode/[encoded]`) is the most reliable solution for persistent navigation and form handling in corporate network environments.
