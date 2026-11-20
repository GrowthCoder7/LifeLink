FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY services/matching-service/package.json services/matching-service/
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY shared ./shared
COPY services/matching-service ./services/matching-service
RUN adduser -D -u 1001 lifelink
USER lifelink
EXPOSE 4003
CMD ["node", "services/matching-service/src/server.js"]
