import { db, invalidateCache } from "../db";

export async function toggleBookmark(userId: string, postId: string) {
  const existing = await db.bookmark.findUnique({
    where: { userId_postId: { userId, postId } }
  });

  if (existing) {
    await db.bookmark.delete({
      where: { userId_postId: { userId, postId } }
    });
    invalidateCache('posts:');
    return { saved: false };
  }

  await db.bookmark.create({
    data: { userId, postId }
  });
  invalidateCache('posts:');
  return { saved: true };
}
