import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { MessageSquare, Share2, Bookmark } from 'lucide-react'
import { useAuth } from '../AuthContext'
import VoteButtons from './VoteButtons'
import MediaRenderer from '../MediaRenderer'
import { API, timeAgo, applyVote } from '../lib/utils'

function PostCard({ post: init, onClick, onAuthRequired, onAction, onUserClick }) {
  const { user } = useAuth()
  const [post, setPost] = useState(init)
  useEffect(() => setPost(init), [init])
  const invalidateCache = () => {
    const cached = sessionStorage.getItem('ds:posts')
    if (cached) {
      const posts = JSON.parse(cached)
      const idx = posts.findIndex(p => p.id === post.id)
      if (idx !== -1) posts[idx] = { ...posts[idx], bookmarks: post.bookmarks }
      sessionStorage.setItem('ds:posts', JSON.stringify(posts))
    }
  }
  const handleVote = async (type) => {
    const prev = post.votes; setPost(p => ({ ...p, votes: applyVote(p.votes, type, user?.id) }))
    try { const res = await fetch(`${API}/posts/${post.id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id }, body: JSON.stringify({ type }) }); if (!res.ok) throw new Error('Vote failed') }
    catch { setPost(p => ({ ...p, votes: prev })); toast.error('Vote failed') }
  }
  const handleSave = async (e) => {
    e.stopPropagation()
    if (!user) { onAuthRequired?.(); return }
    const prev = post.bookmarks
    const isSaved = post.bookmarks?.some(b => b.userId === user.id)
    setPost(p => ({ ...p, bookmarks: isSaved ? p.bookmarks.filter(b => b.userId !== user.id) : [...(p.bookmarks || []), { userId: user.id }] }))
    try {
      const res = await fetch(`${API}/posts/${post.id}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id } })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.saved) { toast.success('Saved!'); invalidateCache() }
      else { toast('Removed'); invalidateCache() }
    } catch { setPost(p => ({ ...p, bookmarks: prev })); toast.error('Failed to save') }
  }

  const isSaved = post.bookmarks?.some(b => b.userId === user?.id)

  return (
    <motion.div className="post-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -1 }} layout>
      <VoteButtons votes={post.votes} onVote={handleVote} onAuthRequired={onAuthRequired} />
      <div className="post-body" onClick={onClick}>
        <div className="post-meta"><span className="sub-badge">d/{post.subreddit?.name}</span><span className="meta-dot">·</span><span className="meta-user" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={e => { e.stopPropagation(); onUserClick?.(post.author?.username) }}><span style={{ width: 16, height: 16, borderRadius: '50%', background: post.author?.avatarUrl ? 'transparent' : (post.author?.avatarColor ?? 'var(--primary)'), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>{post.author?.avatarUrl ? <img src={post.author.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : post.author?.username?.[0]?.toUpperCase()}</span>u/{post.author?.username}</span><span className="meta-dot">·</span><span className="meta-text">{timeAgo(post.createdAt)}</span></div>
        <h3 className="post-title">{post.title}</h3>
        {post.content && <p className="post-excerpt">{post.content}</p>}
        <MediaRenderer post={post} isFeed={true} />
        {post.communityNote && (
          <div className="community-note">
            <strong>Community Note:</strong> {post.communityNote}
          </div>
        )}
        <div className="post-actions">
          <button className="action-btn" onClick={e => { e.stopPropagation(); onClick() }}><MessageSquare size={13} />{post._count?.comments ?? 0} Comments</button>
          <button className="action-btn" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}#/post/${post.id}`); toast.success('Link copied!') }}><Share2 size={13} /> Share</button>
          <button className={`action-btn ${isSaved ? 'saved' : ''}`} onClick={handleSave}><Bookmark size={13} fill={isSaved ? 'currentColor' : 'none'} /> {isSaved ? 'Saved' : 'Save'}</button>
          <button className="action-btn" onClick={e => { e.stopPropagation(); if (!user) { onAuthRequired?.(); return } onAction('REPORT', post) }} style={{ color: 'var(--red)' }}>Report</button>
          {user?.role === 'ADMIN' && (
            <>
              <button className="action-btn" onClick={e => { e.stopPropagation(); onAction('DELETE', post) }} style={{ color: 'var(--red)' }}>Delete</button>
              <button className="action-btn" onClick={e => { e.stopPropagation(); onAction('NOTE', post) }} style={{ color: 'var(--primary)' }}>Add Note</button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default PostCard
