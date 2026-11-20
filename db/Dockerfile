FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY gateway/package.json gateway/
COPY services/donor-service/package.json services/donor-service/
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY shared ./shared
COPY db ./db
CMD ["sh", "-c", "node db/migrate.js && node db/seed/seed.js --if-empty"]
