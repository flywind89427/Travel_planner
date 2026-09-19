import { toMinutes } from './scheduleHelpers'
import { CATEGORIES } from '../data/defaultTrip'

/**
 * Day 的行程單位（item）。
 *
 * 一天的 items 是「一般地點」與「子行程」混排的陣列，兩者在排序上是同一層級：
 *   { type: 'place',        place: {...} }
 *   { type: 'subItinerary', id, name, category, duration, note, places: [...] }
 *
 * 子行程不可再巢狀子行程，裡面一律是既有的 place 物件（欄位完全沒有改變）。
 * 這裡只有純函式，不碰 React、不碰 storage。
 */
/**
 * 顏色一律由分類決定，沒有獨立的顏色欄位。
 *
 * 正式行程用自己的分類色；子行程沒有自己的顏色，跟隨「上方最近的正式行程」，
 * 子地點再跟隨它所屬的子行程。排在第一個、上方沒有任何正式行程的子行程，
 * 就退回用它自己的分類色。
 */
export const DEFAULT_COLOR = '#337bf6'

/** 分類色碼；找不到分類時回退到預設色 */
export function getCategoryColor(category) {
  return CATEGORIES[category]?.color ?? DEFAULT_COLOR
}

export const ITEM_TYPE = {
  PLACE: 'place',
  SUB_ITINERARY: 'subItinerary',
}

/** 把既有的 place 包成一個 item（migration 與新增時共用） */
export function toPlaceItem(place) {
  return { type: ITEM_TYPE.PLACE, place }
}

export function isPlaceItem(item) {
  return item?.type === ITEM_TYPE.PLACE
}

export function isSubItinerary(item) {
  return item?.type === ITEM_TYPE.SUB_ITINERARY
}

/** 排序用的識別值：一般地點用 place.id，子行程用自己的 id */
export function getItemId(item) {
  return isSubItinerary(item) ? item.id : item.place.id
}

/** 這個 item 底下的所有 place（子行程回傳 children，一般地點回傳自己） */
export function getItemPlaces(item) {
  if (isSubItinerary(item)) return item.places
  return isPlaceItem(item) ? [item.place] : []
}

/** 攤平成 place 陣列，給地圖與時間檢查使用（順序即畫面順序） */
export function flattenPlaces(items) {
  return (items ?? []).flatMap(getItemPlaces)
}

/**
 * 顯示用的代表時間。
 *
 * 子行程本身沒有 time，畫面上用第一個 child 的 time 代表；
 * 沒有 child 就回傳空字串，不會自行產生時間，也不會寫回資料。
 */
export function getItemTime(item) {
  if (isSubItinerary(item)) return item.places[0]?.time ?? ''
  return item.place?.time ?? ''
}

/** 依代表時間排序 items；沒有時間的排到最後，同時間維持原順序 */
export function sortItemsByTime(items) {
  return [...items].sort((a, b) => {
    const left = toMinutes(getItemTime(a))
    const right = toMinutes(getItemTime(b))
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    return left - right
  })
}

/** 把表單輸入整理成子行程資料；子行程沒有 time 與 position */
export function normalizeSubItinerary(values) {
  return {
    name: (values.name ?? '').trim(),
    category: values.category || 'sightseeing',
    duration: Math.max(0, Number(values.duration) || 0),
    note: (values.note ?? '').trim(),
  }
}

/** 只取一天中的正式行程（不含子地點） */
export function getTopLevelPlaces(items) {
  return (items ?? []).filter(isPlaceItem).map((item) => item.place)
}

/**
 * 正式行程編號：place.id → ① ② ③。
 *
 * 只有正式行程會拿到編號，子行程本身與子地點都不佔用編號。
 * Schedule 清單與地圖 marker 都從這裡取，確保兩邊一致。
 */
export function getScheduleNumbers(items) {
  const numbers = new Map()
  let current = 0

  for (const item of items ?? []) {
    if (isSubItinerary(item)) continue
    current += 1
    numbers.set(item.place.id, current)
  }

  return numbers
}

/**
 * 每個 item 的顯示色：item id → 色碼。
 *
 * 正式行程 = 自己的分類色；子行程 = 上方最近那個正式行程的顏色
 *（上方沒有正式行程時退回自己的分類色）。清單與地圖都從這裡取，兩邊一定一致。
 */
export function getItemColors(items) {
  const colors = new Map()
  let inherited = null

  for (const item of items ?? []) {
    if (isSubItinerary(item)) {
      colors.set(item.id, inherited ?? getCategoryColor(item.category))
      continue
    }
    inherited = getCategoryColor(item.place.category)
    colors.set(item.place.id, inherited)
  }

  return colors
}

/**
 * 給 MapView 的地點清單（view model，不是儲存資料）。
 *
 * 正式行程與子地點都會有 marker、都保留座標與 id（所以選取／對應關係不變），
 * 差別只在 markerLabel：正式行程是編號，子地點是空字串（不顯示正式編號）。
 * markerColor 讓子地點跟著所屬子行程的顏色，不用自己的分類色。
 */
export function buildMapPlaces(items) {
  const numbers = getScheduleNumbers(items)
  const colors = getItemColors(items)

  return (items ?? []).flatMap((item) => {
    if (isSubItinerary(item)) {
      const color = colors.get(item.id)
      return item.places.map((place) => ({
        ...place,
        markerLabel: '',
        subItineraryId: item.id,
        markerColor: color,
      }))
    }

    return [{
      ...item.place,
      markerLabel: String(numbers.get(item.place.id) ?? ''),
      markerColor: colors.get(item.place.id),
    }]
  })
}

/**
 * 子行程表單驗證，回傳 { 欄位: 錯誤訊息 }。
 * duration 一律是分鐘數，選填；空值會在 normalizeSubItinerary 轉成 0。
 */
export function validateSubItinerary(values) {
  const errors = {}

  if (!values.name?.trim()) errors.name = '請輸入子行程名稱'

  const duration = Number(values.duration)
  if (values.duration !== '' && (!Number.isFinite(duration) || duration < 0)) {
    errors.duration = '停留時間需為 0 以上的數字'
  }

  return errors
}

/** 在 items 中就地更新某個 place（含子行程內的 place） */
export function mapPlaceInItems(items, placeId, updater) {
  return items.map((item) => {
    if (isSubItinerary(item)) {
      if (!item.places.some((place) => place.id === placeId)) return item
      return { ...item, places: item.places.map((place) => (place.id === placeId ? updater(place) : place)) }
    }
    if (item.place.id !== placeId) return item
    return toPlaceItem(updater(item.place))
  })
}

/** 從 items 中移除某個 place（含子行程內的 place） */
export function removePlaceFromItems(items, placeId) {
  return items
    .map((item) => {
      if (!isSubItinerary(item)) return item
      if (!item.places.some((place) => place.id === placeId)) return item
      return { ...item, places: item.places.filter((place) => place.id !== placeId) }
    })
    .filter((item) => isSubItinerary(item) || item.place.id !== placeId)
}

/** 依 id 在陣列中搬移元素（items 與子行程內的 places 共用） */
export function moveById(list, getId, activeId, overId) {
  const from = list.findIndex((entry) => getId(entry) === activeId)
  const to = list.findIndex((entry) => getId(entry) === overId)
  if (from === -1 || to === -1) return null

  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
