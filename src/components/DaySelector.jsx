/**
 * DaySelector：Day 1 / Day 2 / ... 切換列，並提供編輯目前這一天的入口。
 *
 * Map-first 後它是浮在地圖上的 overlay（定位由 App 負責）。
 *
 * 編輯按鈕獨立於各個 Day 按鈕之外（避免巢狀 button，
 * 也確保切換 Day 這個主要操作不會被誤觸）。
 *
 * props:
 *  - days           行程天數陣列
 *  - selectedDayId  目前選取的 day id
 *  - onSelectDay(dayId)
 *  - onEditDay(day) 編輯目前選取的那一天
 */
function DaySelector({ days, selectedDayId, onSelectDay, onEditDay }) {
  const selectedDay = days.find((day) => day.id === selectedDayId)

  return (
    <nav
      aria-label="選擇日期"
      className="border-b border-slate-200/70 bg-white/85 shadow-sm backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <ul className="flex flex-1 gap-1 overflow-x-auto py-1.5">
          {days.map((day) => {
            const isActive = day.id === selectedDayId
            return (
              <li key={day.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectDay(day.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-w-[6.5rem] flex-col items-start rounded-xl px-3 py-1.5 text-left transition sm:min-w-[8.5rem] sm:px-4 ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-sm font-semibold">Day {day.dayNumber}</span>
                  {/* 沒有描述就不佔位 */}
                  {day.description && (
                    <span
                      title={day.description}
                      className={`max-w-[11rem] truncate text-xs ${
                        isActive ? 'text-brand-100' : 'text-slate-400'
                      }`}
                    >
                      {day.description}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {selectedDay && (
          <button
            type="button"
            onClick={() => onEditDay(selectedDay)}
            title={`編輯 Day ${selectedDay.dayNumber}`}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            <span aria-hidden="true">✏️</span>
            <span className="hidden sm:inline">Edit Day</span>
          </button>
        )}
      </div>
    </nav>
  )
}

export default DaySelector
