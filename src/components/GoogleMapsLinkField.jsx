import { useEffect, useState } from 'react'
import { COORD_SOURCE, INVALID_URL_MESSAGE, parseGoogleMapsUrl } from '../utils/googleMaps'

const NO_COORDS_MESSAGE =
  '已儲存連結，但這個網址取不到座標。請改用上方 Search Place 選擇地點，以取得地圖位置。'
const VIEWPORT_HINT = '座標取自連結中的地圖視角中心，建議確認是否為實際地點。'

/**
 * GoogleMapsLinkField：Mode 2 —— 貼上 Google Maps 連結匯入地點。
 *
 * 只解析 URL 字串本身，不做任何網頁爬取；
 * 取不到座標時明確告知使用者，不猜測位置。
 *
 * props:
 *  - value              目前已儲存的 googleMapsUrl
 *  - hasCoordinates     表單目前是否已有座標
 *  - onImport({ url, lat, lng, placeName })  匯入成功（lat/lng 可能為 null）
 *  - error              外部驗證錯誤
 */
function GoogleMapsLinkField({ value, hasCoordinates, onImport, error }) {
  const [draft, setDraft] = useState(value ?? '')
  const [feedback, setFeedback] = useState(null)

  // 切換編輯不同行程時要跟著更新
  useEffect(() => setDraft(value ?? ''), [value])

  const handleImport = () => {
    const result = parseGoogleMapsUrl(draft)

    if (!result.ok) {
      setFeedback({ type: 'error', message: INVALID_URL_MESSAGE })
      return
    }

    const { coordinates } = result
    onImport({
      url: result.url,
      lat: coordinates?.lat ?? null,
      lng: coordinates?.lng ?? null,
      placeName: result.placeName,
    })

    if (!coordinates) {
      setFeedback({ type: 'warning', message: NO_COORDS_MESSAGE })
      return
    }

    setFeedback({
      type: coordinates.source === COORD_SOURCE.VIEWPORT ? 'warning' : 'success',
      message:
        coordinates.source === COORD_SOURCE.VIEWPORT
          ? `已從連結取得地圖位置。${VIEWPORT_HINT}`
          : '已從連結取得地圖位置',
    })
  }

  const message = error ? { type: 'error', message: error } : feedback
  const tone = {
    error: 'text-red-600',
    warning: 'text-amber-600',
    success: 'text-emerald-600',
  }[message?.type]

  return (
    <div>
      <span className="mb-1 flex items-baseline gap-2 text-sm font-medium text-slate-700">
        Google Maps Link
        <span className="text-xs font-normal text-slate-400">選填</span>
      </span>

      <div className="flex gap-2">
        <input
          type="url"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setFeedback(null)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            // 在這個欄位按 Enter 是「匯入」，不要送出整張表單
            event.preventDefault()
            handleImport()
          }}
          placeholder="Paste Google Maps URL"
          aria-label="Google Maps Link"
          className="w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={handleImport}
          disabled={!draft.trim()}
          className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
        >
          Import Place
        </button>
      </div>

      {message && <p className={`mt-1 text-xs ${tone}`}>{message.message}</p>}

      {!message && value && !hasCoordinates && (
        <p className="mt-1 text-xs text-amber-600">{NO_COORDS_MESSAGE}</p>
      )}
    </div>
  )
}

export default GoogleMapsLinkField
