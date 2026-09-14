FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install --workspace server --omit=dev
COPY server server
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "src/server.ts"]
