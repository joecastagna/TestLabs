FROM node:22-alpine

RUN apk add --no-cache iputils

WORKDIR /app
COPY server.js .
COPY public/ public/

EXPOSE 3000
CMD ["node", "server.js"]
