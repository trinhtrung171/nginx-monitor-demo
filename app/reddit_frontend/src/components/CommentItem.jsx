import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowBigUp, ArrowBigDown, MessageSquare, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../AuthContext'
import { API, timeAgo, applyVote, getScore, myVote } from '../lib/utils'

function CommentItem({ comment, depth = 1, onReply, onAuthRequired, onAction, isMod }) {
  const { user } = useAuth()
  const [showReply, setShowReply] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localVotes, setLocalVotes] = useState(comment.votes ?? [])

  const handleVote = async (type) => {
    if (!user) { onAuthRequired?.(); return }
    const prev = localVotes; setLocalVotes(applyVote(localVotes, type, user.id))
    try { const res = await fetch(`${API}/comments/${comment.id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ type }) }); if (!res.ok) throw new Error('Vote failed') }
    catch { setLocalVotes(prev) }
  }

  const handleReplyClick = () => {
    if (!user) { onAuthRequired?.(); return }
    setShowReply(s => !s)
  }

  const submitReply = async () => {
    if (!replyText.trim()) return; setSubmitting(true)
    try {
      const res = await fetch(`${API}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': user.id }, body: JSON.stringify({ content: replyText, postId: comment.postId, parentId: comment.id }) })
      if (res.ok) { toast.success('Reply posted!'); setReplyText(''); setShowReply(false); onReply() }
    } catch { toast.error('Failed') } finally { setSubmitting(false) }
  }

  const my = myVote(localVotes, user?.id), score = getScore(localVotes)
  return (
    <div className={`comment-item depth-${Math.min(depth, 4)}`}>
      <div className="comment-vote-bar">
        <button className={`c-vote up ${my === 'UP' ? 'active-up' : ''}`} onClick={() => handleVote('UP')}><ArrowBigUp size={13} fill={my === 'UP' ? 'currentColor' : 'none'} strokeWidth={my === 'UP' ? 2 : 1.5} /></button>
        <span className={`c-score ${score > 0 ? 'pos' : score < 0 ? 'neg' : ''}`}>{score}</span>
        <button className={`c-vote down ${my === 'DOWN' ? 'active-down' : ''}`} onClick={() => handleVote('DOWN')}><ArrowBigDown size={13} fill={my === 'DOWN' ? 'currentColor' : 'none'} strokeWidth={my === 'DOWN' ? 2 : 1.5} /></button>
      </div>
      <div className="comment-body">
        <div className="comment-meta"><span className="c-author" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 16, height: 16, borderRadius: '50%', background: comment.author?.avatarUrl ? 'transparent' : (comment.author?.avatarColor ?? 'var(--primary)'), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>{comment.author?.avatarUrl ? <img src={comment.author.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : comment.author?.username?.[0]?.toUpperCase()}</span>u/{comment.author?.username}</span><span className="c-time">{timeAgo(comment.createdAt)}</span></div>
        <p className="c-content">{comment.content}</p>
        <div className="comment-actions">
          <button className="reply-btn" onClick={handleReplyClick}><MessageSquare size={11} /> Reply</button>
          {(user?.role === 'ADMIN' || user?.username === comment.author?.username || isMod) && (
            <>
              {user?.username === comment.author?.username && <button className="reply-btn" onClick={() => onAction?.('EDIT_COMMENT', comment)} style={{ color: 'var(--text-2)' }}>Edit</button>}
              <button className="reply-btn" onClick={() => onAction?.('DELETE_COMMENT', comment)} style={{ color: 'var(--red)' }}>Delete</button>
            </>
          )}
        </div>
        <AnimatePresence>
          {showReply && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="reply-box">
            <textarea autoFocus value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Your reply…" rows={3} />
            <div className="reply-actions">
              <button className="btn-cancel" onClick={() => setShowReply(false)}>Cancel</button>
              <button className="btn-post" disabled={submitting || !replyText.trim()} onClick={submitReply}><Send size={12} />{submitting ? '…' : 'Reply'}</button>
            </div>
          </motion.div>}
        </AnimatePresence>
        {comment.replies?.length > 0 && <div className="replies">{comment.replies.map(r => <CommentItem key={r.id} comment={{ ...r, postId: comment.postId }} depth={depth + 1} onReply={onReply} onAuthRequired={onAuthRequired} onAction={onAction} />)}</div>}
      </div>
    </div>
  )
}

export default CommentItem
