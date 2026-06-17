export function insertAtCursor(textarea, before, after = '', defaultText = '') {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = textarea.value.slice(start, end) || defaultText
  const newText = textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end)
  return { value: newText, cursor: start + before.length + selected.length + after.length }
}
