# Vercel Web Proxy

A sophisticated web proxy application deployed on Vercel using serverless functions. This tool allows you to access blocked websites with persistent navigation by routing traffic through Vercel's trusted infrastructure.

## 🚀 Key Features

- **🔒 Secure Proxying**: All traffic is routed through HTTPS-encrypted connections
- **🌐 Navigation Persistence**: Links, forms, searches, and navigation work seamlessly 
- **📱 New Tab Experience**: URLs open in new tabs for better browsing experience
- **🎯 Resource Loading**: Images, CSS, JavaScript, and other resources load properly
- **⚡ URL Rewriting**: Automatic rewriting of all URLs to maintain proxy persistence
- **🛡️ Smart Error Handling**: Comprehensive error messages and timeout handling
- **🔧 Form Support**: POST requests, form submissions, and searches work correctly

## 🌟 Advanced Capabilities

### Navigation Persistence
- All links within proxied sites automatically route through the proxy
- Form submissions maintain proxy routing
- JavaScript navigation and AJAX requests are intercepted
- Relative and absolute URLs are properly rewritten

### Enhanced Security
- Blocks access to internal/local networks to prevent abuse
- Removes problematic headers (X-Frame-Options, CSP) for compatibility
- Sets appropriate CORS headers for security
- Validates and sanitizes all URLs

### Resource Loading
- Images, stylesheets, and JavaScript files load correctly
- CSS @import and url() references are rewritten
- Background images and other resources are proxied

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML, CSS, and JavaScript with modern UI
- **Backend**: Node.js serverless functions on Vercel with advanced URL rewriting
- **HTTP Client**: Axios for robust request handling with streaming support
- **Deployment**: GitHub integration with Vercel

## 📦 Installation & Deployment

### Prerequisites
- GitHub account
- Vercel account (free tier works perfectly)
- Node.js 18+ (for local development)

### Quick Deploy to Vercel

1. **Fork/Clone this repository** to your GitHub account

2. **Connect to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Click "Deploy"

3. **Access your proxy**:
   - Your proxy will be available at `https://your-project-name.vercel.app`
   - Enter any URL in the input field and click "Go"

### Local Development

```bash
# Install dependencies
npm install

# Install Vercel CLI globally
npm install -g vercel

# Start local development server
npm run dev
# or
vercel dev

# Your local proxy will be available at http://localhost:3000
```

## 🎯 Usage

1. **Open your deployed proxy** (e.g., `https://your-proxy.vercel.app`)
2. **Enter a URL** in the input field (with or without `https://`)
3. **Click "Go"** or press Enter
4. **Browse securely** through the proxy

### Quick Access Buttons
The interface includes quick access buttons for popular sites:
- Google
- YouTube  
- Reddit
- Twitter
- Facebook
- Instagram

## ⚙️ Configuration

### Vercel Configuration (`vercel.json`)
- Configured for serverless function deployment
- 30-second timeout for proxy requests
- Optimized routing for both static files and API endpoints

### Security Features
- Blocks access to internal/local networks (`localhost`, `127.0.0.1`, private IP ranges)
- Removes problematic headers that might break iframe embedding
- Sets appropriate CORS headers for security

## 🔧 Customization

### Adding More Quick Links
Edit the `index.html` file and add buttons in the `.quick-links` section:

```html
<button class="quick-link" onclick="loadQuickSite('https://example.com')">Example</button>
```

### Modifying the Proxy Logic
The main proxy logic is in `/api/proxy.js`. You can:
- Adjust timeout values
- Modify request headers
- Add additional security checks
- Customize error handling

### Styling Changes
All styles are contained in the `<style>` section of `index.html`. The design uses:
- Modern gradient backgrounds
- Glassmorphism effects
- Responsive design for mobile devices

## 📊 Vercel Limits (Free Tier)

- **Bandwidth**: 100 GB/month (generous for personal use)
- **Function Invocations**: 1M/month
- **Function Duration**: 10 seconds (we use 30s for better compatibility)
- **Build Time**: 100 hours/month

These limits are typically sufficient for personal proxy usage.

## 🛡️ Security Considerations

### What This Proxy Does
- Encrypts all traffic between you and the proxy server
- Masks your requests as traffic to Vercel (harder to block)
- Provides a secure tunnel for accessing blocked content

### What This Proxy Doesn't Do
- **Not anonymous**: Your Vercel logs may contain access records
- **Not for illegal activity**: Use responsibly and follow your organization's policies
- **Not bulletproof**: Advanced DPI systems might still detect proxy usage

### Recommended Usage
- Use for accessing legitimate blocked content
- Respect your organization's acceptable use policies  
- Consider the legal implications in your jurisdiction
- Don't use for malicious activities

## 🐛 Troubleshooting

### Common Issues

**"Failed to load the website"**
- The target website might be down
- Some sites actively block proxy requests
- Try adding `https://` to the URL

**"Request timeout"**
- The website is slow to respond
- Vercel function timeout (30s) was reached
- Try again or use a different URL

**"Domain not found"**
- Check the URL spelling
- Ensure the domain exists and is accessible

### Error Codes
- `400`: Missing or invalid URL parameter
- `403`: Blocked URL (internal/local addresses)
- `404`: Domain not found
- `408`: Request timeout
- `500`: General proxy error

## 📈 Monitoring

Monitor your usage in the Vercel dashboard:
- Function invocations
- Bandwidth usage
- Error rates
- Performance metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📜 License

MIT License - feel free to use this project for personal or educational purposes.

## ⚠️ Disclaimer

This tool is provided for educational purposes. Users are responsible for complying with their organization's policies and local laws. The authors are not responsible for any misuse of this software.

---

**Built with ❤️ for the developer community**
