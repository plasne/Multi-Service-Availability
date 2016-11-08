FROM node:latest
EXPOSE 80
COPY package.json package.json
RUN npm install
COPY server.js server.js
COPY config/ config/
COPY lib/ lib/
COPY web/ web/
CMD node server.js --config-prefix demo.east.,demo.all. --instance east --discover-dns tasks.msa --discover-port 80 --management-mode proxy --log-level debug