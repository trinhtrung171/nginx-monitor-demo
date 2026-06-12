import React, { useState } from 'react'

// Inline markdown renderer supporting:
// **bold**, *italic*, `code`, ```code blocks```, # headings, > blockquote,
// - lists, [link](url), ![img](url), ~~strikethrough~~, ==highlight==
export default function MarkdownRenderer({ content, compact = false }) {
  if (!content) return null

  // Parse inline elements within a line
  const parseInline = (text) => {
    const tokens = []
    let i = 0
    while (i < text.length) {
      // Code inline `...`
      if (text[i] === '`' && text[i + 1] !== '`') {
        const end = text.indexOf('`', i + 1)
        if (end !== -1) {
          tokens.push(<code key={i} className="md-inline-code">{text.slice(i + 1, end)}</code>)
          i = end + 1; continue
        }
      }
      // Bold+Italic ***
      if (text.startsWith('***', i)) {
        const end = text.indexOf('***', i + 3)
        if (end !== -1) {
          tokens.push(<strong key={i}><em>{parseInline(text.slice(i + 3, end))}</em></strong>)
          i = end + 3; continue
        }
      }
      // Bold **
      if (text.startsWith('**', i)) {
        const end = text.indexOf('**', i + 2)
        if (end !== -1) {
          tokens.push(<strong key={i}>{parseInline(text.slice(i + 2, end))}</strong>)
          i = end + 2; continue
        }
      }
      // Italic *
      if (text[i] === '*' && text[i + 1] !== '*') {
        const end = text.indexOf('*', i + 1)
        if (end !== -1 && text[end + 1] !== '*') {
          tokens.push(<em key={i}>{parseInline(text.slice(i + 1, end))}</em>)
          i = end + 1; continue
        }
      }
      // Strikethrough ~~
      if (text.startsWith('~~', i)) {
        const end = text.indexOf('~~', i + 2)
        if (end !== -1) {
          tokens.push(<del key={i}>{parseInline(text.slice(i + 2, end))}</del>)
          i = end + 2; continue
        }
      }
      // Highlight ==
      if (text.startsWith('==', i)) {
        const end = text.indexOf('==', i + 2)
        if (end !== -1) {
          tokens.push(<mark key={i} className="md-highlight">{parseInline(text.slice(i + 2, end))}</mark>)
          i = end + 2; continue
        }
      }
      // Image ![alt](url)
      if (text[i] === '!' && text[i + 1] === '[') {
        const altEnd = text.indexOf(']', i + 2)
        if (altEnd !== -1 && text[altEnd + 1] === '(') {
          const urlEnd = text.indexOf(')', altEnd + 2)
          if (urlEnd !== -1) {
            const alt = text.slice(i + 2, altEnd)
            const url = text.slice(altEnd + 2, urlEnd)
            const sanitized = /^(https?:\/\/)/i.test(url) ? url : 'about:blank'
            tokens.push(<img key={i} src={sanitized} alt={alt} className="md-inline-img" />)
            i = urlEnd + 1; continue
          }
        }
      }
      // Link [text](url)
      if (text[i] === '[') {
        const labelEnd = text.indexOf(']', i + 1)
        if (labelEnd !== -1 && text[labelEnd + 1] === '(') {
          const urlEnd = text.indexOf(')', labelEnd + 2)
          if (urlEnd !== -1) {
            const label = text.slice(i + 1, labelEnd)
            const url = text.slice(labelEnd + 2, urlEnd)
            const sanitized = /^(https?:\/\/)/i.test(url) ? url : 'about:blank'
            tokens.push(<a key={i} href={sanitized} target="_blank" rel="noreferrer" className="md-link">{label}</a>)
            i = urlEnd + 1; continue
          }
        }
      }
      // Accumulate plain text
      const start = i
      while (i < text.length && !['*', '`', '[', '!', '~', '='].includes(text[i])) i++
      if (i === start) i++
      tokens.push(text.slice(start, i))
    }
    return tokens
  }

  const renderBlock = (block, idx) => {
    // Fenced code block ```lang\n...\n```
    if (block.type === 'code') {
      return (
        <div key={idx} className="md-code-block">
          {block.lang && <div className="md-code-lang">{block.lang}</div>}
          <pre><code>{block.content}</code></pre>
        </div>
      )
    }
    if (block.type === 'blockquote') {
      return <blockquote key={idx} className="md-blockquote">{block.lines.map((l, i) => <div key={i}>{parseInline(l)}</div>)}</blockquote>
    }
    if (block.type === 'heading') {
      const Tag = `h${block.level}`
      return <Tag key={idx} className={`md-h${block.level}`}>{parseInline(block.text)}</Tag>
    }
    if (block.type === 'hr') return <hr key={idx} className="md-hr" />
    if (block.type === 'ul') {
      return <ul key={idx} className="md-ul">{block.items.map((item, i) => <li key={i}>{parseInline(item)}</li>)}</ul>
    }
    if (block.type === 'ol') {
      return <ol key={idx} className="md-ol">{block.items.map((item, i) => <li key={i}>{parseInline(item)}</li>)}</ol>
    }
    if (block.type === 'paragraph') {
      if (compact) return <span key={idx}>{parseInline(block.text)} </span>
      return <p key={idx} className="md-p">{parseInline(block.text)}</p>
    }
    return null
  }

  // Parse content into blocks
  const lines = content.split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.replace(/^```/, '').trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]); i++
      }
      blocks.push({ type: 'code', lang, content: codeLines.join('\n') })
      i++; continue
    }
    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] })
      i++; continue
    }
    // HR
    if (/^[-*_]{3,}$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i++; continue
    }
    // Blockquote
    if (line.startsWith('>')) {
      const bqLines = []
      while (i < lines.length && lines[i].startsWith('>')) {
        bqLines.push(lines[i].replace(/^>\s?/, '')); i++
      }
      blocks.push({ type: 'blockquote', lines: bqLines }); continue
    }
    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, '')); i++
      }
      blocks.push({ type: 'ul', items }); continue
    }
    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, '')); i++
      }
      blocks.push({ type: 'ol', items }); continue
    }
    // Empty line → skip
    if (!line.trim()) { i++; continue }
    // Paragraph
    const paraLines = []
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].startsWith('>') && !/^[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !lines[i].trimStart().startsWith('```') && !/^[-*_]{3,}$/.test(lines[i].trim())) {
      paraLines.push(lines[i]); i++
    }
    if (paraLines.length) blocks.push({ type: 'paragraph', text: paraLines.join(' ') })
  }

  return <div className="md-body">{blocks.map(renderBlock)}</div>
}
