FROM node:20-alpine
WORKDIR /app

# Kopiere package files
COPY package*.json ./

# Install dependencies im Container (nicht vom Host)
RUN npm install

# Kopiere source code
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
