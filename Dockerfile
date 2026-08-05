FROM node:20-slim
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY scripts ./scripts
ENV PORT=3000
EXPOSE 3000
CMD ["/bin/bash", "-c", "echo 'DIAG PATH='$PATH; which node && echo 'NODE_FOUND' || echo 'NO_NODE'; node --version; node server.js"]
