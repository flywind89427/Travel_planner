import { INVALID_URL_MESSAGE, isGoogleMapsUrl } from '../utils/googleMaps'

/**
 * 行程時間相關的純函式，Map / Timeline / reducer 共用。
 * 這裡不碰 React，也不碰任何 state。
 */

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

/** 分鐘數 → 'HH:mm'（跨日會自動回到 00:00 起算） */
export function toTimeString(minutes) {
  const safe = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hour = String(Math.floor(safe / 60)).padStart(2, '0')
  const minute = String(safe % 60).padStart(2, '0')
  return `${hour}:${minute}`
}

/** 由開始時間與停留分鐘數推算結束時間 */
export function getEndTime(place) {
  const start = toMinutes(place?.time)
  if (start === null) return ''
  return toTimeString(start + (Number(place.duration) || 0))
}

/** 分鐘數 → 顯示字串，例如 90 → '1h 30m' */
export function formatDuration(minutes) {
  const total = Number(minutes)
  if (!Number.isFinite(total) || total <= 0) return null

  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}

/** 依開始時間排序，時間不合法的排到最後，同時間維持原順序 */
export function sortByTime(places) {
  return [...places].sort((a, b) => {
    const left = toMinutes(a.time)
    const right = toMinutes(b.time)
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    return left - right
  })
}

/** 產生行程點的唯一 id */
let sequence = 0
export function createScheduleId() {
  sequence += 1
  return `sch-${Date.now().toString(36)}-${sequence.toString(36)}`
}

/** 產生天數的唯一 id */
export function createDayId() {
  sequence += 1
  return `day-${Date.now().toString(36)}-${sequence.toString(36)}`
}

/** 產生子行程的唯一 id */
export function createSubItineraryId() {
  sequence += 1
  return `sub-${Date.now().toString(36)}-${sequence.toString(36)}`
}

/**
 * 把表單輸入整理成乾淨的行程點資料。
 * 只保留資料層需要的欄位，並把數字欄位轉成正確型別。
 */
export function normalizeSchedule(values) {
  const lat = Number(values.lat)
  const lng = Number(values.lng)

  return {
    time: values.time,
    name: values.name.trim(),
    nameLocal: (values.nameLocal ?? '').trim(),
    category: values.category || 'sightseeing',
    duration: Math.max(0, Number(values.duration) || 0),
    note: (values.note ?? '').trim(),
    position: [lat, lng],
    googleMapsUrl: (values.googleMapsUrl ?? '').trim(),
  }
}

/** 表單驗證，回傳 { 欄位: 錯誤訊息 }，沒有錯誤就是空物件 */
export function validateSchedule(values) {
  const errors = {}

  if (toMinutes(values.time) === null) errors.time = '請輸入有效時間（HH:mm）'
  if (!values.name?.trim()) errors.name = '請輸入地點名稱'

  const duration = Number(values.duration)
  if (!Number.isFinite(duration) || duration < 0) errors.duration = '停留時間需為 0 以上的數字'

  // 座標一律由地點搜尋帶入，使用者不會手動輸入
  const lat = Number(values.lat)
  const lng = Number(values.lng)
  const hasValidPosition =
    values.lat !== '' &&
    values.lng !== '' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180

  if (!hasValidPosition) {
    errors.location = '請用「Search Place」選擇地點，或貼上含座標的 Google Maps 連結'
  }

  // 連結可留空；有填就必須是合法的 Google Maps 連結
  const url = (values.googleMapsUrl ?? '').trim()
  if (url && !isGoogleMapsUrl(url)) errors.googleMapsUrl = INVALID_URL_MESSAGE

  return errors
}
