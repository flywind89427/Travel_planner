import { useState } from 'react'
import Modal from './Modal'

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-base text-slate-800 sm:text-sm outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500'

/**
 * EditDayModal：編輯單一天的日期與描述。
 *
 * Day number 是行程順序，不開放修改。
 * Modal 只保管表單草稿，按下 Save 才把值交給上層寫入 trip state。
 *
 * props:
 *  - day              要編輯的那一天
 *  - onSubmit(values) { date, description }
 *  - onClose()
 */
function EditDayModal({ day, onSubmit, onClose }) {
  const [values, setValues] = useState({
    date: day.date ?? '',
    description: day.description ?? '',
  })
  const [error, setError] = useState(null)

  const setField = (field) => (event) => {
    const { value } = event.target
    setValues((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!values.date || Number.isNaN(new Date(`${values.date}T00:00:00`).getTime())) {
      setError('請輸入有效日期')
      return
    }

    onSubmit(values)
  }

  return (
    <Modal
      title={`Edit Day ${day.dayNumber}`}
      description="日期與描述會立即套用到行程"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Day</span>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Day {day.dayNumber}
            <span className="ml-2 text-xs text-slate-400">（行程順序，不可修改）</span>
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Date</span>
          <input type="date" value={values.date} onChange={setField('date')} className={FIELD_CLASS} />
          {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
        </label>

        <label className="block">
          <span className="mb-1 flex items-baseline gap-2 text-sm font-medium text-slate-700">
            Description
            <span className="text-xs font-normal text-slate-400">選填</span>
          </span>
          <input
            type="text"
            value={values.description}
            onChange={setField('description')}
            placeholder="Shibuya · Shinjuku"
            className={FIELD_CLASS}
            autoFocus
          />
        </label>

        <div className="sticky bottom-0 -mx-5 -mb-4 bg-white px-5 pb-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default EditDayModal
