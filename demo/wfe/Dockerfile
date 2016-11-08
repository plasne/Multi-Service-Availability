FROM node:latest
EXPOSE 80
COPY package.json package.json
RUN npm install
COPY server.js server.js
COPY files/ files/
CMD node server.js