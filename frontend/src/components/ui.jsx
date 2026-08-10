/**
 * ui.jsx — Tiny shared UI pieces used by several screens.
 */
import React, { useRef } from 'react'

/**
 * Drop — a drag & drop upload zone (also opens the file picker on click).
 * Props: label (text inside), accept (file types), onFiles(files[]) callback.
 */
export function Drop({ label, accept, onFiles }) {
  const inp = useRef(null)
  return (
    <>
      <div
        className="drop"
        onClick={() => inp.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over') }}
        onDragLeave={(e) => e.currentTarget.classList.remove('over')}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); onFiles([...e.dataTransfer.files]) }}
      >
        {label}
      </div>
      {/* hidden real input; value reset so the same file can be picked twice */}
      <input ref={inp} type="file" accept={accept} multiple hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = '' }} />
    </>
  )
}

// Empty — muted placeholder text when a list has no items yet.
export function Empty({ children }) {
  return <p className="muted" style={{ padding: '14px 0' }}>{children}</p>
}

// confirmDel — one-line delete confirmation, used before destructive actions.
export function confirmDel(what) {
  return window.confirm(`Delete ${what}? This cannot be undone.`)
}
