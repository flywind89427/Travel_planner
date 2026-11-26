/**
 * Header：站台標題 + Trip Information + 行程管理入口
 *
 * Map-first 後它是浮在地圖上的 overlay（定位由 App 負責），
 * 本身不佔 document flow，也不把地圖往下推。
 * 純展示元件，資料一律由 props 傳入。
 */
/**
 * 日期區間由 days 推導，trip 上不存 startDate / endDate。
 *
 * 存成欄位的話，使用者在「行程管理」增刪或拖曳天數之後，
 * 這裡顯示的區間就會跟 days 脫鉤——而且沒有任何地方會去更新它。
 * 只有一天、或天數都還沒設定日期時，退回顯示單一日期或空字串。
 */
function formatDateRange(days) {
  // 取最早與最晚，不是第一天與最後一天：使用者拖曳天數後 days 的順序
  // 不保證與日期順序一致，照順序取會顯示出 12/18 – 12/16 這種反向區間。
  // 'YYYY-MM-DD' 可以直接字串排序。
  const dates = (days ?? [])
    .map((day) => day.date)
    .filter(Boolean)
    .sort()
  if (dates.length === 0) return ''

  const format = (value) => {
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const first = format(dates[0])
  const last = format(dates[dates.length - 1])
  return first === last ? first : `${first} – ${last}`
}

function Header({ trip, canUndo = false, onUndo, onOpenSettings }) {
  const dateRange = formatDateRange(trip.days)

  return (
    <header className="bg-gradient-to-r from-brand-700/95 via-brand-600/95 to-brand-500/95 text-white shadow-lg backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 sm:py-2.5 lg:px-8">
        {/* Trip Information：標題、副標與日期區間同一行，不另外佔一列 */}
        <div className="flex items-start justify-between gap-3 lg:items-end lg:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl lg:text-3xl">
              {trip.title}
              <span className="ml-3 align-middle text-base font-normal text-brand-100">
                {trip.subtitle && <span className="mr-2">{trip.subtitle}</span>}
                {dateRange && `｜${dateRange}｜`}
              </span>
            </h1>
          </div>

          {/* 天數在 DaySelector 已看得到，行程點數量對操作價值低，
              因此 Header 只保留行程資訊、復原與一個管理入口 */}
          <div className="flex shrink-0 items-center gap-2">
            {/* 刪除與排序都會立刻寫進 LocalStorage，復原是唯一的退路（也吃 Cmd/Ctrl+Z） */}
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="復原上一步"
              title={canUndo ? '復原上一步（Cmd/Ctrl+Z）' : '沒有可復原的操作'}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/30 px-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span aria-hidden="true">↩</span>
              <span className="hidden sm:inline">復原</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="行程管理"
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/30 px-3 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              <span aria-hidden="true">⚙</span>
              <span className="hidden sm:inline">行程管理</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
