FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace root manifests + web package
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/web/package.json packages/web/
COPY packages/render-service/package.json packages/render-service/
COPY packages/agent-pi/package.json packages/agent-pi/
COPY packages/scene-contracts/package.json packages/scene-contracts/

RUN pnpm install --frozen-lockfile

COPY packages/web/index.html packages/web/vite.config.ts packages/web/tsconfig.json packages/web/vite-env.d.ts packages/web/
COPY packages/web/src packages/web/src

EXPOSE 5173

CMD ["pnpm", "--filter", "web", "exec", "vite", "--host", "0.0.0.0"]
