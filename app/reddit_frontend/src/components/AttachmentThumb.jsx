import React from 'react'
import { X, Link as LinkIcon, FileText } from 'lucide-react'

function AttachmentThumb({ att, i, onRemove }) {
  const isImage = att.type === 'IMAGE'
  const isVideo = att.type === 'VIDEO'
  return (
    <div className="att-preview-chip">
      {isImage && <img src={att.url} alt="" className="att-thumb" />}
      {isVideo && <video src={att.url} className="att-thumb" muted />}
      {!isImage && !isVideo && (
        <div className="att-chip-icon">{att.type === 'LINK' ? <LinkIcon size={14}/> : <FileText size={14}/>}</div>
      )}
      <span className="att-chip-name">{att.name?.split('/').pop()?.slice(0, 24) || att.type}</span>
      <button className="att-chip-remove" onClick={() => onRemove(i)}><X size={12}/></button>
    </div>
  )
}

export default AttachmentThumb
