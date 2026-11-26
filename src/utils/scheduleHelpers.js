import { INVALID_URL_MESSAGE, isGoogleMapsUrl } from '../utils/googleMaps'
import {
  DEFAULT_CATEGORY,
  MINUTES_PER_DAY,
  coerceDayOffset,
  getPlaceMinutes,
  isValidDuration,
  isValidLat,
  isValidLng,
  toMinutes,
  toTimeString,
} from './placeFields'

/**
 * 行程時間相關的純函式，Map / Timeline / reducer 共用。
 * 這裡不碰 React，也不碰任何 state。
 *
 * 欄位的格式規則與合法範圍一律來自 placeFields（表單與 storage 共用同一份），
 * 這個模組只負責「用那些規則做事」：推算結束時間、排序、產生 id、整理表單輸入。
 */

// 規則本身放在 placeFields，但既有 import 路徑（含 components）都指向這裡，所以繼續 re-export
export { getPlaceMinutes, toMinutes, toTimeString }

/**
 * 結束時間：回傳 { time, dayOffset }，null 代表沒有可用的開始時間。
 *
 * 跨午夜時 dayOffset 會比開始時間大，例如 23:30 停留 90 分鐘
 * → { time: '01:00', dayOffset: 1 }。只回 'HH:mm' 的話呼叫端無從得知是隔天。
 */
export function getPlaceEnd(place) {
  const start = getPlaceMinutes(place)
  if (start === null) return null

  const end = start + (Number(place?.duration) || 0)
  return { time: toTimeString(end), dayOffset: Math.floor(end / MINUTES_PER_DAY) }
}

/** 顯示用的時間字串；翌日的項目帶「翌日」前綴，沒有時間回空字串 */
export function formatPlaceTime(place) {
  const time = typeof place?.time === 'string' ? place.time : ''
  if (!time) return ''
  return coerceDayOffset(place?.dayOffset) > 0 ? `翌日 ${time}` : time
}

/** 顯示用的結束時間字串，規則與 formatPlaceTime 一致 */
export function formatPlaceEnd(place) {
  const end = getPlaceEnd(place)
  if (!end) return ''
  return end.dayOffset > 0 ? `翌日 ${end.time}` : end.time
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

/**
 * 產生 id。
 *
 * 用 UUID 而不是「時間戳 + module 內的流水號」：流水號在重新載入後會歸零，
 * 而 defaultTrip 的 id 是寫死的，所以兩份源自同一份範本的行程必定撞 id。
 * 現在還沒有匯入／同步功能，但等有了才換就得處理既有資料的衝突，
 * 現在換則完全沒有遷移成本（舊 id 本身仍然有效，只是新產生的不再碰撞）。
 *
 * crypto.randomUUID 需要 secure context：用內網 IP（http://192.168.x.x:5173）
 * 開 dev server 時它是 undefined，所以保留 getRandomValues 的回退路徑
 *（getRandomValues 在非 secure context 也能用）。
 */
function randomId() {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

    if (typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    }
  }

  // 連 crypto 都沒有的環境（極舊瀏覽器 / 非瀏覽器）才會走到這裡
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 產生行程點的唯一 id */
export function createScheduleId() {
  return `sch-${randomId()}`
}

/** 產生天數的唯一 id */
export function createDayId() {
  return `day-${randomId()}`
}

/** 產生子行程的唯一 id */
export function createSubItineraryId() {
  return `sub-${randomId()}`
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
    // 表單用 checkbox 收這個欄位，所以這裡接受 boolean 也接受數字
    dayOffset: values.dayOffset ? 1 : 0,
    name: values.name.trim(),
    nameLocal: (values.nameLocal ?? '').trim(),
    category: values.category || DEFAULT_CATEGORY,
    duration: Math.max(0, Number(values.duration) || 0),
    note: (values.note ?? '').trim(),
    position: [lat, lng],
    googleMapsUrl: (values.googleMapsUrl ?? '').trim(),
  }
}

/** 表單驗證，回傳 { 欄位: 錯誤訊息 }，沒有錯誤就是空物件 */
export function validateSchedule(values) {
  const errors = {}

  // 資料層允許空時間（舊資料可能沒有），但表單一律要求填寫
  if (toMinutes(values.time) === null) errors.time = '請輸入有效時間（HH:mm）'
  if (!values.name?.trim()) errors.name = '請輸入地點名稱'

  if (!isValidDuration(values.duration)) errors.duration = '停留時間需為 0 以上的數字'

  // 座標一律由地點搜尋帶入，使用者不會手動輸入
  const hasValidPosition =
    values.lat !== '' && values.lng !== '' && isValidLat(values.lat) && isValidLng(values.lng)

  if (!hasValidPosition) {
    errors.location = '請用「Search Place」選擇地點，或貼上含座標的 Google Maps 連結'
  }

  // 連結可留空；有填就必須是合法的 Google Maps 連結
  const url = (values.googleMapsUrl ?? '').trim()
  if (url && !isGoogleMapsUrl(url)) errors.googleMapsUrl = INVALID_URL_MESSAGE

  return errors
}
