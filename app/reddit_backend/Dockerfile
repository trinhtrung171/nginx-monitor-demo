FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY . .

RUN bunx prisma generate

EXPOSE 3001

CMD ["sh", "-c", "bunx prisma db push && bun src/index.ts"]
