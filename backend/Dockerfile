FROM node:20-alpine
WORKDIR /app

# Install build dependencies für native modules und curl für healthcheck
RUN apk add --no-cache python3 make g++ curl

# Kopiere package files
COPY package*.json ./

# Install dependencies im Container (nicht vom Host)
RUN npm install

# Kopiere source code und environment config
COPY . .

# Create data directory for production database
RUN mkdir -p /app/data /app/logs

# Set proper permissions
RUN chown -R node:node /app
USER node

EXPOSE 3001

# Use environment variable to determine start command
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"production\" ]; then npm start; else npm run dev; fi"]
