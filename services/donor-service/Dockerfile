FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY services/donor-service/package.json services/donor-service/
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY shared ./shared
COPY services/donor-service ./services/donor-service
RUN adduser -D -u 1001 lifelink
USER lifelink
EXPOSE 4001
CMD ["node", "services/donor-service/src/server.js"]
