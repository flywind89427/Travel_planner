/**
 * 行程分類與其顏色。
 *
 * 獨立成一個模組是為了避免循環相依：
 * utils/dayItems 需要分類色，而 data/defaultTrip 需要 dayItems 的 toPlaceItem，
 * 兩邊直接互相 import 會讓模組初始化順序一改就出現 TDZ 錯誤。
 * 這裡只有資料、不 import 任何東西，兩邊都從這裡拿。
 */
export const CATEGORIES = {
  hotel: { label: '住宿', emoji: '🏨', color: '#8b5cf6' },
  sightseeing: { label: '景點', emoji: '⛩️', color: '#337bf6' },
  food: { label: '美食', emoji: '🍜', color: '#f97316' },
  shopping: { label: '購物', emoji: '🛍️', color: '#ec4899' },
  nature: { label: '自然', emoji: '🌳', color: '#10b981' },
  transport: { label: '交通', emoji: '🚃', color: '#64748b' },
}

export default CATEGORIES
