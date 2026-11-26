import { useCallback, useEffect, useReducer, useRef } from 'react'
import { defaultTrip } from '../data/defaultTrip'
import { clearTrip, loadTrip, saveTrip } from '../utils/storage'
import { createScheduleId, createSubItineraryId } from '../utils/scheduleHelpers'
import { TRIP_ACTIONS, tripReducer } from './tripReducer'
import { HISTORY_ACTIONS, initHistory, withUndo } from './undoable'

/**
 * useTrip：對外提供 trip 資料與操作，UI 不需要知道 reducer 或 localStorage 的存在。
 *
 * - 初始資料：優先讀 localStorage，沒有或格式錯誤就用 defaultTrip
 * - 自動儲存：trip 改變後 debounce 寫回 localStorage，關閉／切到背景時立刻補寫
 * - 可復原：每個改變資料的 action 都會留下一步歷史，undo() 回到上一步
 * - 只存行程資料本身，selectedDayId / selectedScheduleId 屬於 UI state，不寫入
 */

// 在 module 層包一次就好；寫在 component 裡每次 render 都會產生新的 reducer
const undoableTripReducer = withUndo(tripReducer)

/**
 * 寫入延遲。
 *
 * 原本每個 dispatch 都同步 JSON.stringify 整份行程再寫入，
 * 連續操作（拖曳、連續編輯）會重複做整份序列化。
 * 但 debounce 本身會製造一個「改完還沒寫入」的空窗，
 * 所以一定要搭配下面 pagehide / visibilitychange 的補寫，否則反而更容易掉資料。
 */
const SAVE_DEBOUNCE_MS = 500

export function useTrip(fallbackTrip = defaultTrip) {
  // 用 lazy initializer，讀取只會在第一次 render 發生
  const [state, dispatch] = useReducer(undoableTripReducer, fallbackTrip, (initial) =>
    initHistory(loadTrip() ?? initial),
  )

  const trip = state.present
  const canUndo = state.past.length > 0

  // 補寫時要拿得到「最新」的 trip，而不是 effect 當時捕捉到的那份
  const tripRef = useRef(trip)
  const isDirtyRef = useRef(false)
  const isFirstRenderRef = useRef(true)

  useEffect(() => {
    tripRef.current = trip

    // 初次掛載時畫面上的資料就是剛從 localStorage 讀進來的，不需要立刻寫回去
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return undefined
    }

    isDirtyRef.current = true
    const timer = window.setTimeout(() => {
      saveTrip(trip)
      isDirtyRef.current = false
    }, SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [trip])

  // 關閉分頁或切到背景時把還沒寫入的改動補上。
  // pagehide 比 beforeunload 可靠（手機瀏覽器常常不觸發 beforeunload）
  useEffect(() => {
    const flush = () => {
      if (!isDirtyRef.current) return
      saveTrip(tripRef.current)
      isDirtyRef.current = false
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      flush()
    }
  }, [])

  // id 在這裡產生，reducer 才能維持純函式
  // parentId 有值時，這筆 place 會加進該子行程
  const addSchedule = useCallback((dayId, values, parentId) => {
    const id = createScheduleId()
    dispatch({ type: TRIP_ACTIONS.ADD_SCHEDULE, dayId, id, values, parentId })
    return id
  }, [])

  const updateSchedule = useCallback((dayId, id, values) => {
    dispatch({ type: TRIP_ACTIONS.UPDATE_SCHEDULE, dayId, id, values })
  }, [])

  const deleteSchedule = useCallback((dayId, id) => {
    dispatch({ type: TRIP_ACTIONS.DELETE_SCHEDULE, dayId, id })
  }, [])

  const addSubItinerary = useCallback((dayId, values) => {
    const id = createSubItineraryId()
    dispatch({ type: TRIP_ACTIONS.ADD_SUB_ITINERARY, dayId, id, values })
    return id
  }, [])

  const updateSubItinerary = useCallback((dayId, id, values) => {
    dispatch({ type: TRIP_ACTIONS.UPDATE_SUB_ITINERARY, dayId, id, values })
  }, [])

  const deleteSubItinerary = useCallback((dayId, id) => {
    dispatch({ type: TRIP_ACTIONS.DELETE_SUB_ITINERARY, dayId, id })
  }, [])

  const reorderSubItineraryPlaces = useCallback((dayId, subItineraryId, activeId, overId) => {
    dispatch({ type: TRIP_ACTIONS.REORDER_SUB_ITINERARY_PLACES, dayId, subItineraryId, activeId, overId })
  }, [])

  /** 拖曳排序：只傳 id，實際位置計算留在 reducer 裡 */
  const reorderSchedules = useCallback((dayId, activeId, overId) => {
    dispatch({ type: TRIP_ACTIONS.REORDER_SCHEDULES, dayId, activeId, overId })
  }, [])

  const sortSchedulesByTime = useCallback((dayId) => {
    dispatch({ type: TRIP_ACTIONS.SORT_SCHEDULES_BY_TIME, dayId })
  }, [])

  /** trip 層欄位（目前只有 timezone） */
  const updateTrip = useCallback((values) => {
    dispatch({ type: TRIP_ACTIONS.UPDATE_TRIP, values })
  }, [])

  const updateDay = useCallback((dayId, values) => {
    dispatch({ type: TRIP_ACTIONS.UPDATE_DAY, dayId, values })
  }, [])

  /** 管理天數：把整理後的 days 一次寫回 */
  const replaceDays = useCallback((days) => {
    dispatch({ type: TRIP_ACTIONS.REPLACE_DAYS, days })
  }, [])

  /** 回到上一步；reset 也在歷史裡，所以誤按「重設行程」同樣救得回來 */
  const undo = useCallback(() => {
    dispatch({ type: HISTORY_ACTIONS.UNDO })
  }, [])

  /** 清掉已儲存的資料並回到預設行程 */
  const resetTrip = useCallback(() => {
    clearTrip()
    dispatch({ type: TRIP_ACTIONS.RESET_TRIP, trip: fallbackTrip })
  }, [fallbackTrip])

  return {
    trip,
    canUndo,
    undo,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    addSubItinerary,
    updateSubItinerary,
    deleteSubItinerary,
    reorderSubItineraryPlaces,
    reorderSchedules,
    sortSchedulesByTime,
    updateTrip,
    updateDay,
    replaceDays,
    resetTrip,
  }
}

export default useTrip
