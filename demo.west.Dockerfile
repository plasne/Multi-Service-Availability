FROM node:latest
EXPOSE 80
COPY package.json package.json
RUN npm install
COPY server.js server.js
COPY config/ config/
COPY lib/ lib/
COPY web/ web/
CMD node server.js --config-prefix demo.west.,demo.all. --instance west --discover-dns tasks.msa --discover-port 80 --mode proxy --log-level debug