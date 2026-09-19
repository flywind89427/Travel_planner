/**
 * RouteSelectionBar：Route Mode 的操作區。
 *
 * 只有這一條是 sticky，Day 標題不跟著固定；
 * 在行程清單上下捲動時它會停在捲動容器頂端，隨時看得到目前選了幾個。
 *
 * 純展示元件：不碰 trip 資料，也不知道選取規則，
 * 選取狀態由 Schedule 以暫時性的 UI state 保管。
 *
 * props:
 *  - from / to   已選的起點與終點 place（沒選就是 null）
 *  - onCancel()  離開 Route Mode
 */
function RouteSelectionBar({ from, to, onCancel }) {
  const count = (from ? 1 : 0) + (to ? 1 : 0)

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-brand-200 bg-brand-50/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-brand-700">
          <span aria-hidden="true">🚃</span> 路線查詢
        </span>

        {/* aria-live：選取進度用讀的也要知道 */}
        <span aria-live="polite" className="text-xs font-medium text-brand-700">
          已選 {count} / 2
        </span>

        <button
          type="button"
          onClick={onCancel}
          className="ml-auto inline-flex min-h-9 items-center rounded-lg border border-brand-300 bg-white px-3 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
        >
          取消
        </button>
      </div>

      {count === 0 && (
        <p className="mt-1 text-xs text-brand-600">請選擇起點</p>
      )}

      {from && (
        <p className="mt-1 text-xs text-slate-600">
          <span className="font-medium text-slate-500">起點：</span>
          {from.name}
        </p>
      )}

      {to && (
        <p className="text-xs text-slate-600">
          <span className="font-medium text-slate-500">終點：</span>
          {to.name}
        </p>
      )}

      {count === 1 && (
        <p className="mt-1 text-xs font-medium text-brand-600">請再選擇一個地點</p>
      )}
    </div>
  )
}

export default RouteSelectionBar
