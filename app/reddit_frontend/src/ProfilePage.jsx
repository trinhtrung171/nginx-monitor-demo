import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, MessageSquare, ArrowBigUp, Calendar, Award,
  FileText, Edit2, Check, X, LogOut, Palette, Upload, ExternalLink, Bookmark
} from 'lucide-react'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'
import MediaRenderer from './MediaRenderer'
import MarkdownRenderer from './MarkdownRenderer'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const timeAgo = (d) => {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const AVATAR_COLORS = [
  '#5C7CFA','#7950F2','#F06595','#FF6B6B','#FCC419',
  '#51CF66','#20C997','#15AABF','#339AF0','#F76707'
]

export default function ProfilePage({ username, onBack, onPostClick, onUsernameChange, onProfileSaved }) {
  const { user: me, login, updateUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('posts')
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({ newUsername: '', bio: '', avatarColor: '#5C7CFA', avatarUrl: '', bannerUrl: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [savedPosts, setSavedPosts] = useState([])
  const [savedLoading, setSavedLoading] = useState(false)

  const handleUpload = async (e, field) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    const toastId = toast.loading('Uploading...')
    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok && data.url) {
        setEditForm(f => ({ ...f, [field]: data.url }))
        toast.success('Uploaded!', { id: toastId })
      } else {
        toast.error('Upload failed', { id: toastId })
      }
    } catch {
      toast.error('Upload error', { id: toastId })
    } finally {
      setUploading(false)
    }
  }

  const fetchProfile = () => {
    setLoading(true)
    fetch(`${API}/auth/me/${username}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setLoading(false); return }
        setProfile(d)
        setEditForm({ newUsername: d.username, bio: d.bio ?? '', avatarColor: d.avatarColor ?? '#5C7CFA', avatarUrl: d.avatarUrl ?? '', bannerUrl: d.bannerUrl ?? '' })
        if (d.username !== username && onUsernameChange) {
          onUsernameChange(d.username)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchProfile() }, [username])

  const fetchSaved = async () => {
    if (!me?.id) return
    setSavedLoading(true)
    try {
      const res = await fetch(`${API}/posts/saved`, { headers: { 'x-user-id': me.id } })
      if (res.ok) setSavedPosts(await res.json())
    } catch {} finally { setSavedLoading(false) }
  }

  useEffect(() => { if (tab === 'saved') fetchSaved() }, [tab])

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/auth/me/${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': me?.id || '' },
        body: JSON.stringify(editForm)
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed'); return }
      
      // Always update local profile state
      setProfile(p => ({ ...p, ...data }))
      
      // Always sync AuthContext so navbar avatar/username update immediately
      if (isMe) {
        updateUser({
          username: data.username,
          bio: data.bio,
          avatarColor: data.avatarColor,
          avatarUrl: data.avatarUrl,
          bannerUrl: data.bannerUrl,
        })
      }
      
      // Handle username change navigation
      if (data.username !== username && onUsernameChange) {
        onUsernameChange(data.username)
      }

      setShowEdit(false)
      toast.success('Profile updated!')
      onProfileSaved?.()  // refresh posts in feed so avatars update
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="profile-loading">
      <div className="skeleton" style={{ height: 200, borderRadius: 16 }}/>
      <div className="skeleton" style={{ height: 80, borderRadius: 12, marginTop: 12 }}/>
      <div className="skeleton" style={{ height: 300, borderRadius: 12, marginTop: 12 }}/>
    </div>
  )

  if (!profile || profile.error) return (
    <div className="empty-feed">
      <p>User not found.</p>
      <button className="btn-outline" onClick={onBack}>Go back</button>
    </div>
  )

  const isMe = me?.username === username
  const joinDate = new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const avatarBg = profile.avatarColor ?? '#5C7CFA'

  const renderBio = (text) => {
    if (!text) return null;
    const parts = text.split(/(!\[.*?\]\(.*?\))/g);
    return parts.map((part, i) => {
      const match = part.match(/!\[(.*?)\]\((.*?)\)/);
      if (match) {
        return <img key={i} src={match[2]} alt={match[1]} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, margin: '8px 0', display: 'block', objectFit: 'contain' }} />;
      }
      return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>;
    });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="profile-view">

      {/* Back */}
      <button className="back-btn" onClick={onBack}><ArrowLeft size={15}/> Back</button>

      {/* Hero Card */}
      <div className="profile-hero-card">
        <div className="profile-banner-tall" style={{ 
          background: profile.bannerUrl ? `url(${profile.bannerUrl}) center/cover no-repeat` : `linear-gradient(135deg, ${avatarBg}cc, ${avatarBg}44)` 
        }}/>

        <div className="profile-hero-body">
          <div className="profile-avatar-lg" style={{ 
            background: profile.avatarUrl ? `url(${profile.avatarUrl}) center/cover no-repeat` : avatarBg 
          }}>
            {!profile.avatarUrl && profile.username[0].toUpperCase()}
          </div>

          <div className="profile-hero-info">
            <div className="profile-hero-top">
              <div>
                <h1 className="profile-username">u/{profile.username}</h1>
                {profile.bio && <div className="profile-bio">{renderBio(profile.bio)}</div>}
                {!profile.bio && isMe && <p className="profile-bio-empty">No bio yet — add one!</p>}
              </div>

              <div className="profile-hero-actions">
                {isMe && (
                  <button className="btn-edit-profile" onClick={() => setShowEdit(true)}>
                    <Edit2 size={14}/> Edit Profile
                  </button>
                )}
              </div>
            </div>

            <div className="profile-stats-row">
              <div className="stat-chip"><Award size={14}/><span>{profile.karma}</span><small>karma</small></div>
              <div className="stat-chip"><Calendar size={14}/><span>{joinDate}</span><small>joined</small></div>
              <div className="stat-chip"><FileText size={14}/><span>{profile._count?.posts ?? 0}</span><small>posts</small></div>
              <div className="stat-chip"><MessageSquare size={14}/><span>{profile._count?.comments ?? 0}</span><small>comments</small></div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tab-bar">
        <button className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>
          <FileText size={14}/> Posts
        </button>
        <button className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>
          <MessageSquare size={14}/> Comments
        </button>
        {isMe && (
          <button className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')}>
            <Bookmark size={14}/> Saved
          </button>
        )}
      </div>

      {/* Content */}
      <div className="profile-content">
        {tab === 'posts' && (
          profile.posts?.length === 0
            ? <div className="empty-feed"><FileText size={36}/><p>No posts yet.</p></div>
            : profile.posts?.map(post => (
              <div key={post.id} className="post-card profile-post" onClick={() => onPostClick(post)}>
                <div className="post-body">
                  <div className="post-meta">
                    <span className="sub-badge">d/{post.subreddit?.name}</span>
                    <span className="meta-dot">·</span>
                    <span className="meta-text">{timeAgo(post.createdAt)}</span>
                  </div>
                  <h3 className="post-title">{post.title}</h3>
                  {post.content && <div className="post-content-preview"><MarkdownRenderer content={post.content} compact /></div>}
                  <MediaRenderer post={post} isFeed={true} />
                  <div className="post-actions">
                    <span className="action-btn">
                      <ArrowBigUp size={14}/>
                      {(post.votes?.filter(v=>v.type==='UP').length ?? 0) - (post.votes?.filter(v=>v.type==='DOWN').length ?? 0)} votes
                    </span>
                    <span className="action-btn"><MessageSquare size={14}/> {post._count?.comments ?? 0} comments</span>
                  </div>
                </div>
              </div>
            ))
        )}
        {tab === 'comments' && (
          profile.comments?.length === 0
            ? <div className="empty-feed"><MessageSquare size={36}/><p>No comments yet.</p></div>
            : profile.comments?.map(c => (
              <div key={c.id} className="comment-preview-card" onClick={() => c.post && onPostClick(c.post)} style={{ cursor: c.post ? 'pointer' : 'default' }}>
                <div className="comment-preview-context">
                  <span className="sub-badge" style={{fontSize:11}}>d/{c.post?.subreddit?.name}</span>
                  <span className="meta-dot">·</span>
                  <span className="comment-preview-post-title">in <strong>{c.post?.title}</strong></span>
                  <span className="meta-dot">·</span>
                  <span className="meta-text">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="comment-preview-body">{c.content}</p>
              </div>
            ))
        )}
        {tab === 'saved' && (
          savedPosts.length === 0
            ? <div className="empty-feed"><Bookmark size={36}/><p>{savedLoading ? 'Loading...' : 'No saved posts yet.'}</p></div>
            : savedPosts.map(post => (
              <div key={post.id} className="post-card profile-post" onClick={() => onPostClick(post)}>
                <div className="post-body">
                  <div className="post-meta">
                    <span className="sub-badge">d/{post.subreddit?.name}</span>
                    <span className="meta-dot">·</span>
                    <span className="meta-text">{timeAgo(post.createdAt)}</span>
                  </div>
                  <h3 className="post-title">{post.title}</h3>
                  {post.content && <div className="post-content-preview"><MarkdownRenderer content={post.content} compact /></div>}
                  <MediaRenderer post={post} isFeed={true} />
                  <div className="post-actions">
                    <span className="action-btn">
                      <ArrowBigUp size={14}/>
                      {(post.votes?.filter(v=>v.type==='UP').length ?? 0) - (post.votes?.filter(v=>v.type==='DOWN').length ?? 0)} votes
                    </span>
                    <span className="action-btn"><MessageSquare size={14}/> {post._count?.comments ?? 0} comments</span>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEdit && (
          <div className="modal-backdrop" onClick={() => setShowEdit(false)}>
            <motion.div
              className="modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-head">
                <h3>Edit Profile</h3>
                <button onClick={() => setShowEdit(false)}><X size={18}/></button>
              </div>
              <div className="modal-body">
                <div className="field">
                  <label>Username</label>
                  <input
                    type="text"
                    value={editForm.newUsername}
                    onChange={e => setEditForm(f => ({ ...f, newUsername: e.target.value.trim() }))}
                    minLength={3}
                    maxLength={20}
                  />
                </div>

                <div className="field">
                  <label>Bio (Markdown supported: ![alt](url)) <small style={{opacity:.6}}>({editForm.bio.length}/1000)</small></label>
                  <textarea
                    placeholder="Tell people about yourself... You can use emojis or embed images using ![alt](image_url)"
                    value={editForm.bio}
                    onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))}
                    maxLength={1000}
                    rows={4}
                  />
                </div>

                <div className="field">
                  <label><Palette size={13} style={{marginRight: 4}}/> Avatar & Theme</label>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--surface-hover)', padding: '16px', borderRadius: '12px' }}>
                    <div className="avatar-preview" style={{ 
                      background: editForm.avatarUrl ? `url(${editForm.avatarUrl}) center/cover no-repeat` : editForm.avatarColor,
                      width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: 'bold', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                      {!editForm.avatarUrl && profile.username[0].toUpperCase()}
                    </div>
                    
                    <div style={{ flex: 1 }}>
                      <div className="color-picker-row" style={{ marginBottom: '12px' }}>
                        {AVATAR_COLORS.map(c => (
                          <button
                            key={c}
                            className={`color-swatch ${editForm.avatarColor === c ? 'selected' : ''}`}
                            style={{ background: c }}
                            onClick={(e) => { e.preventDefault(); setEditForm(f => ({ ...f, avatarColor: c })); }}
                          >
                            {editForm.avatarColor === c && <Check size={13} color="white" strokeWidth={3}/>}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <label className="btn-outline" style={{ cursor: 'pointer', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                          <Upload size={14}/> {uploading ? 'Uploading...' : (editForm.avatarUrl ? 'Change Avatar' : 'Upload Avatar')}
                          <input type="file" hidden accept="image/*" onChange={e => handleUpload(e, 'avatarUrl')} disabled={uploading}/>
                        </label>
                        {editForm.avatarUrl && (
                          <button type="button" className="btn-outline" onClick={() => setEditForm(f => ({...f, avatarUrl: ''}))} style={{ color: 'var(--red)', padding: '6px 12px', fontSize: '13px' }}>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="field">
                  <label>Profile Banner</label>
                  <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', position: 'relative', height: '120px', background: editForm.bannerUrl ? `url(${editForm.bannerUrl}) center/cover no-repeat` : 'var(--surface-hover)' }}>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: editForm.bannerUrl ? 'rgba(0,0,0,0.3)' : 'transparent', gap: '8px' }}>
                       <label className="btn-outline" style={{ cursor: 'pointer', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface)', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                         <Upload size={14}/> {editForm.bannerUrl ? 'Change Banner' : 'Upload Banner'}
                         <input type="file" hidden accept="image/*" onChange={e => handleUpload(e, 'bannerUrl')} disabled={uploading}/>
                       </label>
                       {editForm.bannerUrl && (
                         <button type="button" className="btn-outline" onClick={() => setEditForm(f => ({...f, bannerUrl: ''}))} style={{ background: 'var(--surface)', color: 'var(--red)', padding: '8px 16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                           Remove
                         </button>
                       )}
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="btn-outline" onClick={() => setShowEdit(false)}>Cancel</button>
                  <button className="btn-post" onClick={saveProfile} disabled={saving}>
                    {saving ? 'Saving…' : <><Check size={14}/> Save Changes</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
