# 我们的小屋 —— 轻量单文件服务（零依赖）
FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY scripts ./scripts
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
