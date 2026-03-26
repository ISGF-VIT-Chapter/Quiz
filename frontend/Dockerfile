# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Build Vite app (pass backend URL at build time if needed)
ARG VITE_BACKEND_URL=https://iac-quiz-buzzer-website-production.up.railway.app
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

RUN npm run build

# ---- Stage 2: Serve with nginx ----
FROM nginx:alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Add custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
