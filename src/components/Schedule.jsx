import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { useEffect, useMemo, useRef, useState } from 'react'
import ScheduleItem from './ScheduleItem'
import SubItineraryItem from './SubItineraryItem'
import RouteSelectionBar from './RouteSelectionBar'
import RouteResultModal from './RouteResultModal'
import { validateScheduleTimes } from '../utils/scheduleValidation'
import { DEPARTURE_MODE, buildDepartureTime, fetchTransitTime } from '../utils/transitTime'
import { flattenPlaces, getItemColors, getItemId, getScheduleNumbers, isSubItinerary } from '../utils/dayItems'

/**
 * Schedule：Today's Schedule，只顯示 selectedDay 的行程。
 *
 * items 的 array 順序就是畫面顯示順序（一般地點與子行程混排），
 * 這裡不做任何自動排序，否則拖曳結果會在下一次 render 被還原。
 *
 * props:
 *  - day                 目前選取的那一天
 *  - selectedScheduleId  目前選取的行程點 id，與 MapView 共用
 *  - onSelectSchedule(scheduleId)
 *  - onAddSchedule() / onEditSchedule(place) / onDeleteSchedule(place)
 *  - onAddSubItinerary() / onEditSubItinerary(sub) / onDeleteSubItinerary(sub)
 *  - selectedSubItineraryId / onFocusSubItinerary(sub)
 *  - onAddPlaceToSubItinerary(subItineraryId)
 *  - onReorderSchedule(activeId, overId)  拖曳結束後回報
 *
 * 「依時間排序」目前沒有畫面入口（reducer 的 sortSchedulesByTime 仍在），
 * 要恢復時把按鈕加回標題列並接上 useTrip 即可。
 *
 * Route Mode（路線查詢）是臨時的查詢工具，不產生任何行程資料：
 * 開關與已選的兩個端點都只存在這裡的 UI state，不經過 useTrip，也不寫 LocalStorage。
 *
 * 每張卡片的管理操作收在自己的 ⋮ 選單裡；開關狀態集中在這裡（openMenuId），
 * 所以同時最多只有一個選單打開，點另一張卡片的 ⋮ 會關掉前一個。
 */
function Schedule({
  day,
  selectedScheduleId,
  onSelectSchedule,
  onAddSchedule,
  onEditSchedule,
  onDeleteSchedule,
  selectedSubItineraryId,
  onFocusSubItinerary,
  onAddSubItinerary,
  onEditSubItinerary,
  onDeleteSubItinerary,
  onAddPlaceToSubItinerary,
  onReorderSchedule,
}) {
  const items = day?.items ?? []

  // 時間檢查仍以攤平後的順序為準（含子行程內的地點）
  const places = useMemo(() => flattenPlaces(items), [items])

  // 行程編號只給正式行程，子地點不編號，所以編號是連續的 ① ② ③
  // 與地圖 marker 共用同一個編號來源
  const scheduleNumbers = useMemo(() => getScheduleNumbers(items), [items])

  // 顏色沒有獨立欄位：正式行程用自己的分類色，子行程跟隨上方最近的正式行程
  const itemColors = useMemo(() => getItemColors(items), [items])

  // 時間檢查結果一律即時計算，不存進 trip，也不寫入 LocalStorage
  const validation = useMemo(() => validateScheduleTimes(places), [places])

  // 滑鼠需要先移動一點距離、觸控需要長按，避免點擊按鈕時誤觸拖曳
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /**
   * 拖曳中的項目 id。
   *
   * 展開的子行程可能高達 400–500px，遠高於一般行程（約 140px），
   * 會讓拖曳位移不足以越過鄰居而無法排序。拖曳期間先把它收合，
   * 結束後自動還原使用者原本的展開狀態（不改 DnD sensor / modifier）。
   */
  const [draggingItemId, setDraggingItemId] = useState(null)

  /** 目前打開 ⋮ 選單的那張卡片 id；null 代表全部關閉 */
  const [openMenuId, setOpenMenuId] = useState(null)
  const setMenuOpen = (itemId, open) => setOpenMenuId(open ? itemId : null)

  /**
   * Route Mode：純粹的查詢狀態，離開就整個丟掉。
   * 第一個選到的是起點，第二個是終點；兩者一定是不同的 place。
   */
  const [routeMode, setRouteMode] = useState(false)
  const [routeFromId, setRouteFromId] = useState(null)
  const [routeToId, setRouteToId] = useState(null)

  const routeFrom = useMemo(
    () => places.find((place) => place.id === routeFromId) ?? null,
    [places, routeFromId],
  )
  const routeTo = useMemo(
    () => places.find((place) => place.id === routeToId) ?? null,
    [places, routeToId],
  )

  /**
   * 第一次點選＝起點，第二次＝終點；再點一次已選的那個就取消它。
   * 兩個端點一定不同（同一個 id 會走到「取消」而不是被選成終點）。
   */
  const handleRouteSelect = (placeId) => {
    if (routeFromId === placeId) {
      setRouteFromId(null)
      return
    }
    if (routeToId === placeId) {
      setRouteToId(null)
      return
    }
    if (!routeFromId) {
      setRouteFromId(placeId)
      return
    }
    if (!routeToId) setRouteToId(placeId)
  }

  const routeRoleOf = (placeId) => {
    if (placeId === routeFromId) return 'from'
    if (placeId === routeToId) return 'to'
    return null
  }

  /**
   * 交通時間查詢狀態：idle → loading → done。
   * 只有使用者在結果視窗按下「查詢」才會真的發請求。
   */
  const [routeQuery, setRouteQuery] = useState({ status: 'idle', result: null })
  // 換了端點或關掉視窗之後才回來的回應要丟掉
  const routeQueryToken = useRef(0)

  const resetRouteQuery = () => {
    routeQueryToken.current += 1
    setRouteQuery({ status: 'idle', result: null })
  }

  /** 出發時間：Day 日期 + 起點時間（起點沒時間就退回 09:00），邏輯集中在 transitTime */
  const routeDeparture = useMemo(
    () => (routeFrom ? buildDepartureTime(day?.date, routeFrom) : null),
    [day?.date, routeFrom],
  )

  const handleQueryRoute = async (mode = DEPARTURE_MODE.SCHEDULE) => {
    if (!routeFrom || !routeTo || routeQuery.status === 'loading') return

    routeQueryToken.current += 1
    const token = routeQueryToken.current
    setRouteQuery({ status: 'loading', result: null })

    const result = await fetchTransitTime({ from: routeFrom, to: routeTo, dayDate: day?.date, mode })
    if (token !== routeQueryToken.current) return
    setRouteQuery({ status: 'done', result })
  }

  const exitRouteMode = () => {
    setRouteMode(false)
    setRouteFromId(null)
    setRouteToId(null)
    resetRouteQuery()
  }

  /**
   * 選滿兩個端點就顯示查詢結果。
   * 關掉結果後留在 Route Mode、但把選取清空，方便接著查下一段。
   */
  const clearRouteSelection = () => {
    setRouteFromId(null)
    setRouteToId(null)
    resetRouteQuery()
  }

  // 換日就離開 Route Mode：端點都屬於原本那一天
  useEffect(() => {
    setRouteMode(false)
    setRouteFromId(null)
    setRouteToId(null)
    routeQueryToken.current += 1
    setRouteQuery({ status: 'idle', result: null })
  }, [day?.id])

  const handleDragStart = (event) => {
    // 開始拖曳就收起選單，避免浮在卡片上跟著移動
    setOpenMenuId(null)
    setDraggingItemId(event.active.id)
  }
  const handleDragCancel = () => setDraggingItemId(null)

  const handleDragEnd = (event) => {
    setDraggingItemId(null)
    const { active, over } = event
    // 沒有放在有效目標上，或放回原位，都不做任何事
    if (!over || active.id === over.id) return
    onReorderSchedule(active.id, over.id)
  }

  return (
    <section
      aria-label="當日行程"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      {/* 日期與描述在 DaySelector 已經看得到，這裡只留天數 */}
      <div className="mb-5 flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <h2 className="text-lg font-bold text-slate-800">Day {day?.dayNumber}</h2>

        {/* Route Mode 開啟後，這顆按鈕換成 sticky 操作區上的「取消」 */}
        {!routeMode && (
          <button
            type="button"
            onClick={() => setRouteMode(true)}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            <span aria-hidden="true">🚃</span>
            路線查詢
          </button>
        )}
      </div>

      {routeMode && (
        <RouteSelectionBar from={routeFrom} to={routeTo} onCancel={exitRouteMode} />
      )}

      {routeMode && routeFrom && routeTo && (
        <RouteResultModal
          from={routeFrom}
          to={routeTo}
          departure={routeDeparture}
          tripDate={day?.date}
          status={routeQuery.status}
          result={routeQuery.result}
          onQuery={handleQueryRoute}
          onClose={clearRouteSelection}
        />
      )}

      {/* Day 級別警告：只有真的有異常才出現 */}
      {validation.hasError && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            此日有行程時間順序異常，請檢查時間設定
            <span className="ml-1 text-xs text-red-500">
              （拖曳順序不會自動修改時間）
            </span>
          </span>
        </p>
      )}

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">這一天還沒有安排行程</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* key 綁 day.id：切換 Day 時整段 Timeline 重新 render */}
          <ol key={day.id} className="relative">
            <SortableContext
              items={items.map(getItemId)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item, index) => {
                const isLast = index === items.length - 1

                // 子行程是排序中的一個單位，拖曳時 children 會一起移動
                if (isSubItinerary(item)) {
                  return (
                    <SubItineraryItem
                      key={item.id}
                      subItinerary={item}
                      isLast={isLast}
                      isFocused={item.id === selectedSubItineraryId}
                      color={itemColors.get(item.id)}
                      isDragCollapsed={draggingItemId === item.id}
                      issuesById={validation.issuesById}
                      isMenuOpen={openMenuId === item.id}
                      onMenuOpenChange={(open) => setMenuOpen(item.id, open)}
                      routeMode={routeMode}
                      routeRoleOf={routeRoleOf}
                      onRouteSelect={handleRouteSelect}
                      onFocus={onFocusSubItinerary}
                      onEdit={onEditSubItinerary}
                      onDelete={onDeleteSubItinerary}
                      onAddPlace={onAddPlaceToSubItinerary}
                    />
                  )
                }

                const { place } = item
                return (
                  <ScheduleItem
                    key={place.id}
                    place={place}
                    index={(scheduleNumbers.get(place.id) ?? index + 1) - 1}
                    isActive={place.id === selectedScheduleId}
                    isLast={isLast}
                    issues={validation.issuesById[place.id] ?? []}
                    isMenuOpen={openMenuId === place.id}
                    onMenuOpenChange={(open) => setMenuOpen(place.id, open)}
                    routeMode={routeMode}
                    routeRole={routeRoleOf(place.id)}
                    onRouteSelect={handleRouteSelect}
                    onSelect={onSelectSchedule}
                    onEdit={onEditSchedule}
                    onDelete={onDeleteSchedule}
                  />
                )
              })}
            </SortableContext>
          </ol>
        </DndContext>
      )}

      {/* 兩個新增入口：一般地點與子行程 */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onAddSchedule()}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-medium text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
        >
          <span aria-hidden="true" className="text-lg leading-none">＋</span>
          新增地點
        </button>
        <button
          type="button"
          onClick={onAddSubItinerary}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-medium text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
        >
          <span aria-hidden="true" className="text-lg leading-none">＋</span>
          新增子行程
        </button>
      </div>
    </section>
  )
}

export default Schedule
