/**
 * Google Maps 連結的驗證與座標解析（純前端，不做任何網頁爬取）。
 *
 * 只從 URL 字串本身可靠取得的位置解析座標；
 * 短網址（maps.app.goo.gl / goo.gl）沒有展開就取不到座標，
 * 這種情況一律回傳 null，不做任何猜測。
 */

export const INVALID_URL_MESSAGE = 'Please enter a valid Google Maps link.'

/** 座標來源，UI 會據此決定要不要提醒使用者確認 */
export const COORD_SOURCE = {
  PLACE: 'place', // !3d!4d：地點本身的座標，最準確
  QUERY: 'query', // q / query / ll / center 等查詢參數
  VIEWPORT: 'viewport', // @lat,lng：地圖視角中心，通常接近但不等於地點
}

const NUMBER = String.raw`-?\d+(?:\.\d+)?`
const PLACE_PIN_PATTERN = new RegExp(String.raw`!3d(${NUMBER})!4d(${NUMBER})`)
const VIEWPORT_PATTERN = new RegExp(String.raw`@(${NUMBER}),(${NUMBER})`)
const COORD_PAIR_PATTERN = new RegExp(String.raw`^\s*(${NUMBER})\s*,\s*(${NUMBER})\s*$`)

/** 可能帶有「緯度,經度」的查詢參數，依可靠度排序 */
const COORD_PARAMS = ['query', 'q', 'll', 'center', 'destination', 'daddr', 'sll']

function isValidLatLng(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  )
}

function parseUrl(value) {
  try {
    return new URL(String(value).trim())
  } catch {
    return null
  }
}

/**
 * 是否為支援的 Google Maps 連結。
 *
 * 支援：
 *  - https://www.google.com/maps/...（含各國網域 google.co.jp 等）
 *  - https://maps.google.com/...
 *  - https://maps.app.goo.gl/...
 *  - https://goo.gl/maps/...
 */
export function isGoogleMapsUrl(value) {
  const url = parseUrl(value)
  if (!url) return false
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false

  const host = url.hostname.toLowerCase()
  const path = url.pathname.toLowerCase()

  if (host === 'maps.app.goo.gl') return true
  if (host === 'goo.gl') return path.startsWith('/maps')
  if (/^maps\.google\.[a-z][a-z.]{1,5}$/.test(host)) return true
  if (/^(www\.)?google\.[a-z][a-z.]{1,5}$/.test(host)) return path.startsWith('/maps')

  return false
}

/** 短網址沒有實際展開就不可能帶座標 */
export function isShortGoogleMapsUrl(value) {
  const url = parseUrl(value)
  if (!url) return false
  const host = url.hostname.toLowerCase()
  return host === 'maps.app.goo.gl' || host === 'goo.gl'
}

/**
 * 從 Google Maps URL 取出座標。
 *
 * @returns {{ lat: number, lng: number, source: string } | null}
 *          取不到就回傳 null（不猜測）
 */
export function extractCoordinates(value) {
  const url = parseUrl(value)
  if (!url || !isGoogleMapsUrl(url.href)) return null

  const href = decodeURIComponent(url.href)

  // 1. 地點座標（最準確）：.../data=...!3d35.658!4d139.701
  const pin = href.match(PLACE_PIN_PATTERN)
  if (pin) {
    const lat = Number(pin[1])
    const lng = Number(pin[2])
    if (isValidLatLng(lat, lng)) return { lat, lng, source: COORD_SOURCE.PLACE }
  }

  // 2. 查詢參數：?api=1&query=35.65,139.70 或 ?q=35.65,139.70
  for (const key of COORD_PARAMS) {
    const raw = url.searchParams.get(key)
    if (!raw) continue
    const pair = raw.match(COORD_PAIR_PATTERN)
    if (!pair) continue

    const lat = Number(pair[1])
    const lng = Number(pair[2])
    if (isValidLatLng(lat, lng)) return { lat, lng, source: COORD_SOURCE.QUERY }
  }

  // 3. 地圖視角中心：/maps/@35.6595,139.7005,17z
  const viewport = href.match(VIEWPORT_PATTERN)
  if (viewport) {
    const lat = Number(viewport[1])
    const lng = Number(viewport[2])
    if (isValidLatLng(lat, lng)) return { lat, lng, source: COORD_SOURCE.VIEWPORT }
  }

  return null
}

/**
 * 從 /maps/place/<名稱>/ 取出地點名稱。
 * 這是 URL 裡實際帶有的字串，不是推測；取不到就回傳空字串。
 */
export function extractPlaceName(value) {
  const url = parseUrl(value)
  if (!url || !isGoogleMapsUrl(url.href)) return ''

  const match = url.pathname.match(/\/maps\/place\/([^/@]+)/)
  if (!match) return ''

  try {
    const name = decodeURIComponent(match[1]).replace(/\+/g, ' ').trim()
    // 純座標的 place 段（例如 /place/35.65,139.70）不算名稱
    return COORD_PAIR_PATTERN.test(name) ? '' : name
  } catch {
    return ''
  }
}

/**
 * 解析使用者貼上的連結，回傳 UI 需要的完整結果。
 *
 * @returns {{ ok: boolean, url?: string, coordinates?: object|null, reason?: string }}
 */
export function parseGoogleMapsUrl(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (!isGoogleMapsUrl(trimmed)) return { ok: false, reason: 'invalid' }

  return {
    ok: true,
    url: trimmed,
    coordinates: extractCoordinates(trimmed),
    placeName: extractPlaceName(trimmed),
    isShortUrl: isShortGoogleMapsUrl(trimmed),
  }
}
