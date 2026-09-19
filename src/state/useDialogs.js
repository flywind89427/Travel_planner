import { useCallback, useMemo, useState } from 'react'

/**
 * useDialogs：集中管理對話框的「開關與目前對象」。
 *
 * 只負責 dialog 這一類 UI 狀態，不碰行程資料，也不碰表單內部的草稿 state
 * （草稿仍留在各自的 Modal 裡）。
 *
 * 畫面上同時間只會開一個對話框，所以用單一插槽表示，
 * 附帶的資料（要編輯的行程 / 要刪除的行程 / 要編輯的那一天）放在同一個物件裡。
 */
export const DIALOG = {
  ADD_SCHEDULE: 'addSchedule',
  EDIT_SCHEDULE: 'editSchedule',
  EDIT_DAY: 'editDay',
  DELETE_SCHEDULE: 'deleteSchedule',
  RESET_TRIP: 'resetTrip',
  SETTINGS: 'settings',
  MANAGE_DAYS: 'manageDays',
  ADD_SUB_ITINERARY: 'addSubItinerary',
  EDIT_SUB_ITINERARY: 'editSubItinerary',
  DELETE_SUB_ITINERARY: 'deleteSubItinerary',
}

export function useDialogs() {
  const [dialog, setDialog] = useState(null)

  const close = useCallback(() => setDialog(null), [])

  const openers = useMemo(
    () => ({
      // parentId 有值時，這次新增的地點會加進該子行程
      openAddSchedule: (parentId) => setDialog({ type: DIALOG.ADD_SCHEDULE, parentId }),
      openEditSchedule: (place) => setDialog({ type: DIALOG.EDIT_SCHEDULE, place }),
      openEditDay: (day) => setDialog({ type: DIALOG.EDIT_DAY, day }),
      openDeleteSchedule: (place) => setDialog({ type: DIALOG.DELETE_SCHEDULE, place }),
      openResetTrip: () => setDialog({ type: DIALOG.RESET_TRIP }),
      openSettings: () => setDialog({ type: DIALOG.SETTINGS }),
      openManageDays: () => setDialog({ type: DIALOG.MANAGE_DAYS }),
      openAddSubItinerary: () => setDialog({ type: DIALOG.ADD_SUB_ITINERARY }),
      openEditSubItinerary: (subItinerary) =>
        setDialog({ type: DIALOG.EDIT_SUB_ITINERARY, subItinerary }),
      openDeleteSubItinerary: (subItinerary) =>
        setDialog({ type: DIALOG.DELETE_SUB_ITINERARY, subItinerary }),
    }),
    [],
  )

  /** 目前開啟的是不是某個對話框 */
  const isOpen = useCallback((type) => dialog?.type === type, [dialog])

  return { dialog, isOpen, close, ...openers }
}

export default useDialogs
