# ==========================================
# Memory Cards Multiplayer — Dockerfile
# ==========================================

FROM node:20-alpine AS production

WORKDIR /app

# Install dependencies (only production)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

# Start server
CMD ["node", "server.js"]

