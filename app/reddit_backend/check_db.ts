import { db } from './src/db';
async function main() {
  const posts = await db.post.findMany({ select: { id: true, mediaUrl: true, attachments: true, content: true }, orderBy: { createdAt: 'desc' }, take: 10 });
  console.log("Posts:");
  console.dir(posts, { depth: null });

  const users = await db.user.findMany({ select: { id: true, username: true, avatarUrl: true }, take: 10 });
  console.log("Users:");
  console.dir(users, { depth: null });
}
main().finally(() => process.exit(0));

