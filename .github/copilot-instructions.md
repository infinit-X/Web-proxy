<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Vercel Web Proxy Project Instructions

This is a sophisticated web proxy application with multiple implementation patterns, built for deployment on Vercel using serverless functions. The project provides secure access to blocked websites through corporate networks.

## Architecture Overview

The proxy implements **three distinct patterns** to handle different navigation and persistence challenges:

### 1. **ProxyProxy Pattern** (`/api/pp.js`) - *Recommended*
- **URL Structure**: `/api/pp?__cpo=BASE64_URL&ko=s`
- **Key Innovation**: Stable proxy URLs with visible permalink bar showing actual target URL
- **Form Handling**: All forms POST to same proxy URL, maintaining state
- **UX**: Shows target URL in fixed top bar while keeping proxy URL hidden

### 2. **Browse Pattern** (`/api/browse.js`) - *Path-like URLs*
- **URL Structure**: `/api/browse?p=https/domain.com/path`
- **Benefit**: Clean path-like structure, better for resources
- **Base Tag**: Injects `<base href="/api/browse?p=...">` for relative URL resolution

### 3. **Legacy Pattern** (`/api/proxy.js`) - *Query Parameter*
- **URL Structure**: `/api/proxy?url=TARGET_URL`
- **Issues**: Form submissions lose URL parameter
- **Fallback**: Enhanced with search form reconstruction logic

## Critical Technical Patterns

### URL Rewriting Strategy
All proxies follow this rewriting hierarchy:
1. **Base Tag Injection**: Sets document base for relative URLs
2. **Absolute URL Rewriting**: `https://domain.com` → proxy format
3. **Root-relative URLs**: `/path` → proxy format + current domain
4. **Relative URLs**: `path` → resolved against current page + proxy format
5. **Form Action Rewriting**: Empty actions point to current proxy URL

### Form Handling (The Core Challenge)
```javascript
// ProxyProxy approach - forms POST to same URL
<form action="/api/pp?__cpo=BASE64&ko=s" method="POST">

// Browse approach - forms maintain p parameter  
<form action="/api/browse?p=https/domain.com/search">
```

### Resource Loading
- **CSS/JS/Images**: All rewritten through proxy to prevent mixed content
- **Content-Type Detection**: HTML gets URL rewriting, others stream directly
- **Header Cleanup**: Removes `X-Frame-Options`, `CSP` for compatibility

## Development Workflows

### Testing Locally
```bash
vercel dev
# Test endpoints:
# http://localhost:3000/proxyproxy.html (ProxyProxy pattern)
# http://localhost:3000/ (Browse pattern)
# http://localhost:3000/encoder.html (Encoded pattern)
```

### Debugging Navigation Issues
1. Check browser console for `[PP-PROXY]`, `[BROWSE-PROXY]` logs
2. Verify base tag injection in page source
3. Test form submissions with browser dev tools network tab
4. Use `/api/status` endpoint for proxy health check

### Key Files by Pattern
- **ProxyProxy**: `api/pp.js`, `proxyproxy.html`
- **Browse**: `api/browse.js`, `index.html` 
- **Encoded**: `api/encode/[encoded].js`, `encoder.html`
- **Config**: `vercel.json` (serverless function definitions)

## Project-Specific Conventions

### Error Recovery Pattern
```javascript
// All proxies implement form submission recovery
if (!pathParam && req.query.q) {
  // Reconstruct from referer + search params
  const referer = req.headers.referer;
  // Redirect to proper proxy URL
}
```

### Security Headers
- Always remove: `X-Frame-Options`, `Content-Security-Policy`
- Always set: CORS headers for cross-origin requests
- Preserve: `Content-Type`, caching headers for resources

### Performance Optimizations
- **Streaming**: Large responses pipe directly to client
- **Timeout**: 30s limit for Vercel serverless functions
- **Redirect Handling**: Automatic proxy URL updates for 3xx responses

When working on this project, prioritize the **ProxyProxy pattern** for new features as it provides the most stable navigation experience with visible target URLs.
