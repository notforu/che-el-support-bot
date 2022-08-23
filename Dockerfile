# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 node:16-alpine
WORKDIR /app
COPY ["package.json", "package-lock.json*", "./"]
RUN npm install
COPY . .
RUN npm run build
CMD [ "node", "dist/index.js" ]
