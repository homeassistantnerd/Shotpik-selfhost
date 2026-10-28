# Stage 1: Build Shared and Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/backend/package*.json ./packages/backend/
RUN npm install
COPY packages/shared ./packages/shared
RUN npm run build -w @shotpik/shared
COPY packages/frontend ./packages/frontend
RUN npm run build -w @shotpik/frontend

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/
RUN npm install
COPY --from=frontend-builder /app/packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN npm run build -w @shotpik/backend

# Stage 3: Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/shotpik.db
ENV FRONTEND_DIST_PATH=/app/packages/frontend/dist

RUN apk add --no-cache python3 make g++ wget
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/
RUN npm install --omit=dev && npm cache clean --force

COPY --from=frontend-builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=frontend-builder /app/packages/frontend/dist ./packages/frontend/dist
COPY --from=backend-builder /app/packages/backend/dist ./packages/backend/dist

RUN mkdir -p /app/data
EXPOSE 3000

CMD ["node", "packages/backend/dist/index.js"]
