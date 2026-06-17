import type { PrismaClient } from "@prisma/client";

export async function addModeratorOp(
  db: PrismaClient,
  invalidateCache: (prefix: string) => void,
  subredditId: string,
  targetUserId: string
) {
  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) return null;

  await db.subreddit.update({
    where: { id: subredditId },
    data: { moderators: { connect: { id: target.id } } }
  });
  invalidateCache('subs:');
  return target;
}

export async function removeModeratorOp(
  db: PrismaClient,
  invalidateCache: (prefix: string) => void,
  subredditId: string,
  targetUserId: string
) {
  await db.subreddit.update({
    where: { id: subredditId },
    data: { moderators: { disconnect: { id: targetUserId } } }
  });
  invalidateCache('subs:');
}
