/**
 * Nominatim（OpenStreetMap）地點搜尋。
 *
 * 免費、不需要 API key，但使用政策要求：
 *  - 每秒最多 1 次請求          → MIN_REQUEST_INTERVAL 節流
 *  - 不要重複查詢相同內容        → 以 query 為 key 的記憶體快取
 *  - 需可辨識的來源             → 瀏覽器會自動帶上 Referer
 *    （User-Agent 屬於禁止改寫的 header，前端無法設定）
 *
 * 參考：https://operations.osmfoundation.org/policies/nominatim/
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const MIN_REQUEST_INTERVAL = 1100
const RESULT_LIMIT = 5
/** 結果語系偏好：優先中文，其次英文（Nominatim 預設回傳當地語言） */
const LANGUAGES = 'zh-TW,zh,en'

/** query → 結果，避免同樣的字重複打 API */
const cache = new Map()
let lastRequestAt = 0

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/** Nominatim 的回傳格式 → 專案內部使用的格式 */
function toPlaceResult(item) {
  const [primary, ...rest] = item.display_name.split(',')
  return {
    id: `${item.osm_type ?? 'osm'}-${item.osm_id ?? item.place_id}`,
    name: (item.name || primary || '').trim(),
    label: item.display_name,
    // 次要說明：拿掉第一段後的地址，讓使用者分辨同名地點
    context: rest.join(',').trim(),
    lat: Number(item.lat),
    lng: Number(item.lon),
  }
}

/**
 * 依關鍵字搜尋地點。
 *
 * @returns {Promise<Array<{id,name,label,context,lat,lng}>>}
 * @throws  網路或 HTTP 錯誤時 throw，由呼叫端決定如何顯示
 */
export async function searchPlaces(query, { signal } = {}) {
  const keyword = query.trim()
  const cacheKey = keyword.toLowerCase()

  if (cache.has(cacheKey)) return cache.get(cacheKey)

  // 節流：距離上一次請求不足 1 秒就先等一下
  const waitFor = lastRequestAt + MIN_REQUEST_INTERVAL - Date.now()
  if (waitFor > 0) await delay(waitFor, signal)
  lastRequestAt = Date.now()

  const params = new URLSearchParams({
    q: keyword,
    format: 'jsonv2',
    limit: String(RESULT_LIMIT),
    addressdetails: '1',
    'accept-language': LANGUAGES,
  })

  const response = await fetch(`${ENDPOINT}?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Nominatim responded with ${response.status}`)
  }

  const data = await response.json()
  const results = Array.isArray(data) ? data.map(toPlaceResult) : []

  cache.set(cacheKey, results)
  return results
}

export default searchPlaces
