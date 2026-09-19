import { useEffect, useRef } from 'react'

/** 目前開啟中的 Modal 堆疊；巢狀開啟時只有最上層回應 Esc */
const modalStack = []

/**
 * Modal：通用對話框外框，只處理顯示與關閉行為，不知道任何行程邏輯。
 *
 * props:
 *  - title / description
 *  - onClose()
 *  - children  對話框內容
 */
function Modal({ title, description, onClose, children }) {
  const panelRef = useRef(null)

  // onClose 用 ref 保存，避免 prop 變動造成堆疊順序錯亂
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Esc 關閉，並鎖住背景捲動
  useEffect(() => {
    const token = {}
    modalStack.push(token)

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      // 巢狀時只關最上層，不會一次關掉整疊
      if (modalStack[modalStack.length - 1] !== token) return
      onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      const index = modalStack.indexOf(token)
      if (index !== -1) modalStack.splice(index, 1)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        // 只有點在背景（不是面板內）才關閉
        if (!panelRef.current?.contains(event.target)) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="-mr-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export default Modal
