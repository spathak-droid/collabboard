FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application code
COPY . .

# Expose WebSocket port
EXPOSE 1234

# Set environment
ENV NODE_ENV=production

# Start server
CMD ["node", "server.js"]
