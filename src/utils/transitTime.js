import { toMinutes } from './scheduleHelpers'

/**
 * 大眾運輸交通時間查詢（Transitous / MOTIS）。
 *
 * 這一層負責：組查詢網址、決定出發時間、解析回應、統一錯誤格式、快取。
 * UI 元件不應該自己呼叫 API，也不該解析回應。
 *
 * 查詢結果是「臨時查詢」：不進 trip、不寫 LocalStorage、不產生任何行程資料。
 *
 * 資料來源：Transitous（https://transitous.org/），社群營運的免費服務，
 * 底層是 MOTIS 路由引擎與各交通業者公開的 GTFS。
 * 不需要金鑰；瀏覽器無法自訂 User-Agent，依其說明由 Referer 識別來源。
 */

const API_URL = 'https://api.transitous.org/api/v1/plan'
const REQUEST_TIMEOUT_MS = 15000

/**
 * 行程所在地的時區。
 *
 * 目前的資料模型沒有時區欄位，第一版固定用東京當地時間（UTC+9，沒有日光節約）。
 * 時區只在這裡定義，不要散落到元件裡；之後若 trip 加上時區欄位，只改這一個地方。
 * 兩個常數必須代表同一個時區。
 */
const TRIP_UTC_OFFSET = '+09:00'
const TRIP_TIME_ZONE = 'Asia/Tokyo'

/** 起點沒有時間時使用的出發時間（當地時間） */
const FALLBACK_DEPARTURE_TIME = '09:00'

/** 最多保留幾條路線（第一版 UI 只顯示最快那條，其餘留給之後的細節檢視） */
const ROUTE_LIMIT = 3

export const DEPARTURE_MODE = {
  /** 依行程的出發時間（Day 日期 + 起點時間） */
  SCHEDULE: 'schedule',
  /** 依現在時間（人已經在當地時才有意義） */
  NOW: 'now',
}

export const TRANSIT_SOURCE = {
  name: 'Transitous',
  url: 'https://transitous.org/',
}

export const RESULT_TYPE = {
  TRANSIT: 'transit',
  WALKING: 'walking',
  NONE: 'none',
}

export const ERROR_KIND = {
  INVALID_PLACE: 'invalid_place',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  HTTP: 'http',
  PARSE: 'parse',
}

const ERROR_MESSAGE = {
  [ERROR_KIND.INVALID_PLACE]: '地點沒有座標，無法查詢路線',
  [ERROR_KIND.TIMEOUT]: '查詢逾時，請稍後再試',
  [ERROR_KIND.NETWORK]: '無法連線到路線服務',
  [ERROR_KIND.HTTP]: '路線服務目前無法回應',
  [ERROR_KIND.PARSE]: '路線服務的回應無法解析',
}

/** '2026-10-12' + '09:00' → '2026/10/12 09:00'（顯示用，與實際送出的查詢時間一致） */
function formatDepartureLabel(date, time) {
  return `${String(date ?? '').replace(/-/g, '/')} ${time}`
}

/** 取得「現在」在行程當地的日期與時間，而不是使用者裝置所在時區的 */
function nowInTripZone(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TRIP_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type)?.value

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    // Intl 在午夜可能回 '24'，正規化成 '00'
    time: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`,
  }
}

/**
 * 決定查詢用的出發時間。
 *
 * schedule（預設）：Day 日期 + 起點時間
 *   起點有有效時間 → 用它
 *   起點沒有時間   → 固定退回 09:00（不使用使用者當下的時間，也不使用終點的時間）
 *
 * now：行程當地的現在時刻。注意這會查到「今天」的班表，
 *      若今天不是行程當天，平日／假日班表可能不同 —— matchesTripDate 讓 UI 能提醒。
 */
export function buildDepartureTime(dayDate, fromPlace, mode = DEPARTURE_MODE.SCHEDULE, now = new Date()) {
  const useNow = mode === DEPARTURE_MODE.NOW
  const current = useNow ? nowInTripZone(now) : null

  const date = useNow ? current.date : dayDate
  const hasTime = toMinutes(fromPlace?.time) !== null
  const time = useNow ? current.time : hasTime ? fromPlace.time : FALLBACK_DEPARTURE_TIME

  return {
    mode: useNow ? DEPARTURE_MODE.NOW : DEPARTURE_MODE.SCHEDULE,
    date,
    time,
    // fallback 只在「依出發時間」而起點沒填時間時才成立
    fallbackUsed: !useNow && !hasTime,
    matchesTripDate: date === dayDate,
    // 帶時區偏移送出，語意就是「行程當地的這個時刻」
    iso: `${date}T${time}:00${TRIP_UTC_OFFSET}`,
    label: formatDepartureLabel(date, time),
  }
}

function toLatLngParam(place) {
  const [lat, lng] = place?.position ?? []
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return `${lat},${lng}`
}

export function buildPlanUrl(from, to, departureIso) {
  const origin = toLatLngParam(from)
  const destination = toLatLngParam(to)
  if (!origin || !destination) return null

  const url = new URL(API_URL)
  url.searchParams.set('fromPlace', origin)
  url.searchParams.set('toPlace', destination)
  url.searchParams.set('time', departureIso)
  url.searchParams.set('transitModes', 'TRANSIT')
  // 兩點很近時不會有值得搭的班次，directModes 讓它至少回一段步行
  url.searchParams.set('directModes', 'WALK')
  return url.toString()
}

const byDuration = (list) =>
  (Array.isArray(list) ? list : []).slice().sort((a, b) => (a?.duration ?? 0) - (b?.duration ?? 0))

/**
 * 路線名稱：routeShortName 有時候是 '10733094' 這種原始編號，對使用者沒有意義，
 * 這種情況退回 routeLongName，再不行就讓呼叫端用 mode 顯示。
 */
function pickLineName(leg) {
  const short = (leg?.routeShortName ?? '').trim()
  if (short && !/^\d+$/.test(short)) return short
  const long = (leg?.routeLongName ?? '').trim()
  if (long) return long
  return short || null
}

/**
 * 單一路段，形狀與 MOTIS 的回應脫鉤。
 * 之後要做路線細節的下拉檢視，UI 只要讀這個形狀，不必再碰 API schema。
 */
function normalizeLeg(leg) {
  const isWalk = leg?.mode === 'WALK'

  return {
    kind: isWalk ? 'walk' : 'transit',
    mode: leg?.mode ?? null,
    durationMinutes: Math.round((leg?.duration ?? 0) / 60),
    startTime: leg?.startTime ?? null,
    endTime: leg?.endTime ?? null,
    from: leg?.from?.name ?? null,
    to: leg?.to?.name ?? null,
    line: isWalk ? null : pickLineName(leg),
    agency: leg?.agencyName ?? null,
    headsign: leg?.headsign ?? null,
    distanceMeters: isWalk ? Math.round(leg?.distance ?? 0) : null,
  }
}

function normalizeRoute(itinerary, resultType) {
  const legs = (itinerary?.legs ?? []).map(normalizeLeg)

  return {
    resultType,
    durationMinutes: Math.max(1, Math.round((itinerary?.duration ?? 0) / 60)),
    transfers: itinerary?.transfers ?? 0,
    // 查詢時間是「最早可以出發」，實際第一段的出發時刻通常晚一些
    departureActual: itinerary?.startTime ?? null,
    arrivalTime: itinerary?.endTime ?? null,
    walkingMinutes: legs.filter((leg) => leg.kind === 'walk')
      .reduce((total, leg) => total + leg.durationMinutes, 0),
    legs,
  }
}

/**
 * 把 API 回應整理成畫面要用的形狀。
 *
 * itineraries 有東西 → 大眾運輸
 * itineraries 空但 direct 有 → 純步行
 * 兩者都空 → none（注意：這不代表兩地之間沒有路，只代表這次查不到）
 *
 * 最多保留 ROUTE_LIMIT 條（依總時間排序）；頂層欄位是最快那條的摘要，
 * 第一版 UI 只用到摘要，routes 留給之後的細節檢視。
 */
export function normalizePlanResponse(payload) {
  const transit = byDuration(payload?.itineraries)
  const walking = transit.length === 0 ? byDuration(payload?.direct) : []
  const resultType = transit.length > 0 ? RESULT_TYPE.TRANSIT : RESULT_TYPE.WALKING
  const source = (transit.length > 0 ? transit : walking).slice(0, ROUTE_LIMIT)

  if (source.length === 0) {
    return {
      resultType: RESULT_TYPE.NONE,
      durationMinutes: null,
      arrivalTime: null,
      departureActual: null,
      transfers: 0,
      walkingMinutes: 0,
      legs: [],
      routes: [],
    }
  }

  const routes = source.map((itinerary) => normalizeRoute(itinerary, resultType))
  const [best] = routes

  return {
    resultType,
    durationMinutes: best.durationMinutes,
    arrivalTime: best.arrivalTime,
    departureActual: best.departureActual,
    transfers: best.transfers,
    walkingMinutes: best.walkingMinutes,
    legs: best.legs,
    routes,
  }
}

/** 同一組（起點、終點、出發時間）不重複查詢 */
const cache = new Map()
const CACHE_LIMIT = 50

const cacheKey = (from, to, iso) => `${from?.id}|${to?.id}|${iso}`

export function clearTransitCache() {
  cache.clear()
}

function buildResult({ departure, extra, error = null }) {
  return {
    durationMinutes: null,
    arrivalTime: null,
    departureActual: null,
    transfers: 0,
    walkingMinutes: 0,
    legs: [],
    routes: [],
    resultType: RESULT_TYPE.NONE,
    ...extra,
    departureTime: departure.iso,
    departureLabel: departure.label,
    departureMode: departure.mode,
    matchesTripDate: departure.matchesTripDate,
    fallbackUsed: departure.fallbackUsed,
    source: TRANSIT_SOURCE.name.toLowerCase(),
    queriedAt: new Date().toISOString(),
    error,
  }
}

const toError = (kind) => ({ kind, message: ERROR_MESSAGE[kind] })

/**
 * 查詢兩點之間的交通時間。
 *
 * 一定 resolve，不會 reject：失敗時 error 欄位有值，呼叫端據此顯示錯誤狀態。
 */
export async function fetchTransitTime({
  from,
  to,
  dayDate,
  mode = DEPARTURE_MODE.SCHEDULE,
  fetchImpl = fetch,
  now = new Date(),
}) {
  const departure = buildDepartureTime(dayDate, from, mode, now)
  const url = buildPlanUrl(from, to, departure.iso)

  if (!url) {
    return buildResult({ departure, error: toError(ERROR_KIND.INVALID_PLACE) })
  }

  const key = cacheKey(from, to, departure.iso)
  if (cache.has(key)) return cache.get(key)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response
  try {
    response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
  } catch (cause) {
    clearTimeout(timer)
    const kind = cause?.name === 'AbortError' ? ERROR_KIND.TIMEOUT : ERROR_KIND.NETWORK
    return buildResult({ departure, error: toError(kind) })
  }
  clearTimeout(timer)

  if (!response.ok) {
    return buildResult({ departure, error: toError(ERROR_KIND.HTTP) })
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    return buildResult({ departure, error: toError(ERROR_KIND.PARSE) })
  }

  const result = buildResult({ departure, extra: normalizePlanResponse(payload) })

  // 只快取「真的查到路線」的結果。
  // 錯誤要能重試；查不到也要能重試——那可能只是服務暫時異常或資料不完整，
  // 若把 none 也快取起來，「重新查詢」就變成沒有作用的按鈕。
  if (result.resultType !== RESULT_TYPE.NONE) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value)
    cache.set(key, result)
  }
  return result
}
