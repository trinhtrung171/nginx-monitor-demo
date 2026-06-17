import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Image as ImageIcon, Video, Link as LinkIcon, FileText, Bold, Italic, Code, Hash, Quote, List, Minus, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import MarkdownRenderer from './MarkdownRenderer'
import AttachmentThumb from './components/AttachmentThumb'
import { insertAtCursor } from './lib/markdown-utils'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export default function CreatePostModal({ subreddits, joinedSubs, user, onClose, onSuccess }) {
  const [newPost, setNewPost] = useState({ title: '', content: '', subredditId: '' })
  const [attachments, setAttachments] = useState([]) // [{type, url, name, size}]
  const [linkInput, setLinkInput] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingIdx, setUploadingIdx] = useState(-1)
  const [preview, setPreview] = useState(false)
  const textareaRef = useRef(null)
  const imageRef = useRef(null)
  const videoRef = useRef(null)
  const fileRef = useRef(null)

  const uploadFile = async (file, type) => {
    const fd = new FormData(); fd.append('file', file)
    const tId = toast.loading('Uploading...')
    try {
      const r = await fetch(`${API}/upload`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error()
      toast.success('Uploaded!', { id: tId })
      return { type, url: d.url, name: file.name, size: file.size }
    } catch {
      toast.error('Upload failed', { id: tId })
      return null
    }
  }

  const handleFiles = async (files, type) => {
    for (const file of Array.from(files)) {
      setUploadingIdx(attachments.length)
      const att = await uploadFile(file, type)
      if (att) setAttachments(prev => [...prev, att])
      setUploadingIdx(-1)
    }
  }

  const addLink = () => {
    if (!linkInput.trim()) return
    let url = linkInput.trim()
    if (!url.startsWith('http')) url = 'https://' + url
    setAttachments(prev => [...prev, { type: 'LINK', url, name: url }])
    setLinkInput('')
    setShowLinkInput(false)
  }

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx))

  const toolbar = (before, after, defaultText, e) => {
    e.preventDefault()
    const ta = textareaRef.current
    if (!ta) return
    const { value, cursor } = insertAtCursor(ta, before, after, defaultText)
    setNewPost(p => ({ ...p, content: value }))
    setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor) }, 0)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!newPost.title.trim() || !newPost.subredditId) return
    setSubmitting(true)
    const tId = toast.loading('Posting...')
    try {
      const res = await fetch(`${API}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({
          title: newPost.title,
          content: newPost.content,
          subredditId: newPost.subredditId,
          attachments: attachments.length ? attachments : undefined
        })
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || 'Failed', { id: tId }); return }
      toast.success('Post created!', { id: tId })
      onSuccess()
      onClose()
    } catch { toast.error('Failed to connect', { id: tId }) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        className="modal modal-wide"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>Create Post</h3>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <form onSubmit={submit} className="modal-body">
          {/* Community select */}
          <select
            value={newPost.subredditId}
            onChange={e => setNewPost(p => ({ ...p, subredditId: e.target.value }))}
            required
          >
            <option value="">Choose a community *</option>
            {[...subreddits].sort((a, b) => (joinedSubs.has(b.name) ? 1 : 0) - (joinedSubs.has(a.name) ? 1 : 0))
              .map(s => <option key={s.id} value={s.id}>d/{s.name} {joinedSubs.has(s.name) ? '⭐' : ''}</option>)}
          </select>

          {/* Title */}
          <input
            type="text"
            placeholder="Title *"
            value={newPost.title}
            onChange={e => setNewPost(p => ({ ...p, title: e.target.value }))}
            required
            maxLength={300}
          />
          <small style={{ color: 'var(--text-2)', textAlign: 'right', display: 'block', marginTop: -6, marginBottom: 4 }}>{newPost.title.length}/300</small>

          {/* Markdown toolbar */}
          <div className="md-toolbar">
            <button type="button" className="md-tool" title="Bold (**text**)" onClick={e => toolbar('**', '**', 'bold text', e)}><Bold size={14}/></button>
            <button type="button" className="md-tool" title="Italic (*text*)" onClick={e => toolbar('*', '*', 'italic text', e)}><Italic size={14}/></button>
            <button type="button" className="md-tool" title="Inline code (`code`)" onClick={e => toolbar('`', '`', 'code', e)}><Code size={14}/></button>
            <button type="button" className="md-tool" title="Code block" onClick={e => toolbar('```\n', '\n```', 'code here', e)}><span style={{fontSize:11, fontFamily:'monospace'}}>{'<>'}</span></button>
            <div className="md-tool-sep"/>
            <button type="button" className="md-tool" title="Heading" onClick={e => toolbar('## ', '', 'Heading', e)}><Hash size={14}/></button>
            <button type="button" className="md-tool" title="Quote" onClick={e => toolbar('> ', '', 'quote', e)}><Quote size={14}/></button>
            <button type="button" className="md-tool" title="List" onClick={e => toolbar('- ', '', 'item', e)}><List size={14}/></button>
            <button type="button" className="md-tool" title="Divider" onClick={e => toolbar('\n---\n', '', '', e)}><Minus size={14}/></button>
            <div className="md-tool-sep"/>
            <button
              type="button"
              className={`md-tool ${preview ? 'active' : ''}`}
              title="Toggle preview"
              onClick={() => setPreview(p => !p)}
            ><Eye size={14}/></button>
          </div>

          {/* Content editor / preview */}
          {preview ? (
            <div className="md-preview-area">
              {newPost.content ? <MarkdownRenderer content={newPost.content} /> : <p style={{ color: 'var(--text-2)', fontStyle: 'italic' }}>Nothing to preview yet...</p>}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              placeholder="Write your post... (Markdown supported: **bold**, *italic*, `code`, ```blocks```, # headings, > quotes, - lists)"
              value={newPost.content}
              onChange={e => setNewPost(p => ({ ...p, content: e.target.value }))}
              rows={7}
              className="md-editor"
            />
          )}

          {/* Attachments preview strip */}
          {attachments.length > 0 && (
            <div className="att-preview-strip">
              {attachments.map((att, i) => <AttachmentThumb key={i} att={att} i={i} onRemove={removeAttachment} />)}
            </div>
          )}

          {/* Link input */}
          {showLinkInput && (
            <div className="attach-link-row">
              <input
                type="url"
                placeholder="https://..."
                value={linkInput}
                onChange={e => setLinkInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } if (e.key === 'Escape') setShowLinkInput(false) }}
                autoFocus
              />
              <button type="button" className="btn-post" onClick={addLink} style={{ padding: '8px 14px' }}>Add</button>
              <button type="button" className="btn-outline" onClick={() => setShowLinkInput(false)} style={{ padding: '8px 12px' }}><X size={14}/></button>
            </div>
          )}

          {/* Attach bar */}
          <div className="post-attach-bar">
            <label className="attach-btn" title="Add images">
              <ImageIcon size={15}/><span>Image</span>
              <input ref={imageRef} type="file" accept="image/*" hidden multiple onChange={e => handleFiles(e.target.files, 'IMAGE')} />
            </label>
            <label className="attach-btn" title="Add videos">
              <Video size={15}/><span>Video</span>
              <input ref={videoRef} type="file" accept="video/*" hidden multiple onChange={e => handleFiles(e.target.files, 'VIDEO')} />
            </label>
            <label className="attach-btn" title="Add files">
              <FileText size={15}/><span>File</span>
              <input ref={fileRef} type="file" hidden multiple onChange={e => handleFiles(e.target.files, 'FILE')} />
            </label>
            <button type="button" className="attach-btn" onClick={() => setShowLinkInput(s => !s)} title="Add link">
              <LinkIcon size={15}/><span>Link</span>
            </button>
            {uploadingIdx >= 0 && <span style={{ color: 'var(--text-2)', fontSize: 12 }}>Uploading...</span>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-post" disabled={submitting || !newPost.title.trim() || !newPost.subredditId}>
              {submitting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
