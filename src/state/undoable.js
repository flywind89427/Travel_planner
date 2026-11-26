/**
 * 把任何 reducer 包成「可復原」的 reducer。
 *
 * 為什麼值得做：刪除一天／刪除行程會立刻寫進 LocalStorage，原本完全沒有退路。
 * 而 tripReducer 本來就是純函式 + 不可變更新，所以保留歷史只需要留住舊的
 * state reference，不用深拷貝，成本幾乎是零。
 *
 * state 形狀：{ past: [...舊的 present], present }
 * 外層只要讀 state.present，其餘元件完全不需要知道歷史的存在。
 */

export const HISTORY_ACTIONS = {
  UNDO: 'history/undo',
}

/** 預設保留的步數：足夠救回誤刪，又不會讓舊狀態一直佔著記憶體 */
const DEFAULT_LIMIT = 30

export const initHistory = (present) => ({ past: [], present })

export function withUndo(reducer, { limit = DEFAULT_LIMIT } = {}) {
  return function historyReducer(state, action) {
    if (action.type === HISTORY_ACTIONS.UNDO) {
      if (state.past.length === 0) return state
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
      }
    }

    const present = reducer(state.present, action)

    // reducer 回傳同一個 reference 代表這個 action 什麼都沒改
    //（例如拖曳放回原位、找不到 day），這種不該佔用一步歷史
    if (present === state.present) return state

    return { past: [...state.past, state.present].slice(-limit), present }
  }
}
