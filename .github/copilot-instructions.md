<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Vercel Web Proxy Project Instructions

This is a web proxy application built for deployment on Vercel using serverless functions. The project aims to provide secure access to blocked websites through corporate networks by leveraging Vercel's trusted infrastructure.

## Project Architecture
- **Frontend**: Static HTML/CSS/JS served from Vercel's CDN
- **Backend**: Node.js serverless function (`/api/proxy.js`) that handles the actual web proxying
- **Deployment**: GitHub → Vercel automatic deployment

## Key Technical Decisions
1. **Security First**: The proxy includes security measures to prevent access to internal networks
2. **Performance**: Uses streaming responses to handle large content efficiently
3. **Compatibility**: Removes problematic headers (X-Frame-Options, CSP) to ensure iframe compatibility
4. **Error Handling**: Comprehensive error handling with user-friendly messages

## Development Guidelines
- Keep the serverless function under Vercel's limits (30s timeout, reasonable memory usage)
- Maintain browser compatibility for the frontend
- Follow security best practices to prevent abuse
- Optimize for the corporate network bypass use case

## Dependencies
- `axios`: For making HTTP requests in the serverless function
- `vercel`: CLI tool for development and deployment

When working on this project, prioritize security, performance, and reliability while maintaining the core proxy functionality.
