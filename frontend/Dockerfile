FROM node:22-alpine AS build
WORKDIR /app
# package-lock.json (om den finns) låser alla beroenden. --ignore-scripts hindrar
# install-skript i npm-paket från att köra kod under bygget.
COPY package.json package-lock.jso[n] ./
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts; \
    else npm install --ignore-scripts; fi
COPY . .
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
