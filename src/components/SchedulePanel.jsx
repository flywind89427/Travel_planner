import { useEffect, useRef } from 'react'

/**
 * SchedulePanel：浮在地圖上的底部行程面板（Map-first Phase 2）。
 *
 * 三段式狀態，點擊把手循環切換：
 *   collapsed → peek → expanded → collapsed
 *
 * 狀態由上層持有（受控元件），因為「在 expanded 點行程要先降回 peek」
 * 這個規則需要與選取行為排序，必須由 App 統一調度。
 *
 * 只負責外框、把手與捲動容器，不知道行程資料、不修改 trip。
 *
 * 手勢（Phase 6，僅 <1024px）：只有把手可以拖曳 Sheet，放手後吸附到三段式狀態之一。
 * 內容區維持一般捲動，ScheduleItem 的拖曳排序完全不受影響 —— 三者互不重疊。
 *
 * 面板會把自己的實際尺寸寫進 CSS 變數，讓地圖能算出
 * 「沒有被面板遮住的可視區域」（Phase 3 / Phase 4）：
 *   --tp-panel-current-h：面板高度
 *   --tp-panel-current-w：從視窗右緣算起被面板佔掉的寬度
 *                        （手機滿版時等於視窗寬度，桌機側邊時只有面板那一塊）
 * 尺寸只有這裡是權威來源，不在其他地方複製常數。
 *
 * lg 以上改為右側浮動面板：不再使用三段式高度，內容一律完整顯示。
 *
 * 結構：
 *   Panel（高度由狀態決定，本身不捲動）
 *   ├── Handle（button，可點擊切換）
 *   └── 捲動容器（overscroll-contain；collapsed 時不顯示也不捲動）
 */
export const PANEL_STATE = {
  COLLAPSED: 'collapsed',
  PEEK: 'peek',
  EXPANDED: 'expanded',
}

/** 下一個狀態：收合 → 一般 → 展開 → 收合 */
const NEXT_STATE = {
  [PANEL_STATE.COLLAPSED]: PANEL_STATE.PEEK,
  [PANEL_STATE.PEEK]: PANEL_STATE.EXPANDED,
  [PANEL_STATE.EXPANDED]: PANEL_STATE.COLLAPSED,
}

/** 高度過場時間；同時驅動 CSS 與上層的排序邏輯，避免兩邊各寫一個數字 */
export const PANEL_TRANSITION_MS = 300

/** 高度：peek 與 expanded 由 index.css 的變數提供（含 dvh fallback） */
const HEIGHT_CLASS = {
  [PANEL_STATE.COLLAPSED]: 'h-[calc(4rem+env(safe-area-inset-bottom))]',
  [PANEL_STATE.PEEK]: 'h-[var(--tp-panel-h)]',
  [PANEL_STATE.EXPANDED]: 'h-[var(--tp-panel-h-expanded)]',
}

/** 手勢只在行動裝置版型啟用；lg 以上是右側浮動面板 */
const LG_BREAKPOINT = 1024
/** 位移小於這個距離視為點擊，不當成拖曳 */
const TAP_SLOP_PX = 6
/** 計算放手速度時取樣的時間窗 */
const VELOCITY_WINDOW_MS = 100

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/**
 * 把三種狀態的 CSS 高度解析成實際 px。
 *
 * 用一個隱形探針套上 HEIGHT_CLASS 量測，讓 clamp() / dvh / env() 由瀏覽器解析，
 * 高度定義仍然只有 HEIGHT_CLASS 一處，不在這裡複製常數。
 */
function measureSnapPoints(panel) {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none'
  panel.parentElement.appendChild(probe)

  const points = Object.entries(HEIGHT_CLASS).map(([state, className]) => {
    probe.className = className
    return { state, height: probe.getBoundingClientRect().height }
  })

  probe.remove()
  return points.sort((a, b) => a.height - b.height)
}

/**
 * 放手後要吸附到哪一個狀態。
 *
 * - 一般情況：取「離目前實際高度最近」的 snap point，
 *   所以小幅度拖曳自然會回到原本的狀態，不需要額外的距離門檻。
 * - 快速滑動（fling）：以最近的 snap point 為基準，往手勢方向再跨一格。
 *
 * 速度門檻隨 viewport 高度變化（0.7 個畫面 / 秒），並設下限 0.5 px/ms，
 * 讓小螢幕上短而快的輕彈也能被判定為 fling。
 */
function resolveSnapState(height, velocity, points, viewportHeight) {
  const nearest = points.reduce((best, point) =>
    Math.abs(point.height - height) < Math.abs(best.height - height) ? point : best,
  )

  const flingVelocity = Math.max(0.5, (viewportHeight * 0.7) / 1000) // px/ms
  if (Math.abs(velocity) < flingVelocity) return nearest.state

  const index = points.findIndex((point) => point.state === nearest.state)
  return points[clamp(index + (velocity > 0 ? 1 : -1), 0, points.length - 1)].state
}

const STATE_LABEL = {
  [PANEL_STATE.COLLAPSED]: '展開行程',
  [PANEL_STATE.PEEK]: '放大行程面板',
  [PANEL_STATE.EXPANDED]: '收合行程面板',
}

/**
 * props:
 *  - state            目前狀態（受控）
 *  - onStateChange(next)
 *  - summary          收合時顯示的簡短摘要（純文字，由上層提供）
 *  - children         面板內容
 */
function SchedulePanel({ state, onStateChange, summary, children }) {
  const isCollapsed = state === PANEL_STATE.COLLAPSED
  const panelRef = useRef(null)
  const dragRef = useRef(null)
  // 拖曳結束後要吃掉緊接著的 click，避免又觸發一次點擊切換
  const suppressClickRef = useRef(false)

  // 用 ResizeObserver 追蹤實際高度：切換狀態有 300ms 過場，
  // 觀察實際尺寸才不會讀到過場中的舊值。
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined

    const sync = () => {
      const rect = panel.getBoundingClientRect()
      const style = document.documentElement.style
      style.setProperty('--tp-panel-current-h', `${Math.round(rect.height)}px`)
      style.setProperty('--tp-panel-current-w', `${Math.round(window.innerWidth - rect.left)}px`)
    }
    sync()

    // 視窗縮放時面板寬度可能被 clamp 住不變，但左緣會移動，所以也要監聽 resize
    window.addEventListener('resize', sync)

    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', sync)
    }

    const observer = new ResizeObserver(sync)
    observer.observe(panel)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
      document.documentElement.style.removeProperty('--tp-panel-current-h')
      document.documentElement.style.removeProperty('--tp-panel-current-w')
    }
  }, [])

  const handlePointerDown = (event) => {
    // 桌機是右側浮動面板（把手已隱藏），不啟用手勢
    if (window.innerWidth >= LG_BREAKPOINT || !event.isPrimary) return

    const panel = panelRef.current
    if (!panel) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      startY: event.clientY,
      startHeight: panel.getBoundingClientRect().height,
      samples: [{ y: event.clientY, time: event.timeStamp }],
      moved: false,
      points: measureSnapPoints(panel),
    }
    // 拖曳過程即時跟手，不要過場動畫
    panel.style.transitionDuration = '0ms'
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || !panel) return

    const offset = drag.startY - event.clientY // 上滑為正
    if (Math.abs(offset) > TAP_SLOP_PX) drag.moved = true

    // 只保留最近 100ms 的取樣，避免用單一影格的瞬時值判斷速度
    drag.samples.push({ y: event.clientY, time: event.timeStamp })
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].time > VELOCITY_WINDOW_MS) {
      drag.samples.shift()
    }

    const min = drag.points[0].height
    const max = drag.points[drag.points.length - 1].height
    panel.style.height = `${clamp(drag.startHeight + offset, min, max)}px`
  }

  const endDrag = (event) => {
    const drag = dragRef.current
    const panel = panelRef.current
    dragRef.current = null
    if (!drag || !panel) return

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const height = panel.getBoundingClientRect().height
    // 還原成由狀態決定的高度，暫時的 inline style 不留下來
    panel.style.transitionDuration = `${PANEL_TRANSITION_MS}ms`
    panel.style.height = ''

    if (!drag.moved) return // 視為點擊，交給 onClick 處理

    const first = drag.samples[0]
    const last = drag.samples[drag.samples.length - 1]
    const elapsed = last.time - first.time
    const velocity = elapsed > 0 ? (first.y - last.y) / elapsed : 0 // 上滑為正

    suppressClickRef.current = true
    onStateChange(resolveSnapState(height, velocity, drag.points, window.innerHeight))
  }

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onStateChange(NEXT_STATE[state])
  }

  return (
    <section
      ref={panelRef}
      aria-label="行程面板"
      data-panel-state={state}
      style={{ transitionDuration: `${PANEL_TRANSITION_MS}ms` }}
      className={`fixed inset-x-0 bottom-0 z-[1200] flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)] transition-[height] ease-out ${HEIGHT_CLASS[state]} lg:inset-x-auto lg:bottom-6 lg:right-6 lg:top-[calc(var(--tp-map-inset-top)+1rem)] lg:h-auto lg:w-[clamp(340px,28vw,420px)] lg:rounded-2xl lg:border`}
    >
      {/* 把手：只有這裡可以切換狀態，整個面板不可拖曳 */}
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label={STATE_LABEL[state]}
        aria-expanded={!isCollapsed}
        className="flex w-full shrink-0 touch-none select-none flex-col items-center gap-1 rounded-t-2xl px-4 pb-1 pt-2.5 transition-colors hover:bg-slate-50 lg:hidden"
      >
        <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-slate-300" />
        {isCollapsed && summary && (
          <span className="truncate text-sm font-medium text-slate-600">{summary}</span>
        )}
      </button>

      {/* 只有這一層捲動；收合時不顯示也不捲動 */}
      <div
        className={`flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 lg:block lg:pt-4 ${
          isCollapsed ? 'hidden' : ''
        }`}
      >
        {children}
      </div>
    </section>
  )
}

export default SchedulePanel
