import { toMinutes } from './scheduleHelpers'

/**
 * 行程時間檢查（純函式，與 UI 完全分離）。
 *
 * 設計原則：
 *  - 「排序」與「時間」是兩份獨立資料，這裡只負責「發現問題」，
 *    絕對不修改任何時間，也不重新排序。
 *  - 結果一律即時計算，不寫進 trip、也不存進 LocalStorage。
 *  - 以 schedule.id 標記問題，不用 array index（拖曳後 index 會變）。
 *
 * 之後要擴充（行程重疊、停留時間不足、移動時間不足…）時，
 * 只要在 ISSUE_TYPES 新增類型並在下方多一段檢查即可，UI 不必改動。
 */

export const ISSUE_LEVEL = {
  ERROR: 'error',
  WARNING: 'warning',
}

export const ISSUE_TYPES = {
  /** 這個行程的時間早於前一個行程 */
  REVERSED: 'time/reversed',
  /** 與相鄰行程時間相同 */
  DUPLICATE: 'time/duplicate',
  /** 沒有設定時間 */
  MISSING: 'time/missing',
}

const EMPTY_RESULT = {
  hasError: false,
  hasWarning: false,
  errorIds: [],
  warningIds: [],
  issuesById: {},
}

function addIssue(issuesById, id, issue) {
  const current = issuesById[id] ?? []
  // 同一個項目可能同時是「前一個」也是「後一個」，同類型只留一筆
  if (current.some((item) => item.type === issue.type)) return
  issuesById[id] = [...current, issue]
}

/**
 * 依 array 順序檢查時間。
 *
 * @param {Array} schedules 目前這一天的行程（array 順序即行程順序）
 * @returns {{
 *   hasError: boolean,
 *   hasWarning: boolean,
 *   errorIds: string[],
 *   warningIds: string[],
 *   issuesById: Record<string, Array<{type, level, message, detail}>>,
 * }}
 */
export function validateScheduleTimes(schedules) {
  if (!Array.isArray(schedules) || schedules.length === 0) return EMPTY_RESULT

  const issuesById = {}

  // 沒有時間的項目不參與大小比較，只給一個輕微提示
  let previous = null

  for (const schedule of schedules) {
    const minutes = toMinutes(schedule.time)

    if (minutes === null) {
      addIssue(issuesById, schedule.id, {
        type: ISSUE_TYPES.MISSING,
        level: ISSUE_LEVEL.WARNING,
        message: '尚未設定時間',
        detail: '這個行程沒有時間，不會參與時間順序檢查。',
      })
      continue
    }

    if (previous) {
      if (minutes < previous.minutes) {
        const detail = `時間順序異常：上一個行程為 ${previous.time}，這個行程為 ${schedule.time}`
        addIssue(issuesById, previous.id, {
          type: ISSUE_TYPES.REVERSED,
          level: ISSUE_LEVEL.ERROR,
          message: '時間順序異常，請調整行程時間',
          detail,
        })
        addIssue(issuesById, schedule.id, {
          type: ISSUE_TYPES.REVERSED,
          level: ISSUE_LEVEL.ERROR,
          message: '時間順序異常，請調整行程時間',
          detail,
        })
      } else if (minutes === previous.minutes) {
        const detail = `與上一個行程「${previous.name}」的時間相同（${schedule.time}）`
        addIssue(issuesById, previous.id, {
          type: ISSUE_TYPES.DUPLICATE,
          level: ISSUE_LEVEL.WARNING,
          message: '時間相同',
          detail,
        })
        addIssue(issuesById, schedule.id, {
          type: ISSUE_TYPES.DUPLICATE,
          level: ISSUE_LEVEL.WARNING,
          message: '時間相同',
          detail,
        })
      }
    }

    previous = { id: schedule.id, minutes, time: schedule.time, name: schedule.name }
  }

  const entries = Object.entries(issuesById)
  const errorIds = entries
    .filter(([, issues]) => issues.some((issue) => issue.level === ISSUE_LEVEL.ERROR))
    .map(([id]) => id)
  const warningIds = entries
    .filter(([, issues]) => issues.every((issue) => issue.level === ISSUE_LEVEL.WARNING))
    .map(([id]) => id)

  return {
    hasError: errorIds.length > 0,
    hasWarning: warningIds.length > 0,
    errorIds,
    warningIds,
    issuesById,
  }
}

export default validateScheduleTimes
