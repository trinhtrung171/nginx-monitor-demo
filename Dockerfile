FROM nginx:alpine
# Chép file cấu hình của bạn vào Image
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80