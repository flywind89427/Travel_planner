import { useState } from 'react'
import Modal from './Modal'
import { buildAddValues, buildEditValues } from './EditScheduleModal'
import PlaceSearchField from './PlaceSearchField'
import { CATEGORIES } from '../data/defaultTrip'
import { validateSubItinerary } from '../utils/dayItems'
import { validateSchedule } from '../utils/scheduleHelpers'

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-base text-slate-800 sm:text-sm outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500'

function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-2 text-sm font-medium text-slate-700">
        {label}
        {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

/** 空白代表未設定，normalizeSubItinerary 會轉成 0 分鐘 */
export function buildSubItineraryValues(subItinerary) {
  return {
    name: subItinerary?.name ?? '',
    category: subItinerary?.category ?? 'sightseeing',
    duration: subItinerary?.duration ? String(subItinerary.duration) : '',
    note: subItinerary?.note ?? '',
  }
}

/**
 * EditSubItineraryModal：新增／編輯子行程。
 *
 * 顏色沒有獨立欄位：子行程跟隨「上方最近的正式行程」的分類色，所以這裡沒有色票。
 * 子地點的時間是選填，留空代表還沒決定幾點去。
 *
 * 子行程沒有 time / position / googleMapsUrl，所以群組欄位與子地點分成兩區：
 * 上半部是子行程本身，下半部是「子行程地點」——每一筆可展開修改名稱／時間／
 * 停留／備註，也可以標記刪除。行程清單裡的子地點只做呈現，管理一律回到這裡。
 *
 * 子地點在這裡一樣是草稿：按 Save 才會套用，取消則什麼都不會改。
 * 座標、分類、Google Maps 連結沿用原本的值（那些欄位由地點搜尋維護），
 * 送出時整筆交給既有的 updateSchedule，不需要新的資料結構。
 *
 * props:
 *  - mode           'add' | 'edit'
 *  - initialValues  表單預設值
 *  - places         這個子行程目前的地點（edit 模式才有意義）
 *  - onSubmit(values, placeChanges) / onClose()
 *      placeChanges = { added: [values], updates: [{ id, values }], removed: [id] }
 *
 * 新增的地點一樣走既有的地點搜尋取得座標，送出時交給 addSchedule。
 */

/** 尚未存進資料的草稿地點，只在這張表單裡有意義 */
let draftSequence = 0
const createDraftId = () => {
  draftSequence += 1
  return `draft-${draftSequence}`
}
function EditSubItineraryModal({ mode, initialValues, places = [], onSubmit, onClose }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})

  // 子地點草稿：original 用來判斷有沒有真的被改過，沒改的不會送出
  const [placeDrafts, setPlaceDrafts] = useState(() =>
    places.map((place) => {
      const draft = buildEditValues(place)
      return { id: place.id, isNew: false, original: draft, values: draft, removed: false }
    }),
  )
  const [openPlaceId, setOpenPlaceId] = useState(null)
  const [placeErrors, setPlaceErrors] = useState({})

  const isEdit = mode === 'edit'
  const remainingPlaces = placeDrafts.filter((draft) => !draft.removed)

  const setPlaceField = (id, field) => (event) => {
    const { value } = event.target
    setPlaceDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, values: { ...draft.values, [field]: value } } : draft,
      ),
    )
  }

  const toggleRemoved = (id) => {
    setPlaceDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, removed: !draft.removed } : draft)),
    )
    setOpenPlaceId((current) => (current === id ? null : current))
  }

  /** 還沒存進資料的新地點直接從草稿移除，不需要標記 */
  const discardDraft = (id) => {
    setPlaceDrafts((current) => current.filter((draft) => draft.id !== id))
    setOpenPlaceId((current) => (current === id ? null : current))
  }

  // 時間預設值接在目前最後一個地點之後，與既有的新增地點表單一致
  const addDraft = () => {
    const id = createDraftId()
    const previous = placeDrafts.filter((draft) => !draft.removed).map((draft) => ({
      time: draft.values.time,
      duration: Number(draft.values.duration) || 0,
    }))
    setPlaceDrafts((current) => [
      ...current,
      { id, isNew: true, original: null, values: buildAddValues(previous), removed: false },
    ])
    setOpenPlaceId(id)
  }

  const selectDraftPlace = (id) => ({ name, lat, lng }) => {
    setPlaceDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, values: { ...draft.values, name, lat, lng } } : draft,
      ),
    )
    setPlaceErrors((current) => ({ ...current, [id]: undefined }))
  }

  const setField = (field) => (event) => {
    const { value } = event.target
    setValues((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextErrors = validateSubItinerary(values)
    setErrors(nextErrors)

    // 要刪掉的那幾筆不用驗證
    const nextPlaceErrors = {}
    remainingPlaces.forEach((draft) => {
      const found = validateSchedule(draft.values)
      // 子地點的時間是選填：留空就不算錯（清單會顯示 --:--，也不參與時間順序檢查）
      if (!draft.values.time) delete found.time
      if (Object.keys(found).length > 0) nextPlaceErrors[draft.id] = found
    })
    setPlaceErrors(nextPlaceErrors)

    if (Object.keys(nextErrors).length > 0) return
    if (Object.keys(nextPlaceErrors).length > 0) {
      // 讓使用者直接看到出問題的那一筆
      setOpenPlaceId(Object.keys(nextPlaceErrors)[0])
      return
    }

    onSubmit(values, {
      added: remainingPlaces.filter((draft) => draft.isNew).map((draft) => draft.values),
      updates: remainingPlaces
        .filter((draft) => !draft.isNew)
        .filter((draft) => JSON.stringify(draft.values) !== JSON.stringify(draft.original))
        .map((draft) => ({ id: draft.id, values: draft.values })),
      removed: placeDrafts
        .filter((draft) => draft.removed && !draft.isNew)
        .map((draft) => draft.id),
    })
  }

  return (
    <Modal
      title={isEdit ? '編輯子行程' : '新增子行程'}
      description="子行程是一組活動，地點在下方管理"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="名稱" error={errors.name}>
          <input
            type="text"
            value={values.name}
            onChange={setField('name')}
            placeholder="澀谷逛街"
            className={FIELD_CLASS}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="分類">
            <select value={values.category} onChange={setField('category')} className={FIELD_CLASS}>
              {Object.entries(CATEGORIES).map(([key, category]) => (
                <option key={key} value={key}>
                  {category.emoji} {category.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Duration" hint="分鐘・選填" error={errors.duration}>
            <input
              type="number"
              min="0"
              step="15"
              value={values.duration}
              onChange={setField('duration')}
              placeholder="240"
              className={FIELD_CLASS}
            />
          </Field>
        </div>

        <Field label="Note" hint="選填">
          <textarea
            rows="2"
            value={values.note}
            onChange={setField('note')}
            placeholder="整個下午都在這一區"
            className={`${FIELD_CLASS} resize-none`}
          />
        </Field>

        {isEdit && (
          <div>
            <span className="mb-1 flex items-baseline gap-2 text-sm font-medium text-slate-700">
              子行程地點
              <span className="text-xs font-normal text-slate-400">
                共 {remainingPlaces.length} 個・展開可修改
              </span>
            </span>

            {placeDrafts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                這個子行程還沒有地點
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {placeDrafts.map((draft) => {
                  const isOpen = openPlaceId === draft.id
                  const rowErrors = placeErrors[draft.id] ?? {}
                  return (
                    <li key={draft.id} className={draft.removed ? 'bg-red-50/40' : ''}>
                      <div className="flex items-center gap-1 px-2 py-1">
                        <button
                          type="button"
                          onClick={() => setOpenPlaceId(isOpen ? null : draft.id)}
                          aria-expanded={isOpen}
                          aria-label={
                            draft.isNew ? '編輯新地點' : `編輯地點：${draft.original.name}`
                          }
                          disabled={draft.removed}
                          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:text-slate-400"
                        >
                          <span aria-hidden="true" className="text-xs text-slate-400">
                            {isOpen ? '▾' : '▸'}
                          </span>
                          <span
                            className={`truncate ${draft.removed ? 'line-through' : ''} ${
                              draft.isNew && !draft.values.name ? 'text-slate-400' : ''
                            }`}
                          >
                            {draft.values.name || (draft.isNew ? '新地點' : draft.original.name)}
                          </span>
                          <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-400">
                            {draft.values.time}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            draft.isNew ? discardDraft(draft.id) : toggleRemoved(draft.id)
                          }
                          aria-label={
                            draft.isNew
                              ? '移除新地點'
                              : draft.removed
                                ? `復原地點：${draft.original.name}`
                                : `刪除地點：${draft.original.name}`
                          }
                          className={`inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors ${
                            draft.removed
                              ? 'text-slate-600 hover:bg-slate-100'
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                        >
                          {draft.removed ? '復原' : draft.isNew ? '移除' : '刪除'}
                        </button>
                      </div>

                      {isOpen && !draft.removed && (
                        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
                          {draft.isNew ? (
                            <PlaceSearchField
                              value={draft.values.name}
                              coordinates={
                                draft.values.lat !== '' && draft.values.lng !== ''
                                  ? { lat: draft.values.lat, lng: draft.values.lng }
                                  : null
                              }
                              onChangeName={(name) =>
                                setPlaceDrafts((current) =>
                                  current.map((row) =>
                                    row.id === draft.id
                                      ? { ...row, values: { ...row.values, name } }
                                      : row,
                                  ),
                                )
                              }
                              onSelectPlace={selectDraftPlace(draft.id)}
                              error={rowErrors.name || rowErrors.location}
                            />
                          ) : (
                            <Field label="名稱" error={rowErrors.name}>
                              <input
                                type="text"
                                value={draft.values.name}
                                onChange={setPlaceField(draft.id, 'name')}
                                className={FIELD_CLASS}
                              />
                            </Field>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                            <Field label="時間" hint="選填" error={rowErrors.time}>
                              <input
                                type="time"
                                value={draft.values.time}
                                onChange={setPlaceField(draft.id, 'time')}
                                className={`${FIELD_CLASS} max-w-[8rem]`}
                              />
                            </Field>
                            <Field label="停留" hint="分鐘" error={rowErrors.duration}>
                              <input
                                type="number"
                                min="0"
                                step="15"
                                value={draft.values.duration}
                                onChange={setPlaceField(draft.id, 'duration')}
                                className={FIELD_CLASS}
                              />
                            </Field>
                          </div>

                          <Field label="Note" hint="選填">
                            <textarea
                              rows="2"
                              value={draft.values.note}
                              onChange={setPlaceField(draft.id, 'note')}
                              className={`${FIELD_CLASS} resize-none`}
                            />
                          </Field>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <button
              type="button"
              onClick={addDraft}
              className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
            >
              <span aria-hidden="true" className="text-base leading-none">＋</span>
              新增地點
            </button>
          </div>
        )}

        <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 pb-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            className="min-h-10 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default EditSubItineraryModal
