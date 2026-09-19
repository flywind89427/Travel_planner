import { toPlaceItem } from './dayItems'

/**
 * Trip 資料的 LocalStorage 存取。
 *
 * 整個專案只有這裡會碰 localStorage，component 與 reducer 都不直接操作。
 * 所有函式都不會 throw：讀不到、格式錯、空間不足時回傳安全值並在 console 留訊息。
 */
const STORAGE_KEY = 'travel-planner:trip'
const STORAGE_VERSION = 2

/** 無痕模式或瀏覽器停用儲存時，localStorage 存取本身就會 throw */
function getStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch (error) {
    console.warn('[storage] 無法存取 localStorage：', error)
    return null
  }
}

function isValidPlace(place) {
  return (
    place &&
    typeof place.id === 'string' &&
    typeof place.name === 'string' &&
    typeof place.time === 'string' &&
    Array.isArray(place.position) &&
    place.position.length === 2 &&
    place.position.every((value) => typeof value === 'number' && Number.isFinite(value)) &&
    // googleMapsUrl 為選填：舊資料沒有這個欄位也要能讀入
    (place.googleMapsUrl === undefined || typeof place.googleMapsUrl === 'string')
  )
}

function isValidItem(item) {
  if (item?.type === 'subItinerary') {
    return (
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      // color 為選填：舊資料沒有這個欄位時，UI 會回退到預設色
      (item.color === undefined || typeof item.color === 'string') &&
      Array.isArray(item.places) &&
      item.places.every(isValidPlace)
    )
  }
  return item?.type === 'place' && isValidPlace(item.place)
}

function isValidDay(day) {
  if (!day || typeof day.id !== 'string' || typeof day.dayNumber !== 'number') return false

  // v1 舊資料是 day.places，載入時會被 migration 轉成 day.items
  if (Array.isArray(day.items)) return day.items.every(isValidItem)
  return Array.isArray(day.places) && day.places.every(isValidPlace)
}

/**
 * 檢查結構是否符合 trip 的最小要求。
 * 版本升級或使用者手動改壞資料時，這裡就會擋下來。
 */
export function isValidTrip(trip) {
  return (
    trip &&
    typeof trip === 'object' &&
    typeof trip.id === 'string' &&
    typeof trip.title === 'string' &&
    Array.isArray(trip.days) &&
    trip.days.length > 0 &&
    trip.days.every(isValidDay)
  )
}

const withDefaults = (place) => ({ ...place, googleMapsUrl: place.googleMapsUrl ?? '' })

/**
 * 補齊舊版資料缺少的欄位，讓升級後的格式不會讓既有行程失效。
 * - day.description：舊資料可能是 title / theme，沒有就給空字串
 * - day.items：v1 的 day.places 轉成 items，順序與內容完全保留
 * - place.googleMapsUrl：舊資料沒有這個欄位
 */
function normalizeLoadedTrip(trip) {
  return {
    ...trip,
    days: trip.days.map(({ places, ...day }) => {
      const items = Array.isArray(day.items)
        ? day.items.map((item) =>
            item.type === 'subItinerary'
              ? { ...item, places: item.places.map(withDefaults) }
              : toPlaceItem(withDefaults(item.place)),
          )
        : (places ?? []).map((place) => toPlaceItem(withDefaults(place)))

      return {
        ...day,
        description: day.description ?? day.title ?? day.theme ?? '',
        items,
      }
    }),
  }
}

/**
 * 讀取已儲存的行程。
 *
 * @returns 有效的 trip；沒有資料或資料損壞時回傳 null（由呼叫端 fallback 到 defaultTrip）
 */
export function loadTrip() {
  const storage = getStorage()
  if (!storage) return null

  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return null

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error('[storage] 儲存的行程不是合法 JSON，改用預設行程：', error)
    return null
  }

  // v1（day.places）會在 normalizeLoadedTrip 內升級為 v2（day.items）
  const supportedVersions = [1, STORAGE_VERSION]
  if (!supportedVersions.includes(parsed?.version)) {
    console.error(
      `[storage] 儲存格式版本不支援（找到 ${parsed?.version}，可讀取 ${supportedVersions.join(' / ')}），改用預設行程`,
    )
    return null
  }

  if (!isValidTrip(parsed.trip)) {
    console.error('[storage] 儲存的行程結構不正確，改用預設行程：', parsed.trip)
    return null
  }

  return normalizeLoadedTrip(parsed.trip)
}

/**
 * 儲存行程。只存 trip 本身，
 * selectedScheduleId / selectedDayId 屬於 UI state，不寫入。
 */
export function saveTrip(trip) {
  const storage = getStorage()
  if (!storage) return false

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, trip }))
    return true
  } catch (error) {
    // 空間不足或權限不足都走這裡，不影響畫面操作
    console.error('[storage] 儲存行程失敗：', error)
    return false
  }
}

/** 清除已儲存的行程 */
export function clearTrip() {
  const storage = getStorage()
  if (!storage) return false

  try {
    storage.removeItem(STORAGE_KEY)
    return true
  } catch (error) {
    console.error('[storage] 清除行程失敗：', error)
    return false
  }
}

export const STORAGE_KEY_NAME = STORAGE_KEY
