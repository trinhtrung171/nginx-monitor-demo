FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY . .

RUN mkdir -p public/uploads

EXPOSE 3001

CMD ["bun", "src/index.ts"]
