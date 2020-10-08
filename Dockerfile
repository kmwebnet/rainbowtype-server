FROM node:14.5.0-buster-slim

ENV PORT 3000
EXPOSE 3000

WORKDIR /usr/src/app

COPY package.json package.json
COPY package-lock.json package-lock.json

RUN npm install

COPY . .

CMD [ "node", "index.js" ]