import { useMemo, useState } from 'react'
import Modal from './Modal'
import PlaceSearchField from './PlaceSearchField'
import GoogleMapsLinkField from './GoogleMapsLinkField'
import { CATEGORIES } from '../data/defaultTrip'
import { getEndTime, toMinutes, validateSchedule } from '../utils/scheduleHelpers'


/**
 * 表單欄位的預設值：行程資料（trip）與表單欄位（form）之間的轉換都放在這裡，
 * App 只要決定「要開新增還是編輯」，不需要知道表單有哪些欄位。
 */

/**
 * 新增：時間接在最後一個行程之後，座標留空，由使用者從地點搜尋帶入。
 * places 由呼叫端決定 —— 加在一天的根層級就傳當天全部地點，
 * 加在子行程內就傳該子行程的地點。
 */
export function buildAddValues(places = []) {
  // 時間是選填，最後一筆可能沒有時間；往回找最後一個「有時間」的地點當基準，
  // 都沒有就從 09:00 開始（不能讓預設值變成空字串，否則表單一開就是無效的）
  const last = [...places].reverse().find((place) => toMinutes(place?.time) !== null)

  return {
    time: last ? getEndTime(last) : '09:00',
    duration: 60,
    name: '',
    nameLocal: '',
    category: 'sightseeing',
    note: '',
    lat: '',
    lng: '',
    googleMapsUrl: '',
  }
}

/** 編輯：把既有行程點攤平成表單欄位 */
export function buildEditValues(place) {
  return {
    time: place.time,
    duration: place.duration ?? 0,
    name: place.name,
    nameLocal: place.nameLocal ?? '',
    category: place.category,
    note: place.note ?? '',
    lat: place.position[0],
    lng: place.position[1],
    googleMapsUrl: place.googleMapsUrl ?? '',
  }
}

/** 時間欄位只需要放得下 HH:MM（手機的原生選擇器會自己撐滿，要另外收窄） */
const TIME_WIDTH = 'max-w-[10rem]'

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

/**
 * EditScheduleModal：新增／編輯行程的表單（同一個 component 兼顧兩種模式）。
 *
 * 表單自己只保管「草稿」與驗證結果，按下 Save 才把值交給上層，
 * 真正的 trip 修改一律由 useTrip 的 addSchedule / updateSchedule 處理。
 *
 * props:
 *  - mode           'add' | 'edit'
 *  - initialValues  表單預設值
 *  - onSubmit(values)
 *  - onClose()
 */
function EditScheduleModal({ mode, initialValues, onSubmit, onClose }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})

  const isEdit = mode === 'edit'
  const previewEnd = useMemo(
    () => getEndTime({ time: values.time, duration: values.duration }),
    [values.time, values.duration],
  )

  const setField = (field) => (event) => {
    const { value } = event.target
    setValues((current) => ({ ...current, [field]: value }))
  }

  const hasCoordinates = values.lat !== '' && values.lng !== '' && values.lat !== null

  // 從搜尋結果選取：地名與座標一起寫進表單草稿
  const handleSelectPlace = ({ name, lat, lng }) => {
    setValues((current) => ({ ...current, name, lat, lng }))
    setErrors((current) => ({ ...current, name: undefined, location: undefined }))
  }

  // 從 Google Maps 連結匯入：一定存連結，座標只有解析得到才覆寫
  const handleImportGoogleMapsUrl = ({ url, lat, lng, placeName }) => {
    setValues((current) => ({
      ...current,
      googleMapsUrl: url,
      // 名稱只在使用者還沒填時才帶入，不覆蓋既有輸入
      ...(placeName && !current.name.trim() ? { name: placeName } : {}),
      ...(lat !== null && lng !== null ? { lat, lng } : {}),
    }))
    setErrors((current) => ({
      ...current,
      googleMapsUrl: undefined,
      name: undefined,
      ...(lat !== null ? { location: undefined } : {}),
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextErrors = validateSchedule(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    onSubmit(values)
  }

  return (
    <Modal
      title={isEdit ? '編輯行程' : '新增行程'}
      description={isEdit ? '修改後 Timeline 與地圖會同步更新' : '儲存後會依時間自動排序'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Time" error={errors.time}>
            <input
              type="time"
              value={values.time}
              onChange={setField('time')}
              className={`${FIELD_CLASS} ${TIME_WIDTH}`}
            />
          </Field>

          <Field
            label="Duration"
            hint="分鐘"
            error={errors.duration}
          >
            <input
              type="number"
              min="0"
              step="5"
              value={values.duration}
              onChange={setField('duration')}
              className={FIELD_CLASS}
            />
          </Field>
        </div>

        <p className="-mt-1 text-xs text-slate-400">
          結束時間 {previewEnd || '—'}
        </p>

        {/* 地點輸入區：兩種方式擇一，座標最後都寫回同一份表單草稿 */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <PlaceSearchField
            value={values.name}
            coordinates={hasCoordinates ? { lat: values.lat, lng: values.lng } : null}
            onChangeName={(name) => setValues((current) => ({ ...current, name }))}
            onSelectPlace={handleSelectPlace}
            error={errors.name || errors.location}
          />

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">OR</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <GoogleMapsLinkField
            value={values.googleMapsUrl}
            hasCoordinates={hasCoordinates}
            onImport={handleImportGoogleMapsUrl}
            error={errors.googleMapsUrl}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="當地名稱" hint="選填">
            <input
              type="text"
              value={values.nameLocal}
              onChange={setField('nameLocal')}
              placeholder="澀谷"
              className={FIELD_CLASS}
            />
          </Field>

          <Field label="分類">
            <select value={values.category} onChange={setField('category')} className={FIELD_CLASS}>
              {Object.entries(CATEGORIES).map(([key, category]) => (
                <option key={key} value={key}>
                  {category.emoji} {category.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Note" hint="選填">
          <textarea
            rows="2"
            value={values.note}
            onChange={setField('note')}
            placeholder="Lunch + Shopping"
            className={`${FIELD_CLASS} resize-none`}
          />
        </Field>

        {/* 內容過長時按鈕仍固定在 Modal 底部，只作用於 Modal 內部捲動容器 */}
        <div className="sticky bottom-0 -mx-5 -mb-4 bg-white px-5 pb-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            取消
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

export default EditScheduleModal
