# Build stage
FROM node:18-alpine AS builder

WORKDIR /app
COPY package.json .
RUN npm install

COPY . .
RUN npm run build

# Serve stage (nginx)
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
# ← نسخ قوالب Excel إلى مجلد ثابت
COPY templates/ /usr/share/nginx/html/templates/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
