import { useCallback, useEffect, useReducer } from 'react'
import { defaultTrip } from '../data/defaultTrip'
import { clearTrip, loadTrip, saveTrip } from '../utils/storage'
import { createScheduleId, createSubItineraryId } from '../utils/scheduleHelpers'
import { TRIP_ACTIONS, tripReducer } from './tripReducer'

/**
 * useTrip：對外提供 trip 資料與四個操作，UI 不需要知道 reducer 或 localStorage 的存在。
 *
 * - 初始資料：優先讀 localStorage，沒有或格式錯誤就用 defaultTrip
 * - 自動儲存：trip 只要改變就寫回 localStorage
 * - 只存行程資料本身，selectedDayId / selectedScheduleId 屬於 UI state，不寫入
 */
export function useTrip(fallbackTrip = defaultTrip) {
  // 用 lazy initializer，讀取只會在第一次 render 發生
  const [trip, dispatch] = useReducer(tripReducer, fallbackTrip, (initial) => loadTrip() ?? initial)

  useEffect(() => {
    saveTrip(trip)
  }, [trip])

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

  const updateDay = useCallback((dayId, values) => {
    dispatch({ type: TRIP_ACTIONS.UPDATE_DAY, dayId, values })
  }, [])

  /** 管理天數：把整理後的 days 一次寫回 */
  const replaceDays = useCallback((days) => {
    dispatch({ type: TRIP_ACTIONS.REPLACE_DAYS, days })
  }, [])

  /** 清掉已儲存的資料並回到預設行程 */
  const resetTrip = useCallback(() => {
    clearTrip()
    dispatch({ type: TRIP_ACTIONS.RESET_TRIP, trip: fallbackTrip })
  }, [fallbackTrip])

  return {
    trip,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    addSubItinerary,
    updateSubItinerary,
    deleteSubItinerary,
    reorderSubItineraryPlaces,
    reorderSchedules,
    sortSchedulesByTime,
    updateDay,
    replaceDays,
    resetTrip,
  }
}

export default useTrip
