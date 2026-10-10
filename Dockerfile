FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY client client
COPY server server
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=build /app/package*.json ./
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/client/package.json client/package.json
RUN npm ci --omit=dev
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/sql server/sql
COPY --from=build /app/client/dist client/dist
EXPOSE 3001
CMD ["node","server/dist/index.js"]
