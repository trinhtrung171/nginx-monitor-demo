export const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function getScore(votes = []) {
  return votes.reduce((a, v) => a + (v.type === 'UP' ? 1 : -1), 0)
}

export function myVote(votes, uid) {
  return votes?.find(v => v.userId === uid)?.type ?? null
}

export function applyVote(votes, type, uid) {
  if (!uid) return votes
  const ex = votes.find(v => v.userId === uid)
  if (ex?.type === type) return votes.filter(v => v.userId !== uid)
  return [...votes.filter(v => v.userId !== uid), { type, userId: uid }]
}
