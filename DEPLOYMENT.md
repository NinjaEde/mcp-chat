# Dynamic CORS and Environment Configuration

This project now supports dynamic CORS configuration and flexible environment settings for different deployment scenarios.

## Backend Configuration

### Environment Variables

The backend supports the following environment variables:

#### CORS Configuration
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins
  - Example: `ALLOWED_ORIGINS=http://localhost:3000,https://myapp.com,https://staging.myapp.com`
  - Default: `http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:3002`

- `FRONTEND_URL`: Primary frontend URL (useful for Docker compositions)
  - Example: `FRONTEND_URL=http://frontend:3000`
  - Default: None

#### Security
- `JWT_SECRET`: Secret key for JWT token signing
  - **Important**: Change this in production!
  - Default: `dev_secret_change_in_production`

- `JWT_EXPIRES_IN`: JWT token expiration time
  - Default: `12h`

#### Database
- `DB_PATH`: Path to SQLite database file
  - Default: `./database/mcpchat.db`
  - Docker: `/app/data/mcpchat.db`

#### Other
- `NODE_ENV`: Environment mode (`development` | `production`)
- `PORT`: Server port (default: `3001`)
- `LOG_LEVEL`: Logging level (`debug` | `info` | `warn` | `error`)

### CORS Behavior

The backend implements intelligent CORS handling:

1. **Static Origins**: Checks against `ALLOWED_ORIGINS` environment variable
2. **Docker Support**: Automatically includes Docker service names (`frontend:*`)
3. **Development Mode**: In non-production environments, allows any `localhost:*` origin
4. **Dynamic Headers**: Returns the requesting origin in `Access-Control-Allow-Origin`

## Frontend Configuration

### Environment Variables

- `VITE_API_URL`: Backend API URL
  - Development: `http://localhost:3001/api`
  - Docker: `http://backend:3001/api`
  - Production: `https://api.yourdomain.com/api`

- `VITE_APP_NAME`: Application name (default: `MCP Chat`)
- `VITE_DEBUG`: Enable debug mode (`true` | `false`)
- `VITE_LOG_LEVEL`: Frontend logging level

## Deployment Scenarios

### 1. Local Development

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env as needed
npm start

# Frontend
cd frontend
cp .env.example .env
# Edit .env as needed
npm run dev
```

### 2. Docker Development

```bash
# Uses docker-compose.yml with development settings
docker-compose up --build
```

Access:
- Frontend: http://localhost:3002
- Backend: http://localhost:3001

### 3. Docker Production

```bash
# Uses docker-compose.prod.yml with production settings
docker-compose -f docker-compose.prod.yml up --build -d
```

Environment variables for production:
```bash
export ALLOWED_ORIGINS="https://myapp.com,https://app.myapp.com"
export FRONTEND_URL="https://myapp.com"
export JWT_SECRET="your-super-secure-secret-key"
export FRONTEND_PORT=80
```

### 4. Custom Deployment

For custom deployments (AWS, GCP, Kubernetes, etc.), set environment variables:

```bash
# Backend
export ALLOWED_ORIGINS="https://yourapp.com,https://admin.yourapp.com"
export FRONTEND_URL="https://yourapp.com"
export JWT_SECRET="your-production-secret"
export DB_PATH="/data/mcpchat.db"

# Frontend
export VITE_API_URL="https://api.yourapp.com/api"
export VITE_APP_NAME="Your App Name"
```

## SSE (Server-Sent Events) Configuration

The SSE endpoints automatically inherit the CORS configuration:

- ✅ Works with any allowed origin
- ✅ Supports dynamic ports (localhost:*)
- ✅ Works with Docker service names
- ✅ Returns correct CORS headers

## Testing CORS

You can test CORS configuration with curl:

```bash
# Test with specific origin
curl -H "Origin: http://localhost:5173" \
     -H "Accept: text/event-stream" \
     "http://localhost:3001/api/conversations/1/stream?token=YOUR_TOKEN"

# Should return: Access-Control-Allow-Origin: http://localhost:5173
```

## Security Notes

1. **JWT Secret**: Always use a secure, randomly generated secret in production
2. **CORS Origins**: Be specific about allowed origins in production
3. **HTTPS**: Use HTTPS in production environments
4. **Database**: Use proper database permissions and backup strategies
5. **Logging**: Set appropriate log levels for production

## Troubleshooting

### CORS Issues

If you encounter CORS issues:

1. Check your `ALLOWED_ORIGINS` environment variable
2. Verify the frontend is making requests to the correct API URL
3. Check browser console for specific CORS error messages
4. Use curl to test backend CORS responses

### SSE Connection Issues

If SSE (real-time streaming) doesn't work:

1. Verify CORS is working (see above)
2. Check JWT token validity
3. Ensure conversation exists and user has access
4. Check browser developer tools Network tab for SSE connection status

### Docker Issues

If Docker deployment has issues:

1. Verify service names in docker-compose.yml match environment variables
2. Check if ports are correctly mapped
3. Verify environment variables are properly passed to containers
4. Check docker logs: `docker-compose logs backend` / `docker-compose logs frontend`
