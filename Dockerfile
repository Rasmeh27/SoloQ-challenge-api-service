# syntax=docker/dockerfile:1

# ---------- Build stage ----------
# Node 24 LTS ("Krypton"), matching package.json engines, .nvmrc and .node-version.
FROM node:24-alpine AS builder

WORKDIR /app

# Dependencies first, so the layer is reused while only sources change.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

# ---------- Runtime stage ----------
FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    CHALLENGE_DATA_DIR=/app/data

WORKDIR /app

# The JSON storage needs a writable directory owned by the non root user.
RUN mkdir -p /app/data && chown -R node:node /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Never runs as root. `.env` is never copied: configuration comes from the environment.
USER node

EXPOSE 3001

# Mount a persistent volume here or the challenge state is lost on every recreation.
VOLUME ["/app/data"]

CMD ["node", "dist/main.js"]
