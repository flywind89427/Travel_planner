import { normalizeSchedule } from '../utils/scheduleHelpers'
import {
  ITEM_TYPE,
  getItemId,
  mapPlaceInItems,
  moveById,
  normalizeSubItinerary,
  removePlaceFromItems,
  sortItemsByTime,
  toPlaceItem,
} from '../utils/dayItems'

/**
 * trip state 的唯一修改入口。
 * reducer 保持純函式：不產生 id、不讀取時間、不碰 DOM。
 *
 * 一天的內容是 items：一般地點與子行程混排，兩者在排序上同層級。
 *
 * 排序原則（支援拖曳後）：
 *   items 這個 array 的順序就是使用者設定的行程順序，
 *   新增與修改都不會自動重新排序，否則拖曳的結果會被洗掉。
 *   要依時間排序時，由使用者主動觸發 SORT_SCHEDULES_BY_TIME。
 */
export const TRIP_ACTIONS = {
  ADD_SCHEDULE: 'schedule/add',
  UPDATE_SCHEDULE: 'schedule/update',
  DELETE_SCHEDULE: 'schedule/delete',
  ADD_SUB_ITINERARY: 'subItinerary/add',
  UPDATE_SUB_ITINERARY: 'subItinerary/update',
  DELETE_SUB_ITINERARY: 'subItinerary/delete',
  REORDER_SUB_ITINERARY_PLACES: 'subItinerary/reorderPlaces',
  UPDATE_DAY: 'day/update',
  REPLACE_DAYS: 'days/replace',
  REORDER_SCHEDULES: 'schedule/reorder',
  SORT_SCHEDULES_BY_TIME: 'schedule/sortByTime',
  RESET_TRIP: 'trip/reset',
}

/** 只替換指定那一天，其餘 day 物件保持同一個 reference */
function mapDay(trip, dayId, updateItems) {
  return {
    ...trip,
    days: trip.days.map((day) =>
      day.id === dayId ? { ...day, items: updateItems(day.items) } : day,
    ),
  }
}

/** 只替換指定的子行程 */
function mapSubItinerary(items, subItineraryId, updateSub) {
  return items.map((item) =>
    item.type === ITEM_TYPE.SUB_ITINERARY && item.id === subItineraryId ? updateSub(item) : item,
  )
}

export function tripReducer(state, action) {
  switch (action.type) {
    case TRIP_ACTIONS.ADD_SCHEDULE: {
      const { dayId, id, values, parentId } = action
      const place = { id, ...normalizeSchedule(values) }

      // 指定 parentId 就加進該子行程，否則成為一天中的一個行程單位
      if (parentId) {
        return mapDay(state, dayId, (items) =>
          mapSubItinerary(items, parentId, (sub) => ({ ...sub, places: [...sub.places, place] })),
        )
      }

      return mapDay(state, dayId, (items) => [...items, toPlaceItem(place)])
    }

    case TRIP_ACTIONS.UPDATE_SCHEDULE: {
      const { dayId, id, values } = action
      // 子行程內的 place 也適用同一個 action
      return mapDay(state, dayId, (items) =>
        mapPlaceInItems(items, id, (place) => ({ ...place, ...normalizeSchedule(values) })),
      )
    }

    case TRIP_ACTIONS.DELETE_SCHEDULE: {
      const { dayId, id } = action
      return mapDay(state, dayId, (items) => removePlaceFromItems(items, id))
    }

    case TRIP_ACTIONS.ADD_SUB_ITINERARY: {
      const { dayId, id, values } = action
      const subItinerary = {
        type: ITEM_TYPE.SUB_ITINERARY,
        id,
        ...normalizeSubItinerary(values),
        places: [], // 子行程不可巢狀，裡面一律是既有的 place
      }
      return mapDay(state, dayId, (items) => [...items, subItinerary])
    }

    case TRIP_ACTIONS.UPDATE_SUB_ITINERARY: {
      const { dayId, id, values } = action
      return mapDay(state, dayId, (items) =>
        mapSubItinerary(items, id, (sub) => ({ ...sub, ...normalizeSubItinerary(values) })),
      )
    }

    // 刪除子行程時，裡面的 place 一併移除
    case TRIP_ACTIONS.DELETE_SUB_ITINERARY: {
      const { dayId, id } = action
      return mapDay(state, dayId, (items) =>
        items.filter((item) => !(item.type === ITEM_TYPE.SUB_ITINERARY && item.id === id)),
      )
    }

    case TRIP_ACTIONS.REORDER_SUB_ITINERARY_PLACES: {
      const { dayId, subItineraryId, activeId, overId } = action
      if (!activeId || !overId || activeId === overId) return state

      return mapDay(state, dayId, (items) =>
        mapSubItinerary(items, subItineraryId, (sub) => {
          const next = moveById(sub.places, (place) => place.id, activeId, overId)
          return next ? { ...sub, places: next } : sub
        }),
      )
    }

    // 拖曳排序：把 activeId 移到 overId 目前的位置（子行程整組一起移動）
    case TRIP_ACTIONS.REORDER_SCHEDULES: {
      const { dayId, activeId, overId } = action

      // 沒有放開在有效目標上、或拖到自己身上，都不改變資料
      if (!activeId || !overId || activeId === overId) return state

      const day = state.days.find((item) => item.id === dayId)
      if (!day) return state

      // 只搬移物件位置，id 與其他欄位（含 googleMapsUrl）原封不動
      const next = moveById(day.items, getItemId, activeId, overId)
      return next ? mapDay(state, dayId, () => next) : state
    }

    // 使用者主動要求「依時間排序」；子行程以第一個 child 的時間為代表
    case TRIP_ACTIONS.SORT_SCHEDULES_BY_TIME: {
      const { dayId } = action
      return mapDay(state, dayId, (items) => sortItemsByTime(items))
    }

    case TRIP_ACTIONS.UPDATE_DAY: {
      const { dayId, values } = action
      return {
        ...state,
        days: state.days.map((day) =>
          day.id === dayId
            ? { ...day, date: values.date, description: (values.description ?? '').trim() }
            : day,
        ),
      }
    }

    // 管理天數：新增／刪除／排序／改內容一次套用
    case TRIP_ACTIONS.REPLACE_DAYS: {
      const { days } = action
      if (!Array.isArray(days) || days.length === 0) return state

      return {
        ...state,
        // dayNumber 一律由排序決定，不由使用者輸入；
        // date / description / places 隨該天一起搬移，不重新計算
        days: days.map((day, index) => ({ ...day, dayNumber: index + 1 })),
      }
    }

    case TRIP_ACTIONS.RESET_TRIP:
      return action.trip

    default:
      return state
  }
}
