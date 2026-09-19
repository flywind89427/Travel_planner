import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import EditDayModal from './EditDayModal'
import { createDayId } from '../utils/scheduleHelpers'
import { flattenPlaces } from '../utils/dayItems'

const ICON_BUTTON_CLASS =
  'flex min-h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40'

/** '2026-10-12' → '10/12' */
function formatShortDate(value) {
  if (!value) return '未設定日期'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 新增一天時的預設日期：接在最後一天之後 */
function nextDate(value) {
  const base = value ? new Date(`${value}T00:00:00`) : new Date()
  if (Number.isNaN(base.getTime())) return ''
  base.setDate(base.getDate() + (value ? 1 : 0))

  // 用本地日期組字串；toISOString() 會轉成 UTC，在 UTC+8 會倒退一天
  const year = base.getFullYear()
  const month = String(base.getMonth() + 1).padStart(2, '0')
  const day = String(base.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 單一天的列。拖曳只由左側 handle 觸發，避免與編輯／刪除衝突。
 * 這是 Day 管理自己的 sortable list，與 ScheduleItem 的設定互不影響。
 */
function SortableDayRow({ day, index, canDelete, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: day.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border bg-white p-2 ${
        isDragging ? 'border-dashed border-brand-400 opacity-60 shadow-lg' : 'border-slate-200'
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`拖曳排序：Day ${index + 1}`}
        className="flex min-h-10 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
      >
        <span aria-hidden="true">☰</span>
      </button>

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-sm font-semibold text-slate-800">
          Day {index + 1}
          <span className="text-xs font-normal text-slate-400">{formatShortDate(day.date)}</span>
        </p>
        <p className="truncate text-xs text-slate-500">
          {day.description || <span className="text-slate-300">未命名</span>}
        </p>
        <p className="text-[11px] text-slate-400">{flattenPlaces(day.items).length} 個行程</p>
      </div>

      <button
        type="button"
        onClick={() => onEdit(day.id)}
        aria-label={`編輯 Day ${index + 1}`}
        className={`${ICON_BUTTON_CLASS} text-slate-600 hover:border-brand-300 hover:bg-brand-50`}
      >
        <span aria-hidden="true">✎</span>
      </button>
      <button
        type="button"
        onClick={() => onDelete(day.id)}
        disabled={!canDelete}
        aria-label={`刪除 Day ${index + 1}`}
        title={canDelete ? undefined : '至少要保留一天'}
        className={`${ICON_BUTTON_CLASS} text-slate-600 hover:border-red-300 hover:bg-red-50`}
      >
        <span aria-hidden="true">🗑</span>
      </button>
    </li>
  )
}

/**
 * DayManagerModal：一次管理所有天數。
 *
 * 採 draft 策略：所有操作先改本地草稿，按「儲存」才交給上層寫入 trip state，
 * 按「取消」則整批放棄。這個元件不碰 localStorage，也不直接改 trip。
 *
 * props:
 *  - days            目前的天數
 *  - onSubmit(days)  儲存（由 App 交給 useTrip → reducer）
 *  - onClose()
 */
function DayManagerModal({ days, onSubmit, onClose }) {
  const [draft, setDraft] = useState(() => days.map((day) => ({ ...day })))
  const [editingId, setEditingId] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // 排序時整天一起搬移（date / description / places 都跟著走，不重算日期）
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    setDraft((current) => {
      const from = current.findIndex((day) => day.id === active.id)
      const to = current.findIndex((day) => day.id === over.id)
      if (from === -1 || to === -1) return current

      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const handleAdd = () => {
    const last = draft[draft.length - 1]
    const day = {
      id: createDayId(),
      dayNumber: draft.length + 1,
      date: nextDate(last?.date),
      description: '',
      items: [],
    }
    setDraft((current) => [...current, day])
    // 新增後直接開啟編輯，讓使用者填日期與名稱
    setEditingId(day.id)
  }

  const handleEditSubmit = (values) => {
    setDraft((current) =>
      current.map((day) =>
        day.id === editingId
          ? { ...day, date: values.date, description: (values.description ?? '').trim() }
          : day,
      ),
    )
    setEditingId(null)
  }

  const handleConfirmDelete = () => {
    setDraft((current) => current.filter((day) => day.id !== pendingDeleteId))
    setPendingDeleteId(null)
  }

  const editingIndex = draft.findIndex((day) => day.id === editingId)
  const editingDay = editingIndex === -1 ? null : draft[editingIndex]
  const pendingDelete = draft.find((day) => day.id === pendingDeleteId)
  const pendingDeleteIndex = draft.findIndex((day) => day.id === pendingDeleteId)

  return (
    <Modal
      title="管理天數"
      description="拖曳調整順序，Day 編號會依順序自動更新"
      onClose={onClose}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <ul className="space-y-2">
          <SortableContext items={draft.map((day) => day.id)} strategy={verticalListSortingStrategy}>
            {draft.map((day, index) => (
              <SortableDayRow
                key={day.id}
                day={day}
                index={index}
                canDelete={draft.length > 1}
                onEdit={setEditingId}
                onDelete={setPendingDeleteId}
              />
            ))}
          </SortableContext>
        </ul>
      </DndContext>

      <button
        type="button"
        onClick={handleAdd}
        className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-medium text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
      >
        <span aria-hidden="true" className="text-lg leading-none">＋</span>
        新增一天
      </button>

      <div className="sticky bottom-0 -mx-5 -mb-4 bg-white px-5 pb-4 mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onSubmit(draft)}
          className="min-h-10 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          儲存
        </button>
      </div>

      {/* 巢狀對話框放在 Modal 內容中，點擊時才不會被外層的背景關閉邏輯攔截 */}
      {editingDay && (
        <EditDayModal
          day={{ ...editingDay, dayNumber: editingIndex + 1 }}
          onSubmit={handleEditSubmit}
          onClose={() => setEditingId(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`刪除 Day ${pendingDeleteIndex + 1}？`}
          message={
            flattenPlaces(pendingDelete.items).length > 0
              ? `此天仍有 ${flattenPlaces(pendingDelete.items).length} 個行程，刪除後這些行程也會一起刪除。`
              : '這一天沒有行程，確定要刪除嗎？'
          }
          confirmLabel="刪除"
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </Modal>
  )
}

export default DayManagerModal
