import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CATEGORIES } from '../data/defaultTrip'
import { formatDuration } from '../utils/scheduleHelpers'
import { getItemTime } from '../utils/dayItems'
import ScheduleItemActions from './ScheduleItemActions'

/**
 * SubItineraryItem：Timeline 上的「子行程」群組。
 *
 * 子行程本身沒有 time，畫面上以第一個 child 的時間代表（只用於顯示，不寫回資料）；
 * duration 則是子行程自己儲存的預估時間，不由 children 計算。
 *
 * 整個群組是 Day 排序中的一個單位：拖曳把手時 children 會一起移動，
 * children 本身不可拖曳，因此不會被拖出群組。
 *
 * 展開／收合是元件自己的 UI 狀態，不會寫進 trip 資料。
 *
 * 子地點是「這個子行程可能會去的地方」，所以不給行程編號、視覺層級明顯低於正式行程，
 * 也不在列表裡放管理按鈕；只以顏色做群組標示
 *（顏色沒有獨立欄位，一律由分類決定並跟隨上方最近的正式行程）。
 *
 * 點擊行為分工（互不觸發，彼此都是兄弟節點，不會巢狀冒泡）：
 *   主要內容區 → 聚焦這個子行程底下的所有子地點
 *   ▼ / ▶ 箭頭 → 只切換展開／收合
 *   ⋮ 選單     → 只開選單；編輯／刪除只做自己的事
 * 收合狀態下主要內容區一樣可以聚焦，places[] 不會因為收合而改變。
 *
 * props:
 *  - subItinerary / isLast / isFocused
 *  - color        顯示色，由 Schedule 依「上方最近的正式行程」算好後傳入
 *  - isDragCollapsed  拖曳期間暫時收合（不改變使用者自己的展開狀態）
 *  - issuesById   時間檢查結果（由 Schedule 計算）
 *  - isMenuOpen / onMenuOpenChange(open)  ⋮ 選單的開關（由 Schedule 保管）
 *  - routeMode / routeRoleOf(placeId) / onRouteSelect(placeId)
 *      Route Mode 下「只有子地點」可以被選為路線端點；
 *      子行程群組本身不是 place，所以主要內容區在這個模式下不接受點擊。
 *      展開／收合、⋮、拖曳把手都維持原本行為，也不會自動展開。
 *  - onFocus(subItinerary)
 *  - onEdit(subItinerary) / onDelete(subItinerary)
 *  - onAddPlace(subItineraryId)
 */
function SubItineraryItem({
  subItinerary,
  isLast,
  isFocused,
  color,
  isDragCollapsed,
  issuesById,
  isMenuOpen = false,
  onMenuOpenChange,
  routeMode = false,
  routeRoleOf = () => null,
  onRouteSelect,
  onFocus,
  onEdit,
  onDelete,
  onAddPlace,
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  // 拖曳中先收起來，放開後自動回到原本的展開狀態
  const showChildren = isExpanded && !isDragCollapsed
  const category = CATEGORIES[subItinerary.category] ?? CATEGORIES.sightseeing
  const duration = formatDuration(subItinerary.duration)
  const time = getItemTime(subItinerary)
  const places = subItinerary.places

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: subItinerary.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative pl-16 sm:pl-24 ${isDragging ? 'z-10' : isMenuOpen ? 'z-20' : ''}`}
    >
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[3rem] top-9 h-[calc(100%-1.25rem)] w-0.5 bg-slate-200 sm:left-[4.87rem]"
        />
      )}

      {/* 沒有 child 時不顯示代表時間，也不會自行產生時間 */}
      <time className="absolute left-0 top-3.5 w-9 text-right text-xs font-semibold tabular-nums text-slate-500 sm:w-16 sm:text-sm">
        {time || '--:--'}
      </time>

      <span
        aria-hidden="true"
        className="absolute left-[2.625rem] top-[1.1rem] h-3.5 w-3.5 rounded-full border-2 border-white shadow ring-1 ring-slate-200 sm:left-[4.5rem]"
        style={{ backgroundColor: color }}
      />

      <div
        className={`relative mb-4 rounded-xl border transition-colors duration-150 ${
          isDragging
            ? 'border-dashed border-brand-400 bg-brand-50/60 opacity-50 shadow-lg'
            : isFocused
              ? 'border-brand-500 bg-brand-50 shadow-md ring-1 ring-brand-500'
              : 'border-slate-200 bg-slate-50/70'
        }`}
        style={{ borderLeftColor: isDragging ? undefined : color, borderLeftWidth: 3 }}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`拖曳排序：${subItinerary.name}`}
          title="拖曳調整順序"
          className="absolute left-0 top-0 flex h-full w-7 cursor-grab touch-none items-center justify-center rounded-l-xl text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing sm:w-8"
        >
          <span aria-hidden="true" className="text-base leading-none">⠿</span>
        </button>

        <div className="flex items-start gap-1">
          {/* 左欄是分類貼圖；展開／收合的箭頭在下方資訊列，兩者上下對齊 */}
          <span
            title={category.label}
            className="ml-7 mt-2.5 inline-flex h-9 w-6 shrink-0 items-center justify-center sm:ml-8"
          >
            <span aria-hidden="true">{category.emoji}</span>
            <span className="sr-only">{category.label}</span>
          </span>

          {/* 主要內容區：點擊聚焦這個子行程底下的所有子地點 */}
          <button
            type="button"
            onClick={() => onFocus(subItinerary)}
            disabled={routeMode}
            aria-pressed={isFocused}
            aria-label={`聚焦子行程：${subItinerary.name}`}
            className="min-w-0 flex-1 pb-1 pl-1 pr-1 pt-3 text-left disabled:cursor-default"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              子行程
            </p>
            <p className="font-semibold text-slate-800">
              <span className="line-clamp-2 break-words">{subItinerary.name}</span>
            </p>
            {subItinerary.note && (
              <p title={subItinerary.note} className="mt-1 line-clamp-2 text-sm text-slate-400">
                {subItinerary.note}
              </p>
            )}
          </button>

          <span className="pr-1 pt-1.5 sm:pr-2">
            <ScheduleItemActions
              name={`子行程：${subItinerary.name}`}
              isOpen={isMenuOpen}
              onOpenChange={(open) => onMenuOpenChange?.(open)}
              actions={[
                { key: 'edit', label: '編輯', onSelect: () => onEdit(subItinerary) },
                {
                  key: 'delete',
                  label: '刪除',
                  tone: 'danger',
                  onSelect: () => onDelete(subItinerary),
                },
              ]}
            />
          </span>
        </div>

        {/* 只有箭頭負責展開／收合 */}
        <div className="flex items-center gap-1 pb-3 pl-7 pr-3 text-xs text-slate-500 sm:pl-8 sm:pr-4">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={showChildren}
            aria-label={showChildren ? '收合子行程地點' : '展開子行程地點'}
            className="-my-1 inline-flex h-8 w-6 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100"
          >
            <span aria-hidden="true">{showChildren ? '▼' : '▶'}</span>
          </button>
          <span className="pl-1">
            {duration && (
              <>
                預計 {duration}
                <span aria-hidden="true"> · </span>
              </>
            )}
            {places.length} 個地點
          </span>
        </div>

        {showChildren && (
          <div className="border-t border-slate-200/70 py-2 pl-14 pr-3 sm:pl-16 sm:pr-4">
            <ul className="space-y-1">
              {places.length === 0 ? (
                <li className="py-1 text-xs text-slate-400">這個子行程還沒有地點</li>
              ) : (
                places.map((place) => {
                  const issues = issuesById?.[place.id] ?? []
                  const hasError = issues.some((issue) => issue.level === 'error')
                  const routeRole = routeMode ? routeRoleOf(place.id) : null
                  const rowContent = (
                    <>
                      {/* Route Mode：子地點可以當端點，所以要有明確的可選 / 已選符號 */}
                      {routeMode && (
                        <span
                          aria-hidden="true"
                          className={`shrink-0 text-xs ${routeRole ? 'text-brand-600' : 'text-slate-300'}`}
                        >
                          {routeRole ? '✓' : '○'}
                        </span>
                      )}
                      {/* 不給行程編號，只用子行程顏色的小圓點表示同一組 */}
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="min-w-[6rem] flex-1 truncate text-slate-600">{place.name}</span>
                      {routeRole && (
                        <span className="shrink-0 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {routeRole === 'from' ? '起點' : '終點'}
                        </span>
                      )}
                      {place.time && (
                        <span
                          className={`ml-auto shrink-0 text-xs tabular-nums ${
                            hasError ? 'text-red-600' : 'text-slate-400'
                          }`}
                        >
                          {place.time}
                        </span>
                      )}
                    </>
                  )

                  return (
                    <li key={place.id} className="text-[13px]">
                      {routeMode ? (
                        <button
                          type="button"
                          onClick={() => onRouteSelect(place.id)}
                          aria-pressed={Boolean(routeRole)}
                          className={`flex min-h-9 w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1 text-left transition-colors ${
                            routeRole ? 'bg-brand-50 ring-1 ring-brand-400' : 'hover:bg-slate-100'
                          }`}
                        >
                          {rowContent}
                        </button>
                      ) : (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{rowContent}</span>
                      )}
                    </li>
                  )
                })
              )}
            </ul>

            <button
              type="button"
              onClick={() => onAddPlace(subItinerary.id)}
              className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
            >
              <span aria-hidden="true" className="text-base leading-none">＋</span>
              新增地點
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

export default SubItineraryItem
