import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { CATEGORIES } from '../data/defaultTrip'
import { DEFAULT_COLOR } from '../utils/dayItems'
import { getEndTime } from '../utils/scheduleHelpers'

/** 單一景點時使用的預設縮放層級 */
const SINGLE_PLACE_ZOOM = 15
/** 可視地圖區域的 CSS 變數：上方浮動層高度、行程面板的高度與佔用寬度 */
const OVERLAY_VAR = '--tp-map-inset-top'
const PANEL_H_VAR = '--tp-panel-current-h'
const PANEL_W_VAR = '--tp-panel-current-w'
/** 可視帶小於這個高度時，就不再閃避上方浮動層（否則會完全沒有可用空間） */
const MIN_VISIBLE_BAND = 96
/** marker 與可視區上下緣至少保留的距離 */
const MARKER_MARGIN = 28
/** 聚焦一整組地點時，bounds 與可視區邊緣保留的距離 */
const FOCUS_PADDING = 48

/** 地圖初始中心（東京車站），僅在當天沒有任何景點時使用 */
const FALLBACK_CENTER = [35.6812, 139.7671]

/**
 * 以 divIcon 產生編號 Marker，避免 Leaflet 預設圖示在打包後失效。
 *
 * icon 會被快取：同樣的 (標籤, 分類, 選取狀態) 一律回傳同一個 instance，
 * 這樣 react-leaflet 才不會在每次 re-render 都呼叫 setIcon 重建 DOM。
 * L.DivIcon 本身無狀態，多個 Marker 共用是安全的。
 */
const iconCache = new Map()

function getMarkerIcon(label, color, isActive, isFocused = false) {
  const cacheKey = `${label}|${color}|${isActive}|${isFocused}`
  const cached = iconCache.get(cacheKey)
  if (cached) return cached

  // 單點選取 = active；整個子行程被聚焦時，組內每個 marker 都用較輕的 focused 樣式
  const state = isActive ? 'tp-marker--active' : isFocused ? 'tp-marker--focused' : ''
  const icon = L.divIcon({
    className: 'tp-marker-wrapper',
    html: `<div class="tp-marker ${state}" style="background:${color}">${label}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  })

  iconCache.set(cacheKey, icon)
  return icon
}

/** 讀取 CSS 變數的 px 值；讀不到就當作 0 */
function readPxVar(element, name) {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(name))
  return Number.isFinite(value) ? value : 0
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/**
 * 量出「地圖容器被上方浮動層與行程面板遮住多少」。
 *
 * 行程面板在手機是底部滿版（遮住高度），桌機是右側浮動（遮住寬度），
 * 兩者都從 CSS 變數讀目前的實際值（由 App 與 SchedulePanel 量測後寫入），
 * 不在這裡複製任何面板尺寸常數。
 *
 * 回傳的 top / bottom / right 都是「被遮住的 px」，
 * 置中平移與整組聚焦共用同一份計算。
 */
function getViewportInsets(map) {
  const container = map.getContainer()
  const { x: width, y: height } = map.getSize()

  const panelHeight = readPxVar(container, PANEL_H_VAR)
  const panelWidth = readPxVar(container, PANEL_W_VAR)
  const overlayHeight = readPxVar(container, OVERLAY_VAR)

  // 面板佔滿整個寬度 → 底部面板（手機）；否則是靠右的側邊面板（桌機）
  const isSidePanel = panelWidth > 0 && panelWidth < width - 8

  // 垂直：只有底部面板需要扣高度
  const bottom = isSidePanel ? 0 : Math.min(panelHeight, height)
  // 空間不足以同時閃避上下兩層時，優先確保不被面板蓋住
  const top = height - bottom - overlayHeight < MIN_VISIBLE_BAND ? 0 : overlayHeight
  // 水平：只有側邊面板需要扣寬度
  const right = isSidePanel ? Math.min(panelWidth, width) : 0

  return { width, height, top, bottom, right }
}

/**
 * 算出「要讓選取的地點落在可視地圖區域中心」時，地圖中心該放在哪裡。
 *
 * 只平移、不改 zoom；若不需要偏移就直接回傳原座標。
 */
function getVisualCenterTarget(map, position) {
  const { width, height, top, bottom, right } = getViewportInsets(map)
  if (!width || !height) return position

  const targetY = clamp((top + (height - bottom)) / 2, MARKER_MARGIN, height - MARKER_MARGIN)
  const targetX = clamp((width - right) / 2, MARKER_MARGIN, width - MARKER_MARGIN)

  const shiftX = width / 2 - targetX
  const shiftY = height / 2 - targetY
  if (Math.abs(shiftX) < 1 && Math.abs(shiftY) < 1) return position

  // 把地圖中心往可視區域的反方向移，畫面上的地點就會落在 (targetX, targetY)
  const zoom = map.getZoom()
  return map.unproject(map.project(position, zoom).add([shiftX, shiftY]), zoom)
}

/**
 * 兩側 padding 加起來不能把可視帶壓到不能用，
 * 超過時等比例縮小，讓 fitBounds 永遠拿得到合理的 zoom。
 */
function fitPadding(start, end, size) {
  const room = Math.max(size - MIN_VISIBLE_BAND, 0)
  const total = start + end
  if (total <= room) return [start, end]
  if (room === 0) return [0, 0]
  const ratio = room / total
  return [Math.round(start * ratio), Math.round(end * ratio)]
}

/** fitBounds 的 padding：閃開上方浮動層與行程面板，再各留一點邊界 */
function getFitOptions(map) {
  const { width, height, top, bottom, right } = getViewportInsets(map)
  const [padTop, padBottom] = fitPadding(top + FOCUS_PADDING, bottom + FOCUS_PADDING, height)
  const [padLeft, padRight] = fitPadding(FOCUS_PADDING, right + FOCUS_PADDING, width)

  return {
    paddingTopLeft: [padLeft, padTop],
    paddingBottomRight: [padRight, padBottom],
    maxZoom: SINGLE_PLACE_ZOOM,
  }
}

/**
 * MapController：負責調整地圖視野，本身不 render 任何東西。
 *
 *  - 切換 Day（places 改變）：
 *      0 個景點 → 不動
 *      1 個景點 → setView 置中在該景點
 *      多個景點 → fitBounds 顯示全部 Marker
 *  - 選取某個行程點：flyTo 該座標
 */
function MapController({ places, placesKey, selectedScheduleId, focusKey, focusedPlaces }) {
  const map = useMap()

  useEffect(() => {
    if (places.length === 0) return

    if (places.length === 1) {
      map.setView(places[0].position, SINGLE_PLACE_ZOOM)
      return
    }

    const bounds = L.latLngBounds(places.map((place) => place.position))
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: SINGLE_PLACE_ZOOM })
  }, [map, placesKey])

  useEffect(() => {
    if (!selectedScheduleId) return
    const place = places.find((item) => item.id === selectedScheduleId)
    if (!place) return

    // 只改變中心、保留使用者目前的縮放層級，
    // 讓選取的地點落在「沒有被行程面板遮住」的可視地圖區域中央
    map.panTo(getVisualCenterTarget(map, place.position), { animate: true, duration: 0.5 })
  }, [map, selectedScheduleId])

  // 聚焦整個子行程：把它底下的所有地點一起框進可視區域
  useEffect(() => {
    if (!focusKey || focusedPlaces.length === 0) return

    const bounds = L.latLngBounds(focusedPlaces.map((place) => place.position))
    map.fitBounds(bounds, { ...getFitOptions(map), animate: true, duration: 0.5 })
    // focusKey 已包含子行程 id 與其地點清單：換組或組內地點異動時才重新聚焦
  }, [map, focusKey])

  return null
}

/**
 * useMapResize：容器尺寸改變時重新計算地圖大小。
 *
 * Leaflet 只在建立時量一次容器尺寸，之後容器被 Responsive layout 改變高寬、
 * 或曾經被隱藏（display:none）再顯示時，都需要 invalidateSize() 重新計算，
 * 否則會出現灰塊或點擊位置偏移。
 *
 * 用 ResizeObserver 監看容器本身，可同時涵蓋：
 * 視窗縮放、外層高度改變、layout 切換、面板開關、初次顯示。
 */
function useMapResize() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    let frame = null

    // 合併同一幀內的多次變動；invalidateSize 不會改變容器尺寸，不會造成迴圈
    const refresh = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = null
        // animate: false —— 只重新計算尺寸，不動使用者目前的視野
        map.invalidateSize({ animate: false })
      })
    }

    refresh() // 初次顯示

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', refresh)
      return () => {
        if (frame !== null) cancelAnimationFrame(frame)
        window.removeEventListener('resize', refresh)
      }
    }

    const observer = new ResizeObserver(refresh)
    observer.observe(container)

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [map])
}

/** 只為了在 MapContainer 內部取得 map instance，本身不 render 任何東西 */
function MapResizeHandler() {
  useMapResize()
  return null
}

/**
 * MapView：顯示「目前選取那一天」的所有行程地點 Marker。
 *
 * props:
 *  - places              當天的地點陣列，每筆都有唯一 id、markerLabel 與 markerColor
 *                        （markerLabel 為空字串代表不顯示正式編號，例如子地點；
 *                          markerColor 由 buildMapPlaces 依分類與繼承關係算好）
 *  - selectedScheduleId  目前選取的行程點 id（null 代表沒有選取）
 *  - focusedSubItineraryId  目前聚焦的子行程 id；該組所有地點會一起被框進畫面
 *  - onSelectSchedule(scheduleId)  點擊 Marker 時回傳該 id
 *  - className           地圖容器的尺寸與外觀（由外層 layout 決定，元件本身不設定）
 *
 * 雙向連動：
 *  - Map → Timeline：Marker click 呼叫 onSelectSchedule
 *  - Timeline → Map：selectedScheduleId 變更時，Marker 放大並自動開啟 Popup
 *
 * 這裡只放 Marker，不畫路線、不做導航或 ETA。
 */
function MapView({
  places,
  selectedScheduleId,
  focusedSubItineraryId = null,
  onSelectSchedule,
  className = '',
}) {
  // id → Leaflet marker instance，用來由外部控制 Popup 開關
  const markerRefs = useRef({})

  // 當天景點清單的識別值：換日、新增、刪除、重新排序時才會變
  const placesKey = places.map((place) => place.id).join('|')

  // 被聚焦的那一組地點；沒有聚焦時是空陣列
  const focusedPlaces = useMemo(
    () => (focusedSubItineraryId
      ? places.filter((place) => place.subItineraryId === focusedSubItineraryId)
      : []),
    [places, focusedSubItineraryId],
  )
  const focusKey = focusedSubItineraryId
    ? `${focusedSubItineraryId}|${focusedPlaces.map((place) => place.id).join(',')}`
    : ''

  const initialCenter = useMemo(
    () => (places.length > 0 ? places[0].position : FALLBACK_CENTER),
    // 只取初始值，後續視野交給 MapController
    [],
  )

  useEffect(() => {
    const markers = markerRefs.current

    if (!selectedScheduleId) {
      Object.values(markers).forEach((marker) => marker?.closePopup())
      return undefined
    }

    // 新增行程時，Marker 與它的 Popup 是在同一次 commit 才掛上去的，
    // 立刻呼叫 openPopup() 會因為 Popup 尚未綁定而沒有作用，
    // 所以延到下一個 frame 再開。
    const frame = requestAnimationFrame(() => {
      markers[selectedScheduleId]?.openPopup()
    })

    return () => cancelAnimationFrame(frame)
    // placesKey 也列入依賴：新增或重新排序後要用更新後的內容重開 Popup
  }, [selectedScheduleId, placesKey])

  return (
    <section aria-label="行程地圖" className="relative h-full">
      <div
        className={`w-full overflow-hidden ${className}`}
      >
        <MapContainer
          center={initialCenter}
          zoom={13}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* key 用行程點的唯一 id，換日時舊 Marker 會自動被移除 */}
          {places.map((place, index) => {
            const isActive = place.id === selectedScheduleId
            const isFocused = Boolean(focusedSubItineraryId) && place.subItineraryId === focusedSubItineraryId
            return (
              <Marker
                key={place.id}
                position={place.position}
                icon={getMarkerIcon(
                  place.markerLabel ?? String(index + 1),
                  place.markerColor ?? DEFAULT_COLOR,
                  isActive,
                  isFocused,
                )}
                zIndexOffset={isActive ? 1000 : isFocused ? 500 : 0}
                ref={(instance) => {
                  if (instance) {
                    markerRefs.current[place.id] = instance
                  } else {
                    delete markerRefs.current[place.id]
                  }
                }}
                eventHandlers={{ click: () => onSelectSchedule(place.id) }}
              >
                {/* autoPan 會在置中動畫途中把地圖推開，使地點偏離中心，故關閉 */}
                <Popup autoPan={false}>
                  <p className="text-sm font-semibold text-slate-800">
                    {CATEGORIES[place.category]?.emoji} {place.name}
                  </p>
                  {place.nameLocal && (
                    <p className="text-xs text-slate-500">{place.nameLocal}</p>
                  )}
                  <p className="mt-1 text-xs font-medium text-brand-600">
                    {place.time} – {getEndTime(place)}
                  </p>
                  {place.note && (
                    <p className="mt-1 text-xs text-slate-500">{place.note}</p>
                  )}
                </Popup>
              </Marker>
            )
          })}

          <MapController
            places={places}
            placesKey={placesKey}
            selectedScheduleId={selectedScheduleId}
            focusKey={focusKey}
            focusedPlaces={focusedPlaces}
          />
          <MapResizeHandler />
        </MapContainer>
      </div>

      {places.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          這一天還沒有安排地點
        </p>
      )}
    </section>
  )
}

export default MapView
