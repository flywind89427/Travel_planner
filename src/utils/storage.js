import { ITEM_TYPE } from './dayItems'
import {
  DEFAULT_TIME_ZONE,
  coerceCategory,
  coerceDayOffset,
  coerceDuration,
  coerceText,
  coerceTime,
  coerceTimezone,
  isValidPosition,
} from './placeFields'

/**
 * Trip 資料的 LocalStorage 存取。
 *
 * 整個專案只有這裡會碰 localStorage，component 與 reducer 都不直接操作。
 * 所有函式都不會 throw：讀不到、格式錯、空間不足時回傳安全值並在 console 留訊息。
 *
 * 載入是三層管線，刻意分開：
 *
 *  1. 版本遷移（MIGRATIONS）—— 這份資料是哪個版本寫的？
 *     只處理「語意性」改動：光看資料本身推斷不出來、必須知道來源版本才能
 *     正確解讀的那種。每一步都是獨立的純函式，可以單獨測試。
 *
 *  2. 結構檢查（isValidTrip）—— 這是不是一份 trip？
 *     壞掉就整份退回 null，由呼叫端 fallback 到 defaultTrip。
 *     跑在遷移之後，所以可以直接要求最新的形狀（day.items）。
 *
 *  3. 欄位修復（normalizeLoadedTrip）—— 欄位值合不合法？
 *     不合法就收斂成安全值並在 console 說明，不會因為某一筆時間寫錯
 *     就丟掉使用者整份行程。這一層與版本無關、而且是幂等的。
 *
 * 欄位規則本身在 placeFields，與表單驗證共用同一份，避免兩套規則漂移。
 * 修復時一律「白名單重建」而不是 { ...place }：未知欄位會被丟掉，
 * 所以新增欄位時必須同時改這裡——這正是單一真相來源要付的代價。
 */
const STORAGE_KEY = 'travel-planner:trip'
const STORAGE_VERSION = 4

/**
 * 可讀取的版本：
 *  v1 → day.places（遷移成 day.items）
 *  v2 → day.items；place 沒有 dayOffset；trip 還有 startDate / endDate / cover
 *  v3 → place.dayOffset；trip 的日期區間改由 days 推導，不再存欄位
 *  v4 → trip.timezone（在此之前時區是寫死在 transitTime.js 的常數）
 */
const SUPPORTED_VERSIONS = [1, 2, 3, STORAGE_VERSION]

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
/* 1. 版本遷移                                                                */
/* -------------------------------------------------------------------------- */

/**
 * v1 → v2：day.places 轉成 day.items。
 * 順序與內容完全保留，只是把每筆 place 包成 { type: 'place', place }。
 */
function v1ToV2(trip) {
  return {
    ...trip,
    days: trip.days.map(({ places, ...day }) => ({
      ...day,
      items: Array.isArray(day.items)
        ? day.items
        : (places ?? []).map((place) => ({ type: ITEM_TYPE.PLACE, place })),
    })),
  }
}

/**
 * v3 → v4：補上 trip.timezone。
 *
 * 這是真正需要版本資訊的遷移，coerce 做不到：v3 資料沒有時區欄位，
 * 但它的時間一直都是「東京當地時間」—— transitTime.js 當時把 'Asia/Tokyo'
 * 寫死在常數裡。所以這裡補的是既有資料本來就有的語意，不是猜一個預設值。
 */
function v3ToV4(trip) {
  return { ...trip, timezone: trip.timezone ?? DEFAULT_TIME_ZONE }
}

/**
 * 版本步驟鏈：key 是「從哪一版升上來」。
 *
 * 缺少的版號代表那一步沒有語意改動，只是新增選填欄位，交給第 3 層的 coerce 補值
 *（v2 → v3 新增 place.dayOffset 就是這種，所以這裡沒有 2）。
 * 之後若出現「同一個欄位換語意」的改動（例如 duration 從分鐘改成秒），
 * 就必須在這裡新增一步——那種改動光看 `90` 這個值是分不出來的。
 */
const MIGRATIONS = {
  1: v1ToV2,
  3: v3ToV4,
}

function migrate(trip, fromVersion) {
  let current = trip
  for (let version = fromVersion; version < STORAGE_VERSION; version += 1) {
    const step = MIGRATIONS[version]
    if (step) current = step(current)
  }
  return current
}

/* -------------------------------------------------------------------------- */
/* 2. 結構檢查：只看「是不是一份 trip」，欄位值的對錯留給修復階段               */
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
  return (
    day && isNonEmptyString(day.id) && Array.isArray(day.items) && day.items.every(hasItemShape)
  )
}

/**
 * 檢查結構是否符合 trip 的最小要求。
 *
 * 這裡是信任邊界：以後資料若來自檔案匯入或網路，會先經過這一關。
 * 跑在遷移之後，所以直接要求最新的形狀；只檢查「無法修復」的結構問題，
 * 欄位值一律交給 normalizeLoadedTrip 收斂。
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
/* 3. 欄位修復                                                                */
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
 * 收斂所有不合法的欄位值，並丟掉白名單以外的欄位。
 *
 * 跑在遷移之後，所以 day.items 一定存在。這一層與版本無關：
 * 同一份資料跑兩次結果相同，所以新增選填欄位不需要新的遷移步驟。
 *
 * - day.dayNumber：由順序推導，與 REPLACE_DAYS 的規則一致
 * - day.description：舊資料可能把這一欄叫 title 或 theme，一併接受
 * - trip.startDate / endDate / cover：v3 起不再保存，日期區間由 days 推導
 */
function normalizeLoadedTrip(trip, report) {
  return {
    id: trip.id,
    title: trip.title,
    subtitle: coerceText(trip.subtitle),
    timezone: coerceTimezone(trip.timezone),
    days: trip.days.map((day, index) => ({
      id: day.id,
      dayNumber: index + 1,
      date: coerceText(day.date),
      description: coerceText(day.description ?? day.title ?? day.theme),
      items: day.items.map((item) => repairItem(item, report)).filter(Boolean),
    })),
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

  // 遷移跑在結構檢查之前，所以要自己擋住完全不成形的資料
  let migrated
  try {
    migrated = migrate(parsed.trip, parsed.version)
  } catch (error) {
    console.error('[storage] 升級儲存的行程時失敗，改用預設行程：', error)
    return null
  }

  if (!isValidTrip(migrated)) {
    console.error('[storage] 儲存的行程結構不正確，改用預設行程：', migrated)
    return null
  }

  const report = createReport()
  const trip = normalizeLoadedTrip(migrated, report)
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
