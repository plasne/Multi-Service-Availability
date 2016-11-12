FROM node:latest
EXPOSE 80
COPY package.json package.json
RUN npm install
COPY server.js server.js
CMD node server.js --config west