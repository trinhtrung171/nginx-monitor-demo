import { db as prisma } from "./db";

const SAMPLE_POSTS = [
  { title: 'Welcome to DevShare!', content: 'DevShare is your community hub for developers. Share ideas, vote on content, and connect with devs worldwide. Built with Bun, Elysia, Prisma and React.', sub: 'announcements' },
  { title: 'Getting started with DevShare', content: 'Just run run.bat and you are good to go! Make sure Docker Desktop is running first. The app starts at http://localhost:5173.', sub: 'announcements' },
  { title: 'Why TypeScript is a must in 2025', content: 'TypeScript has become the standard for large-scale JavaScript projects. Type safety, better tooling, and improved developer experience make it essential.', sub: 'typescript' },
  { title: 'Bun vs Node.js — Performance Comparison', content: 'Bun is significantly faster than Node.js in most benchmarks. Its built-in bundler, transpiler, and package manager make it a compelling all-in-one solution.', sub: 'webdev' },
];

async function main() {
  const existingUser = await prisma.user.findUnique({ where: { username: 'devshare_admin' } });
  const hashedPassword = existingUser ? existingUser.password : await Bun.password.hash('password123');
  const user = await prisma.user.upsert({
    where: { username: 'devshare_admin' },
    update: existingUser ? {} : { role: 'ADMIN', password: hashedPassword },
    create: {
      username: 'devshare_admin',
      email: 'admin@devshare.dev',
      password: hashedPassword,
      role: 'ADMIN',
    },
  })

  const subs = await Promise.all([
    prisma.subreddit.upsert({
      where: { name: 'announcements' },
      update: { description: 'The latest news and updates from DevShare' },
      create: { name: 'announcements', description: 'The latest news and updates from DevShare', creatorId: user.id, moderators: { connect: { id: user.id } } },
    }),
    prisma.subreddit.upsert({
      where: { name: 'webdev' },
      update: { description: 'Everything about web development' },
      create: { name: 'webdev', description: 'Everything about web development', creatorId: user.id, moderators: { connect: { id: user.id } } },
    }),
    prisma.subreddit.upsert({
      where: { name: 'typescript' },
      update: { description: 'TypeScript tips, tricks, and discussions' },
      create: { name: 'typescript', description: 'TypeScript tips, tricks, and discussions', creatorId: user.id, moderators: { connect: { id: user.id } } },
    }),
  ]);

  const subMap = Object.fromEntries(subs.map(s => [s.name, s.id]));

  for (const post of SAMPLE_POSTS) {
    const existing = await prisma.post.findFirst({
      where: { title: post.title, subredditId: subMap[post.sub] }
    });
    if (!existing) {
      await prisma.post.create({
        data: { title: post.title, content: post.content, authorId: user.id, subredditId: subMap[post.sub] },
      });
    }
  }

  console.log('DevShare seeding finished successfully.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
