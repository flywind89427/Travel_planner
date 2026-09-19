import { useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CATEGORIES } from '../data/defaultTrip'
import { formatDuration } from '../utils/scheduleHelpers'
import { ISSUE_LEVEL } from '../utils/scheduleValidation'
import ScheduleItemActions from './ScheduleItemActions'

const ACTION_CLASS =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium transition-colors sm:min-h-9 sm:px-2.5'

/**
 * ScheduleItem：垂直 Timeline 上的單一行程項目。
 *
 * 包含 Time / Place / Note / Duration / 編號圓點 / 連接線，
 * 行程編號直接顯示在左側時間軸的圓點上，卡片內改放分類貼圖；
 * 編輯與刪除收在右上角的 ⋮ 選單裡，卡片上只留主要內容。
 * 本身不修改資料，只把使用者操作往上回報。
 *
 * props:
 *  - place / index / isActive / isLast
 *  - issues   這筆行程的時間檢查結果（由 Schedule 計算後傳入，本元件不自行判斷）
 *  - onSelect(scheduleId) / onEdit(place) / onDelete(place)
 *  - isMenuOpen / onMenuOpenChange(open)  ⋮ 選單的開關（由 Schedule 保管，一次只開一個）
 *  - routeMode / routeRole / onRouteSelect(placeId)
 *      Route Mode 下主要內容改成選取路線端點（'from' | 'to' | null）；
 *      正常模式的選取與地圖連動完全不變
 *
 * place.googleMapsUrl 存在時多顯示一顆「↗ Google Maps」，
 * 以 noopener / noreferrer 開新分頁；它不影響 Leaflet 地圖。
 *
 * 拖曳只由左側的 handle 觸發，避免與選取／編輯／刪除／開啟地圖等操作衝突。
 */
function ScheduleItem({
  place,
  index,
  isActive,
  isLast,
  issues = [],
  isMenuOpen = false,
  onMenuOpenChange,
  routeMode = false,
  routeRole = null,
  onRouteSelect,
  onSelect,
  onEdit,
  onDelete,
}) {
  const category = CATEGORIES[place.category] ?? CATEGORIES.sightseeing
  const duration = formatDuration(place.duration)
  const itemRef = useRef(null)

  const isRouteSelected = Boolean(routeRole)

  const hasTimeError = issues.some((issue) => issue.level === ISSUE_LEVEL.ERROR)
  const hasTimeWarning = !hasTimeError && issues.length > 0
  const errorDetail = issues.find((issue) => issue.level === ISSUE_LEVEL.ERROR)?.detail

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: place.id })

  // Map Marker → Timeline：被選取但不在畫面內時自動捲進來
  // block: 'nearest' 讓已經看得到的項目不會被硬捲動
  useEffect(() => {
    if (!isActive) return
    itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [isActive])

  // 同一個節點要同時給 dnd-kit 與 scrollIntoView 使用
  const setRefs = (node) => {
    itemRef.current = node
    setNodeRef(node)
  }

  return (
    <li
      ref={setRefs}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative pl-16 sm:pl-24 ${isDragging ? 'z-10' : isMenuOpen ? 'z-20' : ''}`}
    >
      {/* 垂直連接線 */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[3rem] top-9 h-[calc(100%-1.25rem)] w-0.5 bg-slate-200 sm:left-[4.87rem]"
        />
      )}

      {/* 左側時間 */}
      <time
        title={errorDetail}
        className={`absolute left-0 top-3.5 w-9 text-right text-xs font-semibold tabular-nums sm:w-16 sm:text-sm ${
          hasTimeError ? 'text-red-600' : hasTimeWarning ? 'text-amber-600' : 'text-slate-500'
        }`}
      >
        {place.time || '--:--'}
      </time>

      {/* 時間軸圓點就是行程編號；中心對齊連接線（49px / 79px） */}
      <span
        className={`absolute top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow ring-1 ring-slate-200 transition-transform ${
          isActive ? 'scale-110' : ''
        } left-[2.3125rem] sm:left-[4.1875rem]`}
        style={{ backgroundColor: category.color }}
      >
        {index + 1}
      </span>

      <div
        className={`relative mb-4 rounded-xl border transition-colors duration-150 ${
          isDragging
            ? 'border-dashed border-brand-400 bg-brand-50/60 opacity-50 shadow-lg'
            : isRouteSelected
              ? 'border-brand-500 bg-brand-50 shadow-md ring-2 ring-brand-500'
            : isActive
              ? 'border-brand-500 bg-brand-50 shadow-md ring-1 ring-brand-500'
              : hasTimeError
                ? 'border-red-300 bg-red-50/40 hover:bg-red-50/70'
                : hasTimeWarning
                  ? 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/70'
                  : 'border-slate-200 bg-white hover:border-brand-200 hover:bg-slate-50'
        }`}
      >
        {/* 拖曳 handle：touch-none 讓手機長按拖曳時不會誤觸頁面捲動 */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`拖曳排序：${place.name}`}
          title="拖曳調整順序"
          className="absolute left-0 top-0 flex h-full w-7 cursor-grab touch-none items-center justify-center rounded-l-xl text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing sm:w-8"
        >
          <span aria-hidden="true" className="text-base leading-none">⠿</span>
        </button>
        <div className="flex items-start">
          {/* 主要區塊：點擊選取（與地圖 Marker 連動） */}
          <button
            type="button"
            onClick={() => (routeMode ? onRouteSelect(place.id) : onSelect(place.id))}
            aria-pressed={routeMode ? isRouteSelected : isActive}
            className="min-w-0 flex-1 py-0 pl-8 pr-1 pt-3 text-left sm:pl-9"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Place */}
                <p className="flex items-start gap-2 font-semibold text-slate-800">
                  {/* Route Mode：用符號表示可選 / 已選，不只靠底色 */}
                  {routeMode && (
                    <span
                      aria-hidden="true"
                      className={`shrink-0 text-sm leading-6 ${
                        isRouteSelected ? 'text-brand-600' : 'text-slate-300'
                      }`}
                    >
                      {isRouteSelected ? '✓' : '○'}
                    </span>
                  )}
                  {/* 編號已經在左側時間軸上，這裡改放分類貼圖 */}
                  <span
                    title={category.label}
                    className="flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none"
                  >
                    <span aria-hidden="true">{category.emoji}</span>
                    <span className="sr-only">{category.label}</span>
                  </span>
                  {/* 極窄螢幕允許 3 行；桌機兩欄時欄位較窄，不限制行數 */}
                  <span className="line-clamp-2 break-words max-[399px]:line-clamp-3 lg:line-clamp-none">
                    {place.name}
                  </span>
                  {routeRole && (
                    <span className="shrink-0 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {routeRole === 'from' ? '起點' : '終點'}
                    </span>
                  )}
                </p>
                {place.nameLocal && (
                  <p className="mt-0.5 truncate text-sm text-slate-500">{place.nameLocal}</p>
                )}

                {/* Note */}
                {place.note && (
                  <p title={place.note} className="mt-1.5 line-clamp-2 text-sm text-slate-400 sm:line-clamp-3">
                    {place.note}
                  </p>
                )}
              </div>
            </div>
          </button>

          <span className="pr-1 pt-1.5 sm:pr-2">
            <ScheduleItemActions
              name={place.name}
              isOpen={isMenuOpen}
              onOpenChange={(open) => onMenuOpenChange?.(open)}
              actions={[
                { key: 'edit', label: '編輯', onSelect: () => onEdit(place) },
                { key: 'delete', label: '刪除', tone: 'danger', onSelect: () => onDelete(place) },
              ]}
            />
          </span>
        </div>

        {/* 時間檢查提示：只描述問題，不會自動修改任何時間 */}
        {issues.length > 0 && (
          <div className="space-y-0.5 pb-1 pl-8 pr-3 sm:pl-9 sm:pr-4">
            {issues.map((issue) => (
              <p
                key={issue.type}
                data-issue={issue.level}
                title={issue.detail}
                className={`flex items-start gap-1.5 text-xs ${
                  issue.level === ISSUE_LEVEL.ERROR ? 'text-red-600' : 'text-amber-600'
                }`}
              >
                <span aria-hidden="true">{issue.level === ISSUE_LEVEL.ERROR ? '⚠' : '🟡'}</span>
                <span>{issue.message}</span>
              </p>
            ))}
          </div>
        )}

        {/* Duration + Google Maps（編輯／刪除已收進 ⋮ 選單） */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 pl-8 pr-3 pt-2 sm:pl-9 sm:pr-4">
          {/* 開始時間在左側時間軸上，結束時間不再重複顯示，這裡只留停留時間 */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            {duration && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500">
                停留 {duration}
              </span>
            )}
          </p>

          <div className="flex flex-wrap justify-end gap-1.5">
            {place.googleMapsUrl && (
              <button
                type="button"
                onClick={() => window.open(place.googleMapsUrl, '_blank', 'noopener,noreferrer')}
                title={place.googleMapsUrl}
                className={`${ACTION_CLASS} text-slate-600 hover:border-emerald-300 hover:text-emerald-700`}
              >
                <span aria-hidden="true">↗</span>
                <span className="ml-1">
                  {/* 窄螢幕只留「Maps」，可讀文字與無障礙名稱仍是 Google Maps */}
                  <span className="hidden sm:inline">Google </span>Maps
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

export default ScheduleItem
