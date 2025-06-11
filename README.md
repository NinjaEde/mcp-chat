# MCP Chat - Modularer Chat-Client

Ein fortschrittlicher Chat-Client mit KI-Integration, Tool-Support und Echtzeit-Streaming über Model Context Protocol (MCP).

## Features

- **🤖 Multi-AI Support**: OpenAI, Ollama, Anthropic, Custom AI-Provider
- **🔧 Tool Integration**: SSE, HTTP-Stream, STDIO Protokolle
- **⚡ Real-time Streaming**: Server-Sent Events für Live-AI-Antworten  
- **🔐 Authentifizierung**: JWT-basierte Sicherheit
- **🎨 Modern UI**: React, TypeScript, TailwindCSS
- **🐳 Docker Support**: Vollständige Containerisierung
- **📊 Admin Panel**: Benutzer-, Tool- und AI-Verwaltung
- **🧪 Test Coverage**: Umfassende automatisierte Tests
- **🌐 Dynamic CORS**: Flexible CORS-Konfiguration für verschiedene Deployment-Szenarien
- **⚙️ Environment-aware**: Automatische Anpassung an Development/Production/Docker

## Tech Stack

### Frontend
- React 18 + TypeScript + Vite
- TailwindCSS für Styling
- Server-Sent Events für Streaming
- JWT Authentication

### Backend
- Node.js + Express
- SQLite Datenbank
- Real-time AI Streaming
- Tool- und KI-Adapter
- Comprehensive Logging

## Quick Start

```bash
# Clone repository
git clone <repository-url>
cd mcp-chat

# Start with Docker
docker-compose up -d

# Or run locally
npm install
npm run dev
```

## Streaming Architecture

Das System unterstützt Echtzeit-Streaming von AI-Antworten:

- **SSE Endpoint**: `/api/conversations/:id/stream`
- **Chunk-based Delivery**: Antworten werden in Echtzeit übertragen
- **Multiple Providers**: Ollama und OpenAI Streaming-Support
- **Fallback Support**: Nicht-streaming Provider werden unterstützt

## AI Provider Configuration

### Ollama (Local)
```json
{
  "endpoint": "http://localhost:11434",
  "model": "llama3.2:latest"
}
```

### OpenAI
```json
{
  "apiKey": "sk-...",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 2048
}
```

## Default Login
- Username: `admin`
- Password: `admin`

## Development

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend  
cd frontend
npm install
npm run dev

# Tests
npm test
```

## Docker Support

Die Anwendung läuft vollständig in Docker-Containern mit automatischer Netzwerk-Konfiguration für AI-Services.

## Configuration & Deployment

This project supports flexible configuration for different deployment scenarios:

### Environment Configuration

- **Development**: Uses `.env.local` files with localhost URLs
- **Docker**: Automatic service discovery with container names  
- **Production**: Environment variables for custom domains and secure settings

### CORS Configuration

The backend implements intelligent CORS handling:
- ✅ Static allowed origins via `ALLOWED_ORIGINS` environment variable
- ✅ Docker service name support (`frontend:*`, `backend:*`)
- ✅ Development mode: automatic localhost port detection
- ✅ Dynamic CORS headers based on request origin

### Quick Configuration Examples

```bash
# Local Development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
VITE_API_URL=http://localhost:3001/api

# Docker Development  
ALLOWED_ORIGINS=http://frontend:5173,http://localhost:3002
VITE_API_URL=http://backend:3001/api

# Production
ALLOWED_ORIGINS=https://myapp.com,https://admin.myapp.com
VITE_API_URL=https://api.myapp.com/api
JWT_SECRET=your-secure-production-secret
```

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## License

MIT License
