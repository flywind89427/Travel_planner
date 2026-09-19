/**
 * Header：站台標題 + Trip Information + 行程管理入口
 *
 * Map-first 後它是浮在地圖上的 overlay（定位由 App 負責），
 * 本身不佔 document flow，也不把地圖往下推。
 * 純展示元件，資料一律由 props 傳入。
 */
function formatDateRange(startDate, endDate) {
  const format = (value) => {
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return `${date.getMonth() + 1}/${date.getDate()}`
  }
  return `${format(startDate)} – ${format(endDate)}`
}

function Header({ trip, onOpenSettings }) {
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
                ｜{formatDateRange(trip.startDate, trip.endDate)}｜
              </span>
            </h1>
          </div>

          {/* 天數在 DaySelector 已看得到，行程點數量對操作價值低，
              因此 Header 只保留行程資訊與一個管理入口 */}
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
    </header>
  )
}

export default Header
