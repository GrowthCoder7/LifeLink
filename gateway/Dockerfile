FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY gateway/package.json gateway/
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY shared ./shared
COPY gateway ./gateway
RUN adduser -D -u 1001 lifelink
USER lifelink
EXPOSE 8080
CMD ["node", "gateway/src/server.js"]
