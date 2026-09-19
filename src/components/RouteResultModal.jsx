import Modal from './Modal'
import { buildDirectionsUrl } from '../utils/directions'
import { DEPARTURE_MODE, RESULT_TYPE, TRANSIT_SOURCE } from '../utils/transitTime'

/**
 * RouteResultModal：Route Mode 選滿兩個端點後的查詢結果。
 *
 * 純展示元件：不呼叫 API、不解析回應、不決定出發時間。
 * 這些都在 utils/transitTime.js，由 Schedule 觸發後把結果傳進來。
 *
 * 顯示的一切都不會被儲存，關掉就沒了。
 *
 * props:
 *  - from / to     兩個端點 place
 *  - departure     依行程出發時間算出的查詢時間（idle 時先顯示這個）
 *  - tripDate      行程當天日期，用來提醒「依現在時間」查到的是別天的班表
 *  - status        'idle' | 'loading' | 'done'
 *  - result        transitTime 的正規化結果（status 為 done 時才有）
 *  - onQuery(mode) / onClose()
 */
const MODE_LABEL = {
  [DEPARTURE_MODE.SCHEDULE]: '行程出發時間',
  [DEPARTURE_MODE.NOW]: '現在時間',
}

function RouteResultModal({ from, to, departure, tripDate, status, result, onQuery, onClose }) {
  const directionsUrl = buildDirectionsUrl(from, to)
  const isLoading = status === 'loading'
  const isDone = status === 'done'
  const hasError = Boolean(result?.error)
  const foundRoute = isDone && !hasError && result.resultType !== RESULT_TYPE.NONE

  const usedMode = result?.departureMode ?? DEPARTURE_MODE.SCHEDULE
  const otherMode =
    usedMode === DEPARTURE_MODE.NOW ? DEPARTURE_MODE.SCHEDULE : DEPARTURE_MODE.NOW
  // 依現在時間查到的是「今天」的班表，跟行程當天可能是不同的平日／假日
  const wrongDayWarning =
    isDone && usedMode === DEPARTURE_MODE.NOW && result?.matchesTripDate === false

  return (
    <Modal title="🚃 路線查詢" description="臨時查詢，不會存進行程" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-xs font-medium text-slate-400">起點</p>
          <p className="font-semibold text-slate-800">{from.name}</p>

          <p aria-hidden="true" className="my-1 text-center text-lg text-slate-400">↓</p>

          <p className="text-xs font-medium text-slate-400">終點</p>
          <p className="font-semibold text-slate-800">{to.name}</p>
        </div>

        {/* 交通時間：idle → 按查詢才發請求 */}
        <div aria-live="polite">
          <p className="text-sm font-medium text-slate-700">預估交通時間</p>

          {status === 'idle' && (
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onQuery(DEPARTURE_MODE.SCHEDULE)}
                className="inline-flex min-h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                依出發時間查詢
              </button>
              <button
                type="button"
                onClick={() => onQuery(DEPARTURE_MODE.NOW)}
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                依現在時間查詢
              </button>
            </div>
          )}

          {isLoading && (
            <p className="mt-1 text-sm text-slate-500">查詢中…</p>
          )}

          {foundRoute && (
            <p className="mt-1 flex items-baseline gap-2">
              {result.resultType === RESULT_TYPE.WALKING && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                  <span aria-hidden="true">🚶</span> 步行路線
                </span>
              )}
              <span className="text-xl font-bold text-slate-800">
                約 {result.durationMinutes} 分鐘
              </span>
            </p>
          )}


          {isDone && !foundRoute && (
            <div className="mt-1 space-y-2">
              <p className="text-sm text-slate-600">
                {hasError ? result.error.message : '暫時查不到路線'}
              </p>
              <p className="text-xs text-slate-400">
                請確認地點座標，或改用 Google Maps 查看其他路線。
              </p>
              <button
                type="button"
                onClick={() => onQuery(usedMode)}
                className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                重新查詢
              </button>
            </div>
          )}

          {isDone && (
            <button
              type="button"
              onClick={() => onQuery(otherMode)}
              className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              改用{MODE_LABEL[otherMode]}查詢
            </button>
          )}
        </div>

        {/* 顯示的出發時間就是實際送出的查詢時間 */}
        <div className="space-y-1 text-xs text-slate-500">
          {isDone ? (
            <p>
              <span className="font-medium text-slate-600">查詢時間：</span>
              {result.departureLabel}（{MODE_LABEL[usedMode]}）
            </p>
          ) : (
            <p>
              <span className="font-medium text-slate-600">出發時間：</span>
              {departure.label}
            </p>
          )}
          {wrongDayWarning && (
            <p className="text-amber-600">
              <span aria-hidden="true">⚠</span> 這是今天的班表，與行程當天（
              {String(tripDate ?? '').replace(/-/g, '/')}）可能不同。
            </p>
          )}
          {(isDone ? result.fallbackUsed : departure.fallbackUsed) && (
            <p className="text-slate-400">起點沒有設定時間，以 09:00 查詢。</p>
          )}
          <p className="text-slate-400">預估時間僅供行程規劃參考。</p>
          <p className="text-slate-400">實際班次與交通狀況請於出發前再次確認。</p>
          <p className="text-slate-400">
            路線資料來源：
            <a
              href={TRANSIT_SOURCE.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600"
            >
              {TRANSIT_SOURCE.name}
            </a>
          </p>
        </div>

        {/* 查詢失敗時這條路仍然走得通，所以一律保留 */}
        {directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-300 px-4 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            <span aria-hidden="true">↗</span>
            在 Google Maps 開啟
          </a>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-center text-xs text-slate-400">
            其中一個地點沒有座標，無法開啟 Google Maps
          </p>
        )}

        <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-end border-t border-slate-100 bg-white px-5 pb-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            關閉
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default RouteResultModal
