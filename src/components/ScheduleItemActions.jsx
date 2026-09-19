import { useEffect, useRef } from 'react'

const MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors'

/**
 * ScheduleItemActions：卡片右上角的「⋮」操作選單。
 *
 * 正式行程與子行程共用。卡片上只留主要內容，管理操作（編輯／刪除）收在這裡，
 * 所以點主要內容的既有行為（選取 / 聚焦）不會被操作按鈕佔掉版面或誤觸。
 *
 * 開關狀態由 Schedule 保管（openMenuId），因此同時最多只有一個選單打開；
 * 點另一張卡片的 ⋮ 會自動關掉前一個。
 *
 * 本元件是拖曳把手與主要內容按鈕的「兄弟節點」，不巢狀在它們裡面，
 * 事件也不會往上冒泡到卡片，所以 ⋮ 與選單項目都不會觸發選取／聚焦／展開收合。
 *
 * props:
 *  - name          用於無障礙名稱（例如「更多操作：淺草」）
 *  - isOpen        由 Schedule 決定
 *  - onOpenChange(open)
 *  - actions       [{ key, label, tone, onSelect }]
 */
function ScheduleItemActions({ name, isOpen, onOpenChange, actions }) {
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const firstItemRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    // 點選單以外的任何地方就關閉；用 pointerdown 才能在點擊生效前先收起來
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) onOpenChange(false)
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      onOpenChange(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    // preventScroll：開選單不應該讓行程清單自己捲動
    firstItemRef.current?.focus({ preventScroll: true })

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onOpenChange])

  const runAction = (action) => {
    onOpenChange(false)
    action.onSelect()
  }

  return (
    <span ref={containerRef} className="relative shrink-0">
      {/* 視覺上是一個小小的 ⋮，實際觸控區域 44×44，但不撐高卡片 */}
      <button
        type="button"
        ref={triggerRef}
        onClick={() => onOpenChange(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`更多操作：${name}`}
        title="更多操作"
        className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 ${
          isOpen ? 'bg-slate-100 text-slate-600' : ''
        }`}
      >
        <span aria-hidden="true" className="text-base leading-none">⋮</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={`${name} 的操作`}
          className="absolute right-1 top-11 z-30 min-w-[7.5rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {actions.map((action, index) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              ref={index === 0 ? firstItemRef : undefined}
              onClick={() => runAction(action)}
              className={`${MENU_ITEM_CLASS} ${
                action.tone === 'danger'
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

export default ScheduleItemActions
