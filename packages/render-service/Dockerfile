FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

# Chromium headless dependencies for Remotion rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk-bridge2.0-0 libx11-xcb1 libdrm2 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libasound2 libcups2 \
    fonts-liberation curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace root manifests + render-service package
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/render-service/package.json packages/render-service/
COPY packages/agent-pi/package.json packages/agent-pi/
COPY packages/scene-contracts/package.json packages/scene-contracts/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile

# Copy source after install to leverage Docker layer cache for dependencies
COPY packages/render-service/src packages/render-service/src
COPY packages/scene-contracts packages/scene-contracts
# Remotion compositions + shared render scripts
COPY src src
COPY scripts scripts
COPY public public
COPY content content
COPY remotion.config.ts tsconfig.json ./

# Download Chromium for Remotion
RUN npx remotion browser ensure

EXPOSE 3100

CMD ["pnpm", "run", "--filter=render-service", "start"]
