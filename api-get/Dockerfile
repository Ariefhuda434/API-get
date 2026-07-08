FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

# Install system dependencies for TikTok automation (non-headless Chromium)
RUN npx playwright install-deps chromium 2>/dev/null || true

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3002

CMD ["sh", "-c", "node server.js"]
