import { ITEM_TYPE } from './dayItems'
import {
  coerceCategory,
  coerceDayOffset,
  coerceDuration,
  coerceText,
  coerceTime,
  isValidPosition,
} from './placeFields'

/**
 * Trip 資料的 LocalStorage 存取。
 *
 * 整個專案只有這裡會碰 localStorage，component 與 reducer 都不直接操作。
 * 所有函式都不會 throw：讀不到、格式錯、空間不足時回傳安全值並在 console 留訊息。
 *
 * 載入分成兩個層次，刻意不混在一起：
 *
 *  1. 結構檢查（isValidTrip）—— 這是不是一份 trip？
 *     壞掉就整份退回 null，由呼叫端 fallback 到 defaultTrip。
 *
 *  2. 欄位修復（normalizeLoadedTrip）—— 欄位值合不合法？
 *     不合法就收斂成安全值並在 console 說明，不會因為某一筆時間寫錯
 *     就丟掉使用者整份行程。
 *
 * 欄位規則本身在 placeFields，與表單驗證共用同一份，避免兩套規則漂移。
 * 修復時一律「白名單重建」而不是 { ...place }：未知欄位會被丟掉，
 * 所以新增欄位時必須同時改這裡——這正是單一真相來源要付的代價。
 */
const STORAGE_KEY = 'travel-planner:trip'
const STORAGE_VERSION = 3

/**
 * 可讀取的舊版本：
 *  v1 → day.places（載入時轉成 day.items）
 *  v2 → day.items；place 沒有 dayOffset；trip 還有 startDate / endDate / cover
 *  v3 → place.dayOffset；trip 的日期區間改由 days 推導，不再存欄位
 */
const SUPPORTED_VERSIONS = [1, 2, STORAGE_VERSION]

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

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0

/* -------------------------------------------------------------------------- */
/* 1. 結構檢查：只看「是不是一份 trip」，欄位值的對錯留給修復階段               */
/* -------------------------------------------------------------------------- */

function hasPlaceShape(place) {
  return place && isNonEmptyString(place.id) && typeof place.name === 'string'
}

function hasItemShape(item) {
  if (item?.type === ITEM_TYPE.SUB_ITINERARY) {
    return (
      isNonEmptyString(item.id) &&
      typeof item.name === 'string' &&
      Array.isArray(item.places) &&
      item.places.every(hasPlaceShape)
    )
  }
  return item?.type === ITEM_TYPE.PLACE && hasPlaceShape(item.place)
}

function hasDayShape(day) {
  if (!day || !isNonEmptyString(day.id)) return false

  // v1 舊資料是 day.places，載入時會被 migration 轉成 day.items
  if (Array.isArray(day.items)) return day.items.every(hasItemShape)
  return Array.isArray(day.places) && day.places.every(hasPlaceShape)
}

/**
 * 檢查結構是否符合 trip 的最小要求。
 *
 * 這裡是信任邊界：以後資料若來自檔案匯入或網路，會先經過這一關。
 * 所以只檢查「無法修復」的結構問題，欄位值一律交給 normalizeLoadedTrip 收斂。
 */
export function isValidTrip(trip) {
  return (
    trip &&
    typeof trip === 'object' &&
    isNonEmptyString(trip.id) &&
    typeof trip.title === 'string' &&
    Array.isArray(trip.days) &&
    trip.days.length > 0 &&
    trip.days.every(hasDayShape)
  )
}

/* -------------------------------------------------------------------------- */
/* 2. 欄位修復                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 重建一筆 place。
 *
 * position 是唯一無法修復的欄位——沒有合法座標就上不了地圖，
 * 這種 place 會被丟掉並回傳 null，由呼叫端記錄名稱後提示使用者。
 */
function repairPlace(place, report) {
  if (!isValidPosition(place.position)) {
    report.droppedPlaces.push(place.name || place.id)
    return null
  }

  const repaired = {
    id: place.id,
    time: coerceTime(place.time),
    dayOffset: coerceDayOffset(place.dayOffset),
    name: place.name,
    nameLocal: coerceText(place.nameLocal),
    category: coerceCategory(place.category),
    duration: coerceDuration(place.duration),
    note: coerceText(place.note),
    position: [Number(place.position[0]), Number(place.position[1])],
    googleMapsUrl: coerceText(place.googleMapsUrl),
  }

  // 只記「原本有填、但填錯」的欄位；舊資料單純沒有這個欄位不算修復，不該吵
  if (isNonEmptyString(place.time) && repaired.time !== place.time) {
    report.repairedTimes.push(repaired.name)
  }
  if (place.category !== undefined && repaired.category !== place.category) {
    report.repairedCategories.push(repaired.name)
  }

  return repaired
}

function repairItem(item, report) {
  if (item.type === ITEM_TYPE.SUB_ITINERARY) {
    return {
      type: ITEM_TYPE.SUB_ITINERARY,
      id: item.id,
      name: item.name,
      category: coerceCategory(item.category),
      duration: coerceDuration(item.duration),
      note: coerceText(item.note),
      places: item.places.map((place) => repairPlace(place, report)).filter(Boolean),
    }
  }

  const place = repairPlace(item.place, report)
  return place ? { type: ITEM_TYPE.PLACE, place } : null
}

/**
 * 把舊版資料升級到目前的格式，並收斂所有不合法的欄位值。
 *
 * - v1 的 day.places → day.items（順序與內容完全保留）
 * - place.dayOffset：v2 以前沒有這個欄位，一律補 0（= 當天）
 * - day.dayNumber：改為由順序推導，與 REPLACE_DAYS 的規則一致
 * - trip.startDate / endDate / cover：v3 起不再保存，日期區間由 days 推導
 */
function normalizeLoadedTrip(trip, report) {
  return {
    id: trip.id,
    title: trip.title,
    subtitle: coerceText(trip.subtitle),
    days: trip.days.map(({ places, ...day }, index) => {
      const source = Array.isArray(day.items)
        ? day.items
        : (places ?? []).map((place) => ({ type: ITEM_TYPE.PLACE, place }))

      return {
        id: day.id,
        // dayNumber 一律由順序決定，不信任存檔裡的值
        dayNumber: index + 1,
        date: coerceText(day.date),
        // 舊資料可能把這一欄叫 title 或 theme
        description: coerceText(day.description ?? day.title ?? day.theme),
        items: source.map((item) => repairItem(item, report)).filter(Boolean),
      }
    }),
  }
}

function createReport() {
  return { droppedPlaces: [], repairedTimes: [], repairedCategories: [] }
}

/** 修復結果只能靠 console 告知——目前沒有顯示載入警告的 UI */
function logReport(report) {
  if (report.droppedPlaces.length > 0) {
    console.warn(
      `[storage] ${report.droppedPlaces.length} 個地點沒有合法座標，已從行程中移除：`,
      report.droppedPlaces,
    )
  }
  if (report.repairedTimes.length > 0) {
    console.warn('[storage] 以下地點的時間格式不合法，已清空時間：', report.repairedTimes)
  }
  if (report.repairedCategories.length > 0) {
    console.warn('[storage] 以下地點的分類無法識別，已改為預設分類：', report.repairedCategories)
  }
}

/* -------------------------------------------------------------------------- */
/* 對外 API                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 讀取已儲存的行程。
 *
 * @returns 有效的 trip；沒有資料或結構損壞時回傳 null（由呼叫端 fallback 到 defaultTrip）
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

  if (!SUPPORTED_VERSIONS.includes(parsed?.version)) {
    console.error(
      `[storage] 儲存格式版本不支援（找到 ${parsed?.version}，可讀取 ${SUPPORTED_VERSIONS.join(' / ')}），改用預設行程`,
    )
    return null
  }

  if (!isValidTrip(parsed.trip)) {
    console.error('[storage] 儲存的行程結構不正確，改用預設行程：', parsed.trip)
    return null
  }

  const report = createReport()
  const trip = normalizeLoadedTrip(parsed.trip, report)
  logReport(report)

  return trip
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
