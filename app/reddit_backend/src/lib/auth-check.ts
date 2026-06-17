import type { PrismaClient } from "@prisma/client";

export async function requireAuth(db: PrismaClient, headers: Record<string, string | null>, set: any) {
  const userId = headers["x-user-id"];
  if (!userId) { set.status = 401; return null; }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) { set.status = 401; return null; }
  return user;
}
