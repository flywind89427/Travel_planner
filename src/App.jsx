import { useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import DaySelector from './components/DaySelector'
import MapView from './components/MapView'
import Schedule from './components/Schedule'
import EditScheduleModal, {
  buildAddValues,
  buildEditValues,
} from './components/EditScheduleModal'
import EditDayModal from './components/EditDayModal'
import EditSubItineraryModal, { buildSubItineraryValues } from './components/EditSubItineraryModal'
import ConfirmDialog from './components/ConfirmDialog'
import SchedulePanel, { PANEL_STATE, PANEL_TRANSITION_MS } from './components/SchedulePanel'
import TripSettingsModal from './components/TripSettingsModal'
import DayManagerModal from './components/DayManagerModal'
import { useTrip } from './state/useTrip'
import { DIALOG, useDialogs } from './state/useDialogs'
import { buildMapPlaces, flattenPlaces, isSubItinerary } from './utils/dayItems'

/**
 * App：只負責串接 state 與畫面。
 *
 * - 行程資料與 CRUD 由 useTrip（reducer）提供
 * - selectedDayId / selectedScheduleId 是共用的選取狀態
 * - 對話框的開關集中在 useDialogs
 */
function App() {
  const {
    trip,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    addSubItinerary,
    updateSubItinerary,
    deleteSubItinerary,
    reorderSchedules,
    updateDay,
    replaceDays,
    resetTrip,
  } = useTrip()
  const [selectedDayId, setSelectedDayId] = useState(trip.days[0].id)
  const [selectedScheduleId, setSelectedScheduleId] = useState(null)
  // 目前聚焦的子行程：地圖會把它底下的所有地點一起框進可視區域
  const [selectedSubItineraryId, setSelectedSubItineraryId] = useState(null)

  const dialogs = useDialogs()

  const shellRef = useRef(null)
  const overlayRef = useRef(null)
  const demoteTimerRef = useRef(null)

  const [panelState, setPanelState] = useState(PANEL_STATE.PEEK)

  // 讓 Leaflet 的縮放控制項避開上方浮動層。
  // 浮動層高度會隨標題長度與斷點改變，所以量實際高度而不是寫死。
  useEffect(() => {
    const shell = shellRef.current
    const overlay = overlayRef.current
    if (!shell || !overlay) return undefined

    const sync = () => shell.style.setProperty('--tp-map-inset-top', `${overlay.offsetHeight}px`)
    sync()

    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(sync)
    observer.observe(overlay)
    return () => observer.disconnect()
  }, [])

  // 卸載時清掉還沒觸發的延後選取
  useEffect(() => () => window.clearTimeout(demoteTimerRef.current), [])

  const selectedDay = useMemo(
    () => trip.days.find((day) => day.id === selectedDayId) ?? trip.days[0],
    [trip, selectedDayId],
  )

  // 新增表單的時間預設值仍參考攤平後的最後一筆
  const selectedDayPlaces = useMemo(() => flattenPlaces(selectedDay.items), [selectedDay])

  // 地圖同時顯示正式行程與子地點：正式行程帶編號 ① ② ③，
  // 子地點保留座標與選取能力但不顯示正式編號
  const mapPlaces = useMemo(() => buildMapPlaces(selectedDay.items), [selectedDay])

  // 換日時清掉選取狀態，地圖會重新 fitBounds 到新的一天
  const handleSelectDay = (dayId) => {
    setSelectedDayId(dayId)
    setSelectedScheduleId(null)
    setSelectedSubItineraryId(null)
  }

  /**
   * 面板展開時剩下的地圖高度比上方浮動層還矮，
   * 先降回 peek 讓地圖有足夠可視空間，等高度過場結束才真的改變選取，
   * 這樣地圖算可視區域時讀到的才是收合後的面板高度。
   */
  const withMapVisible = (action) => {
    window.clearTimeout(demoteTimerRef.current)

    if (panelState !== PANEL_STATE.EXPANDED) {
      action()
      return
    }

    setPanelState(PANEL_STATE.PEEK)
    demoteTimerRef.current = window.setTimeout(action, PANEL_TRANSITION_MS)
  }

  // Map Marker 與 Timeline 共用的選取行為，再點一次同一筆就取消選取
  const handleSelectSchedule = (scheduleId) => {
    setSelectedScheduleId((current) => (current === scheduleId ? null : scheduleId))
    // 單一地點與整個子行程的聚焦互斥
    setSelectedSubItineraryId(null)
  }

  /**
   * 聚焦整個子行程：MapView 會把該組所有地點一起框進可視區域，
   * 再點一次同一個子行程就取消聚焦（地圖視野保持不動）。
   */
  const handleFocusSubItinerary = (subItinerary) => {
    withMapVisible(() => {
      setSelectedSubItineraryId((current) => (current === subItinerary.id ? null : subItinerary.id))
      setSelectedScheduleId(null)
    })
  }

  /** 從行程清單選取單一地點 */
  const handleSelectFromTimeline = (scheduleId) => {
    withMapVisible(() => handleSelectSchedule(scheduleId))
  }

  const isEditingSchedule = dialogs.isOpen(DIALOG.EDIT_SCHEDULE)
  const isEditingSubItinerary = dialogs.isOpen(DIALOG.EDIT_SUB_ITINERARY)

  /** 新增地點時，時間預設值要參考「要加進去的那一層」的最後一個地點 */
  const addTargetPlaces = useMemo(() => {
    const parentId = dialogs.dialog?.parentId
    if (!parentId) return selectedDayPlaces

    const parent = selectedDay.items.find((item) => isSubItinerary(item) && item.id === parentId)
    return parent ? parent.places : []
  }, [dialogs.dialog, selectedDay, selectedDayPlaces])

  const handleSubmitForm = (values) => {
    if (isEditingSchedule) {
      const { place } = dialogs.dialog
      // reducer 會在 items 裡（含子行程內）找到這個 place
      updateSchedule(selectedDay.id, place.id, values)
      setSelectedScheduleId(place.id)
    } else {
      // parentId 有值就加進該子行程，否則成為一天中的一個行程單位
      setSelectedScheduleId(addSchedule(selectedDay.id, values, dialogs.dialog?.parentId))
    }
    dialogs.close()
  }

  /**
   * 子行程表單送出：群組欄位與子地點一起套用。
   * 子地點沿用既有的 updateSchedule / deleteSchedule（reducer 本來就能在子行程裡找到 place），
   * 所以不需要新的 action，也不動資料結構。
   */
  const handleSubmitSubItinerary = (values, placeChanges) => {
    if (isEditingSubItinerary) {
      updateSubItinerary(selectedDay.id, dialogs.dialog.subItinerary.id, values)
      placeChanges?.removed.forEach((placeId) => {
        deleteSchedule(selectedDay.id, placeId)
        if (selectedScheduleId === placeId) setSelectedScheduleId(null)
      })
      placeChanges?.updates.forEach((update) =>
        updateSchedule(selectedDay.id, update.id, update.values),
      )
      placeChanges?.added.forEach((placeValues) =>
        addSchedule(selectedDay.id, placeValues, dialogs.dialog.subItinerary.id),
      )
    } else {
      addSubItinerary(selectedDay.id, values)
    }
    dialogs.close()
  }

  const handleConfirmDeleteSubItinerary = () => {
    deleteSubItinerary(selectedDay.id, dialogs.dialog.subItinerary.id)
    setSelectedScheduleId(null)
    setSelectedSubItineraryId(null)
    dialogs.close()
  }

  const handleSubmitDay = (values) => {
    updateDay(dialogs.dialog.day.id, values)
    dialogs.close()
  }

  // 管理天數：整份 days 一次套用（reducer 會依順序重新編號）
  const handleSubmitDays = (days) => {
    replaceDays(days)
    setSelectedScheduleId(null)
    dialogs.close()
  }

  const handleConfirmDelete = () => {
    const { place } = dialogs.dialog
    deleteSchedule(selectedDay.id, place.id)
    if (selectedScheduleId === place.id) setSelectedScheduleId(null)
    dialogs.close()
  }

  const handleConfirmReset = () => {
    resetTrip()
    setSelectedScheduleId(null)
    dialogs.close()
  }

  return (
    // Map-first app shell：固定滿版、頁面本身不捲動
    // --tp-map-inset-* 讓 Leaflet 的控制項與 attribution 避開上下浮動層
    <div
      ref={shellRef}
      className="fixed inset-0 overflow-hidden bg-slate-100 [--tp-map-inset-bottom:var(--tp-panel-h)] [--tp-map-inset-top:11.5rem] lg:[--tp-map-inset-bottom:0px] lg:[--tp-map-inset-right:var(--tp-panel-current-w)]"
    >
      {/* 地圖：整個 App 的背景 */}
      <div className="absolute inset-0">
        <MapView
          className="h-full"
          places={mapPlaces}
          selectedScheduleId={selectedScheduleId}
          focusedSubItineraryId={selectedSubItineraryId}
          onSelectSchedule={handleSelectSchedule}
        />
      </div>

      {/* 上方浮動層：不佔 document flow，不把地圖往下推 */}
      <div
        ref={overlayRef}
        className="absolute inset-x-0 top-0 z-[1100] pt-[env(safe-area-inset-top)]"
      >
        <Header trip={trip} onOpenSettings={dialogs.openSettings} />

        <DaySelector
          days={trip.days}
          selectedDayId={selectedDay.id}
          onSelectDay={handleSelectDay}
          onEditDay={dialogs.openEditDay}
        />
      </div>

      {/* 底部行程面板：Phase 1 固定高度，三態與拖曳留給 Phase 2 */}
      <SchedulePanel
        state={panelState}
        onStateChange={setPanelState}
        summary={`Day ${selectedDay.dayNumber} · ${selectedDayPlaces.length} 個行程`}
      >
        <Schedule
          day={selectedDay}
          selectedScheduleId={selectedScheduleId}
          onSelectSchedule={handleSelectFromTimeline}
          onAddSchedule={dialogs.openAddSchedule}
          onEditSchedule={dialogs.openEditSchedule}
          onDeleteSchedule={dialogs.openDeleteSchedule}
          selectedSubItineraryId={selectedSubItineraryId}
          onFocusSubItinerary={handleFocusSubItinerary}
          onAddSubItinerary={dialogs.openAddSubItinerary}
          onEditSubItinerary={dialogs.openEditSubItinerary}
          onDeleteSubItinerary={dialogs.openDeleteSubItinerary}
          onAddPlaceToSubItinerary={dialogs.openAddSchedule}
          onReorderSchedule={(activeId, overId) =>
            reorderSchedules(selectedDay.id, activeId, overId)
          }
        />

        {/* 資料來源標示：地圖圖磚的 OSM attribution 由 Leaflet 顯示在地圖上，
            路線查詢用到的服務在這裡一併標明 */}
        <footer className="space-y-1 pb-2 pt-4 text-center text-xs text-slate-400">
          <p>Travel Planner · Demo data only</p>
          <p>
            地圖圖磚{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600"
            >
              © OpenStreetMap contributors
            </a>
            ・路線查詢{' '}
            <a
              href="https://transitous.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600"
            >
              Transitous
            </a>
          </p>
        </footer>
      </SchedulePanel>

      {(dialogs.isOpen(DIALOG.ADD_SCHEDULE) || isEditingSchedule) && (
        <EditScheduleModal
          mode={isEditingSchedule ? 'edit' : 'add'}
          initialValues={
            isEditingSchedule
              ? buildEditValues(dialogs.dialog.place)
              : buildAddValues(addTargetPlaces)
          }
          onSubmit={handleSubmitForm}
          onClose={dialogs.close}
        />
      )}

      {(dialogs.isOpen(DIALOG.ADD_SUB_ITINERARY) || isEditingSubItinerary) && (
        <EditSubItineraryModal
          mode={isEditingSubItinerary ? 'edit' : 'add'}
          initialValues={buildSubItineraryValues(dialogs.dialog.subItinerary)}
          places={dialogs.dialog.subItinerary?.places ?? []}
          onSubmit={handleSubmitSubItinerary}
          onClose={dialogs.close}
        />
      )}

      {dialogs.isOpen(DIALOG.DELETE_SUB_ITINERARY) && (
        <ConfirmDialog
          title="刪除整個子行程？"
          message={`「${dialogs.dialog.subItinerary.name}」與其中的 ${dialogs.dialog.subItinerary.places.length} 個地點都會被刪除，此動作無法復原。`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDeleteSubItinerary}
          onCancel={dialogs.close}
        />
      )}

      {dialogs.isOpen(DIALOG.EDIT_DAY) && (
        <EditDayModal
          day={dialogs.dialog.day}
          onSubmit={handleSubmitDay}
          onClose={dialogs.close}
        />
      )}

      {dialogs.isOpen(DIALOG.SETTINGS) && (
        <TripSettingsModal
          onManageDays={dialogs.openManageDays}
          onResetTrip={dialogs.openResetTrip}
          onClose={dialogs.close}
        />
      )}

      {dialogs.isOpen(DIALOG.MANAGE_DAYS) && (
        <DayManagerModal days={trip.days} onSubmit={handleSubmitDays} onClose={dialogs.close} />
      )}

      {dialogs.isOpen(DIALOG.RESET_TRIP) && (
        <ConfirmDialog
          title="重設行程"
          message="會清除瀏覽器中儲存的行程，回到預設的 Tokyo 5 Days 範例。此動作無法復原。"
          confirmLabel="重設"
          onConfirm={handleConfirmReset}
          onCancel={dialogs.close}
        />
      )}

      {dialogs.isOpen(DIALOG.DELETE_SCHEDULE) && (
        <ConfirmDialog
          title="Delete this schedule?"
          message={`確定要刪除「${dialogs.dialog.place.name}」（${dialogs.dialog.place.time}）嗎？此動作無法復原。`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={dialogs.close}
        />
      )}
    </div>
  )
}

export default App
