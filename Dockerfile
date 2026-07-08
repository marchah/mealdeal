FROM node:26-slim

WORKDIR /app
ENV NODE_ENV=production

# Runtime deps only (the app runs TypeScript natively — no build step, no tsc at runtime).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
VOLUME ["/app/data"]
CMD ["npm", "start"]
