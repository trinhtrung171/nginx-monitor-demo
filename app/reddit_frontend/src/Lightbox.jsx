import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react'

export default function Lightbox({ items, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef(null) // { startX, startY, startOffsetX, startOffsetY }
  const isDragging = useRef(false)

  const current = items[idx]
  const isImage = current?.type === 'IMAGE' || /\.(gif|jpe?g|png|webp|svg|bmp)(\?|$)/i.test(current?.url || '')
  const isVideo = current?.type === 'VIDEO' || /\.(mp4|webm|mov|avi)(\?|$)/i.test(current?.url || '')

  // Reset zoom/pan when switching items
  useEffect(() => { setZoom(1); setOffset({ x: 0, y: 0 }) }, [idx])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Keyboard nav
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, items.length - 1))
    if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0))
    if (e.key === '+' || e.key === '=') setZoom(z => Math.min(4, z + 0.25))
    if (e.key === '-') setZoom(z => Math.max(1, z - 0.25))
  }, [items.length, onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // Pan handlers (only when zoomed)
  const onMouseDown = (e) => {
    if (zoom <= 1) return
    e.preventDefault()
    isDragging.current = false
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y }
  }
  const onMouseMove = (e) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true
    setOffset({ x: dragRef.current.startOffsetX + dx, y: dragRef.current.startOffsetY + dy })
  }
  const onMouseUp = () => { dragRef.current = null }

  // Backdrop click: only close if not dragging
  const handleBackdropClick = (e) => {
    if (isDragging.current) { isDragging.current = false; return }
    if (e.target === e.currentTarget) onClose()
  }

  // Double-click to toggle zoom
  const handleDoubleClick = (e) => {
    e.stopPropagation()
    setZoom(z => z > 1 ? 1 : 2)
    if (zoom > 1) setOffset({ x: 0, y: 0 })
  }

  const prev = () => setIdx(i => Math.max(i - 1, 0))
  const next = () => setIdx(i => Math.min(i + 1, items.length - 1))
  const thumbsRef = useRef(null)
  const activeThumbRef = useRef(null)

  useEffect(() => {
    if (activeThumbRef.current && thumbsRef.current) {
      thumbsRef.current.scrollTo({ left: activeThumbRef.current.offsetLeft - thumbsRef.current.clientWidth / 2 + 28, behavior: 'smooth' })
    }
  }, [idx])

  return (
    <motion.div
      className="lightbox-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* Backdrop — clicking the black area closes */}
      <div className="lightbox-backdrop" onClick={handleBackdropClick}>

        {/* Top bar — stops propagation so clicks here don't close */}
        <div className="lightbox-topbar" onClick={e => e.stopPropagation()}>
          <span className="lightbox-counter">{idx + 1} / {items.length}</span>
          <div className="lightbox-controls">
            {isImage && (
              <>
                <button className="lb-btn" onClick={() => setZoom(z => Math.max(1, z - 0.25))}><ZoomOut size={17}/></button>
                <span className="lb-zoom">{Math.round(zoom * 100)}%</span>
                <button className="lb-btn" onClick={() => setZoom(z => Math.min(4, z + 0.25))}><ZoomIn size={17}/></button>
              </>
            )}
            <a className="lb-btn" href={current?.url} download target="_blank" rel="noreferrer"><Download size={17}/></a>
            <button className="lb-btn lb-close" onClick={onClose}><X size={19}/></button>
          </div>
        </div>

        {/* Stage area — clicking the dark padding around media closes */}
        <div className="lightbox-stage" onClick={handleBackdropClick}>

          {/* Prev arrow */}
          {items.length > 1 && (
            <button className="lb-nav lb-prev" disabled={idx === 0}
              onClick={e => { e.stopPropagation(); prev() }}>
              <ChevronLeft size={26}/>
            </button>
          )}

          {/* Media container */}
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
              onClick={handleBackdropClick}
            >
              <div
                className="lightbox-media-wrap"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  cursor: zoom > 1 ? 'grab' : 'default',
                }}
                onClick={e => e.stopPropagation()}
                onMouseDown={onMouseDown}
                onDoubleClick={handleDoubleClick}
              >
                {isImage && (
                  <img
                    src={current.url}
                    alt={current.name || ''}
                    className="lightbox-img"
                    draggable={false}
                  />
                )}
                {isVideo && (
                  <video src={current.url} controls autoPlay className="lightbox-video" onClick={e => e.stopPropagation()} />
                )}
                {!isImage && !isVideo && (
                  <div className="lightbox-file-view" onClick={e => e.stopPropagation()}>
                    <div className="lightbox-file-icon">📄</div>
                    <p className="lightbox-file-name">{current.name || 'File'}</p>
                    <a href={current.url} download className="btn-post" style={{ marginTop: 16 }}>Download</a>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Next arrow */}
          {items.length > 1 && (
            <button className="lb-nav lb-next" disabled={idx === items.length - 1}
              onClick={e => { e.stopPropagation(); next() }}>
              <ChevronRight size={26}/>
            </button>
          )}
        </div>

        {/* Thumbnail strip */}
        {items.length > 1 && (
          <div className="lightbox-thumbs" onClick={e => e.stopPropagation()} ref={thumbsRef}>
            {items.map((item, i) => (
              <button key={i} ref={i === idx ? activeThumbRef : null} className={`lb-thumb ${i === idx ? 'active' : ''}`} onClick={() => setIdx(i)}>
                {(item.type === 'IMAGE' || /\.(gif|jpe?g|png|webp|svg)(\?|$)/i.test(item.url || ''))
                  ? <img src={item.url} alt="" />
                  : <div className="lb-thumb-icon">{item.type === 'VIDEO' ? '▶' : '📄'}</div>
                }
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
