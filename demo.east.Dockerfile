FROM node:latest
EXPOSE 80
COPY package.json package.json
RUN npm install
COPY app.js app.js
COPY config/ config/
COPY lib/ lib/
COPY web/ web/
CMD node app.js --config-prefix demo.west.,demo.all. --instance east --discover-dns tasks.msa --discover-port 80 --log-level verbose