import type { PrismaClient } from "@prisma/client";

export async function listMembers(
  db: PrismaClient,
  sub: {
    creator: { id: string; username: string; avatarColor: string | null; avatarUrl: string | null } | null;
    moderators: { id: string; username: string; avatarColor: string | null; avatarUrl: string | null }[];
    subscribers: {
      createdAt: Date;
      user: { id: string; username: string; avatarColor: string | null; avatarUrl: string | null; karma: number };
    }[];
  }
) {
  const modIds = new Set(sub.moderators.map(m => m.id));
  const members = sub.subscribers.map(s => ({
    ...s.user,
    role: s.user.id === sub.creator?.id ? 'OWNER' : modIds.has(s.user.id) ? 'MODERATOR' : 'MEMBER',
    joinedAt: s.createdAt
  }));
  members.sort((a, b) => a.role === 'OWNER' ? -1 : b.role === 'OWNER' ? 1 : 0);
  return members;
}
