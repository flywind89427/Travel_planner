import Modal from './Modal'

const ITEM_CLASS =
  'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors'

/**
 * TripSettingsModal：Header 的「行程管理」入口。
 *
 * 把佔空間但不常用的整體操作集中在這裡，讓 Header 在手機上保持精簡。
 *
 * props:
 *  - onManageDays()  開啟管理天數
 *  - onResetTrip()   進入既有的重設確認流程
 *  - onClose()
 */
function TripSettingsModal({ onManageDays, onResetTrip, onClose }) {
  return (
    <Modal title="行程管理" description="管理天數與整份行程" onClose={onClose}>
      <div className="space-y-2">
        <button
          type="button"
          onClick={onManageDays}
          className={`${ITEM_CLASS} border-slate-200 hover:border-brand-300 hover:bg-brand-50`}
        >
          <span aria-hidden="true" className="text-lg leading-none">📅</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">管理天數</span>
            <span className="block text-xs text-slate-500">新增、刪除、排序天數，或修改日期與名稱</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onResetTrip}
          className={`${ITEM_CLASS} border-slate-200 hover:border-red-300 hover:bg-red-50`}
        >
          <span aria-hidden="true" className="text-lg leading-none">↺</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">重設行程</span>
            <span className="block text-xs text-slate-500">清除瀏覽器儲存的行程，回到預設範例</span>
          </span>
        </button>
      </div>
    </Modal>
  )
}

export default TripSettingsModal
