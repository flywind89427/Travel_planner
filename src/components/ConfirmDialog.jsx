import Modal from './Modal'

/**
 * ConfirmDialog：刪除前的確認視窗。
 *
 * props:
 *  - title / message / confirmLabel
 *  - onConfirm() / onCancel()
 */
function ConfirmDialog({ title = '確認刪除', message, confirmLabel = '刪除', onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-600">{message}</p>

      <div className="sticky bottom-0 -mx-5 -mb-4 bg-white px-5 pb-4 mt-6 flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export default ConfirmDialog
