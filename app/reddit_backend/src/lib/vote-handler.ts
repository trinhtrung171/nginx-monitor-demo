import { db, invalidateCache } from "../db";

export async function handleVote(
  userId: string,
  targetId: string,
  type: 'UP' | 'DOWN',
  targetType: 'post' | 'comment'
) {
  const isPost = targetType === 'post';
  const uniqueWhere = isPost
    ? { userId_postId: { userId, postId: targetId } }
    : { userId_commentId: { userId, commentId: targetId } };

  const existing = await db.vote.findUnique({ where: uniqueWhere });
  if (existing && existing.type === type) {
    await db.vote.delete({ where: uniqueWhere });
    if (isPost) invalidateCache('posts:');
    return { action: "removed" };
  }

  const createData = isPost
    ? { type, userId, postId: targetId }
    : { type, userId, commentId: targetId };

  const vote = await db.vote.upsert({
    where: uniqueWhere,
    update: { type },
    create: createData,
  });

  if (isPost) invalidateCache('posts:');
  return vote;
}
