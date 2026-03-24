# Stage 1: Build
FROM node:20-alpine AS builder

ARG CACHEBUST=1
WORKDIR /app

# OpenSSL es requerido por Prisma en Alpine
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

# Generar cliente de Prisma
RUN npx prisma generate

# Copiar el resto del código
COPY src ./src

# Stage 2: Runtime
FROM node:20-alpine
ARG CACHEBUST=1
WORKDIR /app

ENV NODE_ENV=production

# Instalar dumb-init para correcto manejo de señales y OpenSSL para Prisma
RUN apk add --no-cache dumb-init openssl

COPY package*.json ./

# Instalar SÓLO dependencias de producción
RUN npm ci --omit=dev

# Copiar configuración de Prisma y el cliente generado desde el builder
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client

# Copiar código fuente desde el builder
COPY --from=builder /app/src ./src

# Crear usuario non-root por seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 4300

# Usar dumb-init como init system
ENTRYPOINT ["dumb-init", "--"]

CMD ["npm", "start"]
