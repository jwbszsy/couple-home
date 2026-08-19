# 我们的小屋 —— 轻量单文件服务（零依赖）
# 使用 Debian 版 node（自带 bash），显式 PATH，避免平台运行时找不到 node
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

COPY package*.json server.js ./
RUN npm install --omit=dev
COPY public ./public
COPY scripts ./scripts

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
