import React, { useRef } from 'react'

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
      <input ref={inp} type="file" accept={accept} multiple hidden onChange={(e) => { onFiles([...e.target.files]); e.target.value = '' }} />
    </>
  )
}

export function Empty({ children }) {
  return <p className="muted" style={{ padding: '14px 0' }}>{children}</p>
}

export function confirmDel(what) {
  return window.confirm(`Delete ${what}? This cannot be undone.`)
}
