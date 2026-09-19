import { useEffect, useRef, useState } from 'react'
import { SEARCH_STATUS, usePlaceSearch } from '../state/usePlaceSearch'

const NOT_FOUND_MESSAGE = '找不到這個地點，請嘗試其他名稱'
const SERVICE_ERROR_MESSAGE = '搜尋服務暫時無法使用，請稍後再試'

/**
 * PlaceSearchField：地點名稱輸入 + Nominatim 搜尋結果下拉。
 *
 * 使用者只會看到地名，座標由選取結果自動帶入，
 * 不需要（也無法）手動輸入 lat / lng。
 *
 * props:
 *  - value        目前的地點名稱
 *  - coordinates  目前的座標 { lat, lng }，未選取時為 null
 *  - onChangeName(name)                  使用者自行輸入名稱
 *  - onSelectPlace({ name, lat, lng })   從搜尋結果選取
 *  - error        外部驗證錯誤訊息
 */
function PlaceSearchField({ value, coordinates, onChangeName, onSelectPlace, error }) {
  const { query, setQuery, reset, status, results } = usePlaceSearch()
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef(null)

  // 點到欄位外面就把下拉收起來
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  useEffect(() => setHighlight(0), [results])

  const handleChange = (event) => {
    const { value: next } = event.target
    onChangeName(next)
    setQuery(next)
    setIsOpen(true)
  }

  const handleSelect = (result) => {
    onSelectPlace({ name: result.name, lat: result.lat, lng: result.lng })
    setIsOpen(false)
    reset() // 清掉搜尋狀態，選取後不再打 API
  }

  const handleKeyDown = (event) => {
    if (!isOpen || results.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((current) => (current + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((current) => (current - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      // 在下拉開啟時 Enter 是「選取」，不要送出整張表單
      event.preventDefault()
      handleSelect(results[highlight])
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const showDropdown = isOpen && status !== SEARCH_STATUS.IDLE

  return (
    <div className="relative" ref={containerRef}>
      <label className="block">
        <span className="mb-1 flex items-baseline gap-2 text-sm font-medium text-slate-700">
          Place
          <span className="text-xs font-normal text-slate-400">輸入後從搜尋結果選擇</span>
        </span>

        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Shibuya"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </label>

      {/* 只確認「有沒有取到位置」，不顯示經緯度數字（使用者不會手動輸入座標） */}
      {coordinates && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600">
          <span aria-hidden="true">📍</span>
          <span>已取得地圖位置</span>
        </p>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {showDropdown && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {status === SEARCH_STATUS.LOADING && (
            <p className="px-3 py-2.5 text-sm text-slate-400">搜尋中…</p>
          )}

          {status === SEARCH_STATUS.EMPTY && (
            <p className="px-3 py-2.5 text-sm text-slate-500">{NOT_FOUND_MESSAGE}</p>
          )}

          {status === SEARCH_STATUS.ERROR && (
            <p className="px-3 py-2.5 text-sm text-slate-500">{SERVICE_ERROR_MESSAGE}</p>
          )}

          {status === SEARCH_STATUS.SUCCESS && (
            <ul role="listbox" className="max-h-60 overflow-y-auto">
              {results.map((result, index) => (
                <li key={result.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => handleSelect(result)}
                    className={`block w-full px-3 py-2 text-left transition-colors ${
                      index === highlight ? 'bg-brand-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {result.name}
                    </span>
                    {result.context && (
                      <span className="block truncate text-xs text-slate-400">
                        {result.context}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400">
            地點資料來源：OpenStreetMap / Nominatim
          </p>
        </div>
      )}
    </div>
  )
}

export default PlaceSearchField
