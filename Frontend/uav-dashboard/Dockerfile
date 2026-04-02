FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS deps
RUN npm ci

FROM deps AS development
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM deps AS build
ARG VITE_API_BASE_URL=
ARG VITE_DEFAULT_FLIGHT_ID=a2ed9650-0638-4597-8374-995d8e6660a4
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DEFAULT_FLIGHT_ID=$VITE_DEFAULT_FLIGHT_ID
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS production
ENV BACKEND_UPSTREAM=http://backend:8000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
