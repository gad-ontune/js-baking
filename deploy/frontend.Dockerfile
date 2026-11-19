# Build the SPA with Node, then serve it from a minimal unprivileged nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine

RUN addgroup -g 10001 -S jsbh \
 && adduser -u 10001 -S -G jsbh jsbh \
 && mkdir -p /var/cache/nginx /var/run /var/log/nginx \
 && chown -R jsbh:jsbh /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html /etc/nginx/conf.d

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx-headers.conf /etc/nginx/nginx-headers.conf
COPY --from=build --chown=jsbh:jsbh /app/dist/ /usr/share/nginx/html/

USER jsbh
EXPOSE 8080

# The base image supplies: CMD ["nginx", "-g", "daemon off;"]
