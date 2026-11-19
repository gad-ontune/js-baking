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
 && mkdir -p /var/cache/nginx /var/run /var/log/nginx /var/www/certbot \
 && chown -R jsbh:jsbh /var/cache/nginx /var/run /var/log/nginx \
      /usr/share/nginx/html /etc/nginx /var/www/certbot

COPY deploy/nginx.conf.template deploy/nginx-headers.conf.template \
     deploy/server-locations.conf.template /etc/nginx/templates/
COPY deploy/web-entrypoint.sh /usr/local/bin/web-entrypoint.sh
RUN chmod 0755 /usr/local/bin/web-entrypoint.sh
COPY --from=build --chown=jsbh:jsbh /app/dist/ /usr/share/nginx/html/

USER jsbh
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/web-entrypoint.sh"]
