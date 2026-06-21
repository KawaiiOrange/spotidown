FROM oven/bun:latest

WORKDIR /app

# Skip Puppeteer download (usamos Chromium do sistema)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Instala dependências do Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    libglib2.0-0 libx11-6 libxrandr2 libxinerama1 libxi6 libxext6 \
    libxcursor1 libatk1.0-0 libcups2 libdbus-1-3 libexpat1 \
    libfontconfig1 libgcc1 libpango-1.0-0 libpangoft2-1.0-0 libstdc++6 \
    libxrender1 ca-certificates fonts-liberation libnss3 lsb-release \
    xdg-utils wget && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lockb* tsconfig.json .env* ./
COPY index.ts index.html styles.css script.js ./

RUN bun install --production

EXPOSE 3045

CMD ["bun", "run", "index.ts"]