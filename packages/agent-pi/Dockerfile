FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
RUN apt-get update && apt-get install -y --no-install-recommends curl ffmpeg git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent-pi/package.json packages/agent-pi/
COPY packages/scene-contracts/package.json packages/scene-contracts/
COPY packages/render-service/package.json packages/render-service/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY packages/agent-pi packages/agent-pi
COPY packages/scene-contracts packages/scene-contracts
COPY src src
COPY scripts scripts
COPY public public
COPY content content
COPY remotion.config.ts tsconfig.json eslint.config.mjs ./

ENV PORT=3200
EXPOSE 3200

CMD ["pnpm", "--filter", "@remotion-platform/agent-pi", "start"]
