/**
 * Google Maps 路線深層連結（Maps URLs 官方格式，純字串組裝）。
 *
 * 這裡不呼叫任何 API、不需要金鑰、不做任何網路請求，
 * 只是把兩個地點的座標組成一個可以在瀏覽器或 Google Maps App 打開的網址。
 *
 * 用 place.position 而不是 place.googleMapsUrl：
 * 座標在存檔時就驗證過，每個地點一定有；而使用者貼的連結可能是短網址
 * （maps.app.goo.gl），不展開就取不到座標（見 utils/googleMaps.js）。
 *
 * 格式：https://www.google.com/maps/dir/?api=1&origin=lat,lng&destination=lat,lng&travelmode=...
 */

const DIRECTIONS_BASE = 'https://www.google.com/maps/dir/'

/** Google Maps 支援的交通方式 */
export const TRAVEL_MODES = {
  TRANSIT: 'transit',
  WALKING: 'walking',
  DRIVING: 'driving',
  BICYCLING: 'bicycling',
}

export const DEFAULT_TRAVEL_MODE = TRAVEL_MODES.TRANSIT

function toLatLngParam(place) {
  const [lat, lng] = place?.position ?? []
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return `${lat},${lng}`
}

/**
 * 組出兩點之間的路線網址；任一端沒有有效座標就回傳 null
 *（呼叫端據此決定要不要停用按鈕，而不是產生一個壞掉的連結）。
 */
export function buildDirectionsUrl(from, to, travelMode = DEFAULT_TRAVEL_MODE) {
  const origin = toLatLngParam(from)
  const destination = toLatLngParam(to)
  if (!origin || !destination) return null

  const url = new URL(DIRECTIONS_BASE)
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', origin)
  url.searchParams.set('destination', destination)
  url.searchParams.set('travelmode', travelMode)
  return url.toString()
}
