import Modal from './Modal'
import { getUtcOffset, isValidTimezone } from '../utils/placeFields'

const ITEM_CLASS =
  'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors'

/**
 * 時區選單的候選清單。
 *
 * 完整 IANA 清單上千筆，塞進 select 既難選也沒必要；這裡只放常見的旅遊目的地，
 * 再把使用者裝置目前的時區補進來（出國前在家規劃時，那通常就是出發地）。
 * 需要清單以外的時區時再擴充這個陣列即可。
 */
const COMMON_TIME_ZONES = [
  'Asia/Tokyo',
  'Asia/Taipei',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Europe/London',
  'Europe/Paris',
  'America/Los_Angeles',
  'America/New_York',
  'Australia/Sydney',
]

/** 裝置時區不在清單裡就補上，讓任何地方的使用者至少選得到自己所在的時區 */
function buildTimeZoneOptions(current) {
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zones = [...COMMON_TIME_ZONES]

  for (const zone of [deviceZone, current]) {
    if (isValidTimezone(zone) && !zones.includes(zone)) zones.push(zone)
  }

  return zones
}

/**
 * TripSettingsModal：Header 的「行程管理」入口。
 *
 * 把佔空間但不常用的整體操作集中在這裡，讓 Header 在手機上保持精簡。
 *
 * props:
 *  - timezone           目前的行程時區（IANA 名稱）
 *  - onChangeTimezone(zone)
 *  - onManageDays()  開啟管理天數
 *  - onResetTrip()   進入既有的重設確認流程
 *  - onClose()
 */
function TripSettingsModal({ timezone, onChangeTimezone, onManageDays, onResetTrip, onClose }) {
  const options = buildTimeZoneOptions(timezone)

  return (
    <Modal title="行程管理" description="管理天數與整份行程" onClose={onClose}>
      <div className="space-y-2">
        {/* 時區決定行程的 'HH:mm' 代表哪個時刻，路線查詢要靠它換算成絕對時間 */}
        <div className="rounded-xl border border-slate-200 px-4 py-3">
          <label className="block">
            <span className="flex items-baseline gap-2 text-sm font-semibold text-slate-800">
              <span aria-hidden="true">🌐</span>
              行程時區
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              行程裡的時間都是這個時區的當地時間；查詢大眾運輸時會用它換算
            </span>
            <select
              value={timezone}
              onChange={(event) => onChangeTimezone(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-base text-slate-800 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:text-sm"
            >
              {options.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}（UTC{getUtcOffset(zone)}）
                </option>
              ))}
            </select>
          </label>
        </div>

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
