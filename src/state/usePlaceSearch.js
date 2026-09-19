import { useCallback, useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../api/nominatim'

/** 搜尋狀態：閒置／查詢中／有結果／查無結果／服務錯誤 */
export const SEARCH_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  EMPTY: 'empty',
  ERROR: 'error',
}

const IDLE_STATE = { status: SEARCH_STATUS.IDLE, results: [] }

/**
 * usePlaceSearch：把 debounce、取消、錯誤處理包起來。
 *
 * 這個 hook 只管「搜尋結果」這個暫時性資料，
 * 不保存任何已選取的地點 —— 選完之後座標一律寫回表單，
 * 最後由 useTrip 存進 trip，維持單一資料來源。
 */
export function usePlaceSearch({ debounceMs = 500, minLength = 2 } = {}) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState(IDLE_STATE)
  const controllerRef = useRef(null)

  useEffect(() => {
    const keyword = query.trim()

    if (keyword.length < minLength) {
      setState(IDLE_STATE)
      return undefined
    }

    // debounce：使用者停止輸入後才真的發出請求
    const timer = setTimeout(() => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      setState({ status: SEARCH_STATUS.LOADING, results: [] })

      searchPlaces(keyword, { signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted) return
          setState({
            status: results.length > 0 ? SEARCH_STATUS.SUCCESS : SEARCH_STATUS.EMPTY,
            results,
          })
        })
        .catch((error) => {
          // 被新的輸入取消不算失敗
          if (error.name === 'AbortError') return
          console.warn('[usePlaceSearch] 搜尋失敗：', error)
          setState({ status: SEARCH_STATUS.ERROR, results: [] })
        })
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [query, debounceMs, minLength])

  // 元件卸載時取消還在飛的請求
  useEffect(() => () => controllerRef.current?.abort(), [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    setQuery('')
    setState(IDLE_STATE)
  }, [])

  return { query, setQuery, reset, status: state.status, results: state.results }
}

export default usePlaceSearch
