import { CATEGORIES } from '../data/categories'

/**
 * place 各欄位的「唯一真相」：格式規則、合法範圍與修復用的預設值。
 *
 * 以前同一條規則存在兩份：表單用 validateSchedule（嚴格，檢查 HH:mm 與經緯度範圍），
 * 載入用 storage.isValidPlace（寬鬆，只看型別）。兩套規則會漂移，
 * 結果是手改過或來自外部的資料能通過載入，卻在下游被靜默忽略
 *（例如 time: '99:99' → toMinutes() 回 null → 該筆被安靜排到最後）。
 *
 * 這個模組只有純函式與常數，且刻意只 import data/categories（本身不 import 任何東西），
 * 避免與 scheduleHelpers / dayItems 形成循環相依。
 */

/** 分類找不到時的回退值；顏色的回退在 dayItems.getCategoryColor */
export const DEFAULT_CATEGORY = 'sightseeing'

/** 一天的分鐘總數 */
export const MINUTES_PER_DAY = 1440

/**
 * dayOffset：這個時間屬於該 day 的第幾天，0 = 當天、1 = 翌日。
 *
 * 行程的 time 只有 'HH:mm'，沒有日期維度，所以深夜場景（居酒屋到凌晨、紅眼班機）
 * 無法只用 time 表達——01:30 會被當成當天最早的項目。dayOffset 補上這個維度，
 * 排序與時間檢查一律用 getPlaceMinutes() 算出的絕對分鐘數，而不是 toMinutes(time)。
 *
 * 只允許 0 與 1：一個 day 的項目跨到第三天的話，那應該是新增一天，不是加大 offset。
 */
export const MAX_DAY_OFFSET = 1

/** 'HH:mm' → 當天的分鐘數；格式不合法回傳 null */
export function toMinutes(time) {
  if (typeof time !== 'string') return null
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/** 分鐘數 → 'HH:mm'（超過一天的部分由 dayOffset 表達，這裡只回時鐘時間） */
export function toTimeString(minutes) {
  const safe = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hour = String(Math.floor(safe / 60)).padStart(2, '0')
  const minute = String(safe % 60).padStart(2, '0')
  return `${hour}:${minute}`
}

/** 時間是選填的：空字串代表「還沒設定」，有值就必須是合法的 HH:mm */
export function isValidTime(value) {
  if (value === '') return true
  return toMinutes(value) !== null
}

/** 停留分鐘數：0 以上的有限數字 */
export function isValidDuration(value) {
  const duration = Number(value)
  return Number.isFinite(duration) && duration >= 0
}

export function isValidDayOffset(value) {
  const offset = Number(value)
  return Number.isInteger(offset) && offset >= 0 && offset <= MAX_DAY_OFFSET
}

export function isValidLat(value) {
  const lat = Number(value)
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
}

export function isValidLng(value) {
  const lng = Number(value)
  return Number.isFinite(lng) && lng <= 180 && lng >= -180
}

/** position 一律是 [lat, lng]；這是唯一無法修復的欄位，沒有座標就上不了地圖 */
export function isValidPosition(position) {
  return (
    Array.isArray(position) &&
    position.length === 2 &&
    isValidLat(position[0]) &&
    isValidLng(position[1])
  )
}

export function isValidCategory(value) {
  return typeof value === 'string' && Object.hasOwn(CATEGORIES, value)
}

/* -------------------------------------------------------------------------- */
/* 修復用的轉換：載入外部／舊版資料時把不合法的值收斂成安全值               */
/* -------------------------------------------------------------------------- */

export const coerceTime = (value) => (isValidTime(value) ? value : '')
export const coerceDuration = (value) => (isValidDuration(value) ? Number(value) : 0)
export const coerceDayOffset = (value) => (isValidDayOffset(value) ? Number(value) : 0)
export const coerceCategory = (value) => (isValidCategory(value) ? value : DEFAULT_CATEGORY)
export const coerceText = (value) => (typeof value === 'string' ? value : '')

/**
 * place 的絕對分鐘數：以該 day 的 00:00 為原點，翌日 01:30 → 1530。
 * 排序與時間檢查都必須用這個，不能直接用 toMinutes(place.time)。
 */
export function getPlaceMinutes(place) {
  const start = toMinutes(place?.time)
  if (start === null) return null
  return coerceDayOffset(place?.dayOffset) * MINUTES_PER_DAY + start
}
