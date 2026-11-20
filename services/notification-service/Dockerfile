FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY services/notification-service/package.json services/notification-service/
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY shared ./shared
COPY services/notification-service ./services/notification-service
RUN adduser -D -u 1001 lifelink
USER lifelink
EXPOSE 4004
CMD ["node", "services/notification-service/src/server.js"]
