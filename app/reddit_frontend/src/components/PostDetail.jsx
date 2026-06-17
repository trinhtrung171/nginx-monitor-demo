import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { ArrowLeft, MessageSquare, Share2, Bookmark, Send, LogIn } from 'lucide-react'
import { useAuth } from '../AuthContext'
import VoteButtons from './VoteButtons'
import CommentItem from './CommentItem'
import MediaRenderer from '../MediaRenderer'
import MarkdownRenderer from '../MarkdownRenderer'
import { API, timeAgo, applyVote } from '../lib/utils'

function PostDetail({ post: init, onBack, onAuthRequired, onAction, onUserClick }) {
  const { user } = useAuth()
  const [post, setPost] = useState(init)
  const isMod = post?.subreddit?.moderators?.some(m => m.id === user?.id) ?? false
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fetch2 = useCallback(async () => { try { const r = await fetch(`${API}/comments/post/${post.id}`); if (r.ok) setComments(await r.json()) } catch { } }, [post.id])
  useEffect(() => { fetch2() }, [fetch2])
  const handleVote = async (type) => {
    const prev = post.votes; setPost(p => ({ ...p, votes: applyVote(p.votes, type, user?.id) }))
    try { const res = await fetch(`${API}/posts/${post.id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id }, body: JSON.stringify({ type }) }); if (!res.ok) throw new Error('Vote failed') }
    catch { setPost(p => ({ ...p, votes: prev })); toast.error('Vote failed') }
  }
  const handleCommentFocus = () => {
    if (!user) { onAuthRequired?.(); return }
  }
  const submitComment = async () => {
    if (!user) { onAuthRequired?.(); return }
    if (!commentText.trim()) return; setSubmitting(true)
    try { const r = await fetch(`${API}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ content: commentText, postId: post.id }) }); if (r.ok) { toast.success('Commented!'); setCommentText(''); fetch2(); setPost(p => ({ ...p, _count: { ...p._count, comments: (p._count?.comments ?? 0) + 1 } })) } }
    catch { toast.error('Failed') } finally { setSubmitting(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="post-detail-view">
      <button className="back-btn" onClick={() => onBack(post)}><ArrowLeft size={15} /> Back</button>
      <div className="post-card detail-card">
        <VoteButtons votes={post.votes} onVote={handleVote} onAuthRequired={onAuthRequired} />
        <div className="post-body">
          <div className="post-meta"><span className="sub-badge">d/{post.subreddit?.name}</span><span className="meta-dot">·</span><span className="meta-user" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={e => { e.stopPropagation(); onUserClick?.(post.author?.username) }}><span style={{ width: 16, height: 16, borderRadius: '50%', background: post.author?.avatarUrl ? 'transparent' : (post.author?.avatarColor ?? 'var(--primary)'), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>{post.author?.avatarUrl ? <img src={post.author.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : post.author?.username?.[0]?.toUpperCase()}</span>u/{post.author?.username}</span><span className="meta-dot">·</span><span className="meta-text">{timeAgo(post.createdAt)}</span></div>
          <h1 className="post-title" style={{ fontSize: 24, margin: '0 0 16px 0', color: 'var(--text)', lineHeight: 1.3 }}>{post.title}</h1>
          {post.content && <div style={{ marginBottom: 16 }}><MarkdownRenderer content={post.content} /></div>}

          <MediaRenderer post={post} />

          {post.communityNote && (
            <div className="community-note">
              <strong>Community Note:</strong> {post.communityNote}
            </div>
          )}
          <div className="post-actions">
            <button className="action-btn" onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}#/post/${post.id}`); toast.success('Link copied!') }}><Share2 size={13} /> Share</button>
            <button className={`action-btn ${post.bookmarks?.some(b => b.userId === user?.id) ? 'saved' : ''}`} onClick={async (e) => { e.stopPropagation(); if (!user) { onAuthRequired?.(); return } const prev = post.bookmarks; const isSaved = post.bookmarks?.some(b => b.userId === user.id); setPost(p => ({ ...p, bookmarks: isSaved ? p.bookmarks.filter(b => b.userId !== user.id) : [...(p.bookmarks || []), { userId: user.id }] })); try { const res = await fetch(`${API}/posts/${post.id}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id } }); if (!res.ok) throw new Error(); const data = await res.json(); if (data.saved) toast.success('Saved!'); else toast('Removed'); const cached = sessionStorage.getItem('ds:posts'); if (cached) { const posts = JSON.parse(cached); const idx = posts.findIndex(p => p.id === post.id); if (idx !== -1) posts[idx] = { ...posts[idx], bookmarks: post.bookmarks }; sessionStorage.setItem('ds:posts', JSON.stringify(posts)) } } catch { setPost(p => ({ ...p, bookmarks: prev })); toast.error('Failed to save') } }}><Bookmark size={13} fill={post.bookmarks?.some(b => b.userId === user?.id) ? 'currentColor' : 'none'} /> {post.bookmarks?.some(b => b.userId === user?.id) ? 'Saved' : 'Save'}</button>
            <button className="action-btn" onClick={e => { e.stopPropagation(); if (!user) { onAuthRequired?.(); return } onAction('REPORT', post) }} style={{ color: 'var(--red)' }}>Report</button>
            {(user?.role === 'ADMIN' || user?.username === post.author?.username) && (
              <>
                <button className="action-btn" onClick={e => { e.stopPropagation(); onAction('EDIT_POST', post) }} style={{ color: 'var(--text-2)' }}>Edit</button>
                <button className="action-btn" onClick={e => { e.stopPropagation(); onAction('DELETE', post) }} style={{ color: 'var(--red)' }}>Delete</button>
              </>
            )}
            {user?.role === 'ADMIN' && (
              <button className="action-btn" onClick={e => { e.stopPropagation(); onAction('NOTE', post) }} style={{ color: 'var(--primary)' }}>Add Note</button>
            )}
          </div>
        </div>
      </div>
      <div className="comments-panel">
        <h4 className="comments-heading">{post._count?.comments ?? 0} Comments</h4>
        {!user
          ? <div className="auth-prompt" onClick={onAuthRequired}><LogIn size={16} /> Log in to comment and vote</div>
          : <div className="comment-compose">
            <textarea value={commentText} onChange={e => setCommentText(e.target.value)} onFocus={handleCommentFocus} placeholder="Share your thoughts…" rows={4} />
            <div className="compose-actions">
              <span className="char-count">{commentText.length} chars</span>
              <button className="btn-post" onClick={submitComment} disabled={submitting || !commentText.trim()}><Send size={13} />{submitting ? 'Posting…' : 'Comment'}</button>
            </div>
          </div>
        }
        {comments.length === 0
          ? <div className="empty-comments"><MessageSquare size={34} /><p>No comments yet.</p></div>
          : <div className="comment-list">{comments.map(c => <CommentItem key={c.id} comment={{ ...c, postId: post.id }} onReply={fetch2} onAuthRequired={onAuthRequired} onAction={onAction} isMod={isMod} />)}</div>
        }
      </div>
    </motion.div>
  )
}

export default PostDetail
