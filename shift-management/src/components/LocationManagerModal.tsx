import { useMemo, useState } from 'react'
import { Ban, Check, MapPinPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Location, LocationInput, UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { useSchedule } from '../data/ScheduleContext'
import { colorByKey, SHIFT_COLOR_KEYS, type ShiftColorKey } from '../lib/colors'
import { useNotify } from '../notifications/NotificationContext'
import { Modal } from './Modal'
import { Checkbox } from './Checkbox'
import { LocationChip } from './LocationChip'
import { locationShortName } from '../lib/locations'

const inputClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
const labelClass = 'block text-xs font-medium text-slate-600 mb-1'
const iconButton =
  'flex h-11 w-11 items-center justify-center rounded-md text-slate-400 transition sm:h-auto sm:w-auto sm:p-1.5'

/** Cùng giới hạn với check `locations_name_valid` trong 012 (sau khi trim). */
const NAME_MAX = 50
/** Cùng giới hạn với check `locations_short_name_valid` trong 014. */
const SHORT_MAX = 10
/** `sort_order` là `int` của Postgres. */
const INT_MIN = -2147483648
const INT_MAX = 2147483647

interface Draft {
  id?: UUID
  name: string
  /** Rỗng = tự cắt từ tên. */
  shortName: string
  color: ShiftColorKey | null
  /** Giữ dạng chuỗi để ô số gõ dở ("", "-") không bị ép về 0. */
  order: string
  is_active: boolean
}

function isColorKey(value: unknown): value is ShiftColorKey {
  return (SHIFT_COLOR_KEYS as readonly unknown[]).includes(value)
}

function emptyDraft(locations: Location[]): Draft {
  const used = new Set(locations.map((l) => l.color))
  // Nơi mới xếp cuối: mặc định 0 sẽ trùng thứ tự và nhảy lên theo tên.
  const last = locations.reduce((max, l) => Math.max(max, l.sort_order), -1)
  return {
    name: '',
    shortName: '',
    color: SHIFT_COLOR_KEYS.find((key) => !used.has(key)) ?? SHIFT_COLOR_KEYS[0],
    order: String(Math.min(last + 1, INT_MAX)),
    is_active: true,
  }
}

function toDraft(location: Location): Draft {
  return {
    id: location.id,
    name: location.name,
    shortName: location.short_name ?? '',
    color: isColorKey(location.color) ? location.color : null,
    order: String(location.sort_order),
    is_active: location.is_active,
  }
}

function toInput(location: Location): LocationInput {
  return {
    name: location.name,
    short_name: location.short_name,
    color: location.color,
    sort_order: location.sort_order,
    is_active: location.is_active,
  }
}

function parseOrder(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null
  const n = Number(value.trim())
  return n >= INT_MIN && n <= INT_MAX ? n : null
}

/**
 * Hộp Quản lý nơi trực (chỉ admin — trigger `enforce_location_admin` của 012
 * mới là chỗ chặn thật). Mỗi lần bấm Lưu / tích Hiện / Xoá là đúng một lần
 * ghi một nơi trực, để nhật ký ra đúng một dòng mỗi thao tác. Vì vậy thứ tự
 * là ô số chứ không có nút lên / xuống: đổi chỗ hai nơi là hai lần ghi.
 *
 * Đang xem danh sách hay form của nơi nào nằm trên URL (`item=<id>` /
 * `item=new`, AppLayout đọc rồi truyền vào) để copy link là mở đúng chỗ đó;
 * chữ gõ dở trong form vẫn là state cục bộ.
 */
export function LocationManagerModal({
  item,
  onItemChange,
  onClose,
}: {
  /** `null` = danh sách, `'new'` = form tạo, còn lại là id nơi trực đang sửa. */
  item: string | null
  onItemChange: (item: string | null) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const {
    locations,
    locationsAvailable,
    createLocation,
    updateLocation,
    deleteLocation,
  } = useSchedule()
  const notify = useNotify()
  const [rawDraft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState<UUID | null>(null)
  const [toggling, setToggling] = useState<UUID | null>(null)
  /** `item` mà `rawDraft` được dựng cho — URL đổi sang mục khác thì dựng lại. */
  const [draftFor, setDraftFor] = useState<string | null>(null)
  if (item !== draftFor) {
    if (item === null) {
      setDraftFor(null)
      setDraft(null)
    } else if (item === 'new') {
      setDraftFor(item)
      setConfirmingDelete(null)
      setDraft(emptyDraft(locations))
    } else {
      const source = locations.find((l) => l.id === item)
      // Chưa thấy id (danh sách còn đang tải): chờ. Id lạ hẳn thì AppLayout
      // bỏ khỏi URL khi đã tải xong.
      if (source) {
        setDraftFor(item)
        setConfirmingDelete(null)
        setDraft(toDraft(source))
      }
    }
  }
  const draft = item !== null && draftFor === item ? rawDraft : null

  const takenNames = useMemo(
    () =>
      new Set(
        locations
          .filter((l) => l.id !== draft?.id)
          .map((l) => l.name.trim().toLowerCase()),
      ),
    [locations, draft?.id],
  )

  const name = draft?.name.trim() ?? ''
  const nameError = !draft
    ? null
    : name === ''
      ? t('loc.errNameRequired')
      : name.length > NAME_MAX
        ? t('loc.errNameTooLong', { max: NAME_MAX })
        : takenNames.has(name.toLowerCase())
          ? t('loc.errNameTaken')
          : null
  const shortName = draft?.shortName.trim() ?? ''
  const order = draft ? parseOrder(draft.order) : null
  const orderError = draft !== null && order === null
  const canSave = draft !== null && !nameError && !orderError && !saving

  async function handleSave() {
    if (!draft || !canSave || order === null) return
    setSaving(true)
    const payload: LocationInput = {
      name,
      short_name: shortName || null,
      color: draft.color,
      sort_order: order,
      is_active: draft.is_active,
    }
    const params = { name }
    try {
      if (draft.id) {
        const before = locations.find((l) => l.id === draft.id)
        await updateLocation(draft.id, payload)
        // Chỉ đổi ẩn / hiện thì báo như ô tích ở danh sách (cùng action
        // `location.toggled` trong nhật ký).
        const onlyToggled =
          before !== undefined &&
          before.name === payload.name &&
          (before.short_name ?? null) === payload.short_name &&
          before.color === payload.color &&
          before.sort_order === payload.sort_order &&
          before.is_active !== payload.is_active
        notify.success(
          onlyToggled
            ? payload.is_active
              ? 'notif.loc.shown'
              : 'notif.loc.hidden'
            : 'notif.loc.saved',
          params,
        )
      } else {
        await createLocation(payload)
        notify.success('notif.loc.created', params)
      }
      onItemChange(null)
    } catch (err) {
      notify.error('notif.loc.saveFailed', err, params)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(location: Location, is_active: boolean) {
    const params = { name: location.name }
    setToggling(location.id)
    try {
      await updateLocation(location.id, { ...toInput(location), is_active })
      notify.success(is_active ? 'notif.loc.shown' : 'notif.loc.hidden', params)
    } catch (err) {
      notify.error('notif.loc.saveFailed', err, params)
    } finally {
      setToggling(null)
    }
  }

  async function handleDelete(location: Location) {
    const params = { name: location.name }
    setSaving(true)
    try {
      await deleteLocation(location.id)
      notify.success('notif.loc.deleted', params)
      setConfirmingDelete(null)
    } catch (err) {
      // Nơi đang có trong một lượt thì máy chủ từ chối (kể cả admin): báo
      // qua thông báo, giữ hộp xác nhận để người dùng thấy gợi ý "hãy ẩn".
      notify.error('notif.loc.deleteFailed', err, params)
    } finally {
      setSaving(false)
    }
  }

  const footerButton =
    'min-h-11 rounded-md px-3 py-1.5 text-sm font-medium transition sm:min-h-0'

  /** Bản xem trước nhãn: đúng component dùng ở mọi màn hình. */
  const preview: Location | null = draft
    ? {
        id: draft.id ?? 'preview',
        name: name || t('loc.namePlaceholder'),
        short_name: shortName || null,
        color: draft.color,
        sort_order: order ?? 0,
        is_active: draft.is_active,
        created_by: null,
        created_at: '',
        updated_at: '',
      }
    : null

  return (
    <Modal
      title={draft ? (draft.id ? t('loc.edit') : t('loc.add')) : t('loc.manage')}
      subtitle={t('loc.sectionHint')}
      onClose={onClose}
      width="max-w-xl"
      footer={
        draft ? (
          <>
            <button
              type="button"
              className={`${footerButton} text-slate-700 hover:bg-slate-200`}
              onClick={() => onItemChange(null)}
              disabled={saving}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className={`${footerButton} bg-indigo-600 font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={handleSave}
              disabled={!canSave}
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </>
        ) : (
          <>
            {locationsAvailable && (
              <button
                type="button"
                className={`${footerButton} mr-auto inline-flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 text-slate-700 shadow-xs hover:bg-slate-50`}
                onClick={() => onItemChange('new')}
              >
                <Plus className="h-4 w-4" />
                {t('loc.add')}
              </button>
            )}
            <button
              type="button"
              className={`${footerButton} text-slate-700 hover:bg-slate-200`}
              onClick={onClose}
            >
              {t('common.close')}
            </button>
          </>
        )
      }
    >
      {!locationsAvailable ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200 select-text">
          {t('loc.notInstalled')}
        </p>
      ) : draft ? (
        // ---- form tạo / sửa ----
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="loc-name">
              {t('loc.name')}
            </label>
            <input
              id="loc-name"
              className={inputClass}
              value={draft.name}
              maxLength={NAME_MAX + 10}
              placeholder={t('loc.namePlaceholder')}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
              }}
            />
            {nameError && (
              <p className="mt-1 text-xs text-rose-600">{nameError}</p>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="loc-short">
              {t('loc.shortName')}{' '}
              <span className="font-normal text-slate-400">
                {t('common.optional')}
              </span>
            </label>
            <input
              id="loc-short"
              className={`${inputClass} sm:max-w-40`}
              value={draft.shortName}
              maxLength={SHORT_MAX}
              placeholder={preview ? locationShortName({ ...preview, short_name: null }) : ''}
              onChange={(e) => setDraft({ ...draft, shortName: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
              }}
            />
            <p className="mt-1 text-xs text-slate-500">{t('loc.shortNameHint')}</p>
          </div>

          <div>
            <span className={labelClass}>{t('loc.color')}</span>
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, color: null })}
                aria-label={t('loc.noColor')}
                aria-pressed={draft.color === null}
                data-tooltip={t('loc.noColor')}
                className="flex h-11 w-11 items-center justify-center sm:h-8 sm:w-8"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-400 transition ${
                    draft.color === null
                      ? 'ring-2 ring-slate-900 ring-offset-2'
                      : 'hover:scale-110'
                  }`}
                >
                  <Ban className="h-4 w-4" />
                </span>
              </button>
              {SHIFT_COLOR_KEYS.map((key) => {
                const selected = draft.color === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraft({ ...draft, color: key })}
                    aria-label={key}
                    aria-pressed={selected}
                    data-tooltip={key}
                    className="flex h-11 w-11 items-center justify-center sm:h-8 sm:w-8"
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                        colorByKey(key).dot
                      } ${
                        selected
                          ? 'ring-2 ring-slate-900 ring-offset-2'
                          : 'hover:scale-110'
                      }`}
                    >
                      {selected && <Check className="h-4 w-4 text-white" />}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <LocationChip location={preview} />
              <LocationChip location={preview} variant="short" size="xs" />
              <LocationChip location={preview} variant="dot" />
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('loc.colorHint')}</p>
          </div>

          <div>
            <label className={labelClass} htmlFor="loc-order">
              {t('loc.order')}
            </label>
            <input
              id="loc-order"
              type="number"
              inputMode="numeric"
              step={1}
              className={`${inputClass} sm:max-w-32`}
              value={draft.order}
              onChange={(e) => setDraft({ ...draft, order: e.target.value })}
            />
            {orderError ? (
              <p className="mt-1 text-xs text-rose-600">{t('loc.errOrder')}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">{t('loc.orderHint')}</p>
            )}
          </div>

          <div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700 sm:min-h-0">
              <Checkbox
                className="h-4 w-4"
                checked={draft.is_active}
                onChange={(is_active) => setDraft({ ...draft, is_active })}
              />
              {t('loc.active')}
            </label>
            <p className="mt-1 text-xs text-slate-500">{t('loc.activeHint')}</p>
          </div>
        </div>
      ) : locations.length === 0 ? (
        // ---- chưa có nơi nào ----
        <button
          type="button"
          onClick={() => onItemChange('new')}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 px-4 py-10 text-sm text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-700"
        >
          <MapPinPlus className="h-5 w-5" />
          <span className="font-medium">{t('loc.empty')}</span>
          <span className="max-w-sm text-center text-xs">
            {t('loc.emptyHint')}
          </span>
        </button>
      ) : (
        // ---- danh sách ----
        <div className="space-y-3">
          <ul className="space-y-2">
            {locations.map((location) => {
              const isConfirming = confirmingDelete === location.id
              const busy = toggling === location.id
              return (
                <li
                  key={location.id}
                  className={`rounded-lg border border-slate-200 p-2 pl-3 sm:p-3 ${
                    location.is_active ? '' : 'bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={`flex min-w-0 items-center gap-2 ${
                        location.is_active ? '' : 'opacity-60'
                      }`}
                    >
                      <LocationChip location={location} />
                      <span
                        className="text-xs text-slate-400 tabular-nums"
                        data-tooltip={t('loc.order')}
                      >
                        #{location.sort_order}
                      </span>
                      {!location.is_active && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                          {t('loc.hidden')}
                        </span>
                      )}
                    </span>

                    <div className="ml-auto flex items-center gap-1">
                      <label
                        className="flex min-h-11 items-center gap-2 rounded-md px-2 text-xs text-slate-600 sm:min-h-0 sm:py-1"
                        data-tooltip={t('loc.activeHint')}
                      >
                        <Checkbox
                          className="h-4 w-4"
                          checked={location.is_active}
                          disabled={busy || saving}
                          onChange={(value) => void handleToggle(location, value)}
                        />
                        {t('loc.active')}
                      </label>
                      <button
                        type="button"
                        onClick={() => onItemChange(location.id)}
                        aria-label={t('common.edit')}
                        data-tooltip={t('common.edit')}
                        className={`${iconButton} hover:bg-slate-100 hover:text-slate-700`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(location.id)}
                        aria-label={t('common.delete')}
                        data-tooltip={t('common.delete')}
                        className={`${iconButton} hover:bg-rose-50 hover:text-rose-600`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {isConfirming && (
                    <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 ring-1 ring-rose-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-rose-800">
                          {t('loc.deleteConfirm', { name: location.name })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(null)}
                          disabled={saving}
                          className="ml-auto min-h-11 rounded-md px-2 py-1 text-sm font-medium text-slate-700 transition hover:bg-white sm:min-h-0"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(location)}
                          disabled={saving}
                          className="min-h-11 rounded-md bg-rose-600 px-2 py-1 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60 sm:min-h-0"
                        >
                          {saving ? t('common.deleting') : t('common.delete')}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-rose-700">{t('loc.inUseHint')}</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {!confirmingDelete && (
            <p className="text-xs text-slate-500">{t('loc.inUseHint')}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
