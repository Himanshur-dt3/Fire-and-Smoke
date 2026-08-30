FROM node:20-alpine AS builder

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts

COPY . ./
RUN npm run build

FROM node:20-alpine AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app

RUN addgroup --system --gid 10001 dashboard \
    && adduser --system --uid 10001 --ingroup dashboard dashboard

COPY --from=builder --chown=dashboard:dashboard /app/.next/standalone ./
COPY --from=builder --chown=dashboard:dashboard /app/.next/static ./.next/static

USER dashboard

EXPOSE 3000

CMD ["sh", "-c", "test -n \"$BACKEND_INTERNAL_URL\" && node server.js"]
