# ============================================================
# Stage 1 — Cài dependencies (chỉ production)
# ============================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Chỉ copy manifest trước để tận dụng cache layer của Docker
COPY package.json package-lock.json ./

# npm ci cài đúng theo lockfile → build tái lập được, nhanh hơn npm install
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force


# ============================================================
# Stage 2 — Image runtime
# ============================================================
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/app/data

WORKDIR /app

# Chỉ copy node_modules đã tối ưu từ stage deps
COPY --from=deps /app/node_modules ./node_modules

# Copy mã nguồn (đã lọc qua .dockerignore)
COPY . .

# Thư mục dữ liệu bền vững + phân quyền cho user không phải root
RUN mkdir -p /app/data && chown -R node:node /app

# Không chạy bằng root
USER node

EXPOSE 8080

# Docker tự khởi động lại container nếu /health không phản hồi
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/health || exit 1

CMD ["node", "index.js"]
