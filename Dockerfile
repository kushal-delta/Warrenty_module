# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (cached while package files are unchanged)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source code and build the standalone server
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# tzdata: "today" checks (future dates, due dates) follow India time, not UTC
RUN apk add --no-cache tzdata

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Asia/Kolkata
# Make port configurable with default value
ARG PORT=3000
ENV PORT=${PORT}
ENV HOSTNAME=0.0.0.0

# Copy only necessary files from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Uploaded photos, videos and PDFs live in /app/uploads/attachments.
# Mount a host folder (or named volume) here so they survive new images and containers:
#   docker run ... -v /home/delta/delta-warranty/uploads:/app/uploads ...
RUN mkdir -p /app/uploads/attachments
VOLUME ["/app/uploads"]

# Use dynamic port exposure
EXPOSE $PORT

# Health check with dynamic port
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:$PORT/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
