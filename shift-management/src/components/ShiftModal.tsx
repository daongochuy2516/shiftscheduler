import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Plus, Trash2, UserPlus } from 'lucide-react'
import type {
  AssignmentInput,
  AssignmentStatus,
  ShiftInput,
  ShiftWithAssignments,
  UUID,
} from '../types'
import { useSchedule } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import {
  formatDuration,
  isInvalidRange,
  normalizeTime,
  toMinutes,
} from '../lib/time'
import { Avatar } from './Avatar'
import { Modal } from './Modal'

interface Row extends AssignmentInput {
  /** Local-only React key; new rows have no database id yet. */
  key: string
}

let rowCounter = 0
function nextKey() {
  rowCounter += 1
  return `row-${rowCounter}`
}

function toRows(shift: ShiftWithAssignments | null): Row[] {
  if (!shift) return []
  return shift.assignments
    .slice()
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
    .map((a) => ({
      key: a.id,
      id: a.id,
      user_id: a.user_id,
      start_time: normalizeTime(a.start_time),
      end_time: normalizeTime(a.end_time),
      status: a.status,
      note: a.note,
    }))
}

// min-h-11 = 44px cho ngón tay; text-base ngăn Safari iOS phóng to trang khi
// focus. Từ 640px trở lên trả về kích thước cũ của bản PC.
const inputClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'

const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

export function ShiftModal({
  shift,
  defaultDate,
  highlightAssignmentId,
  onClose,
}: {
  /** null = create mode */
  shift: ShiftWithAssignments | null
  /** yyyy-MM-dd used when creating */
  defaultDate: string
  highlightAssignmentId?: UUID | null
  onClose: () => void
}) {
  const { profiles, createShift, updateShift, deleteShift } = useSchedule()
  const { t } = useI18n()
  const isEdit = shift !== null

  const [form, setForm] = useState<ShiftInput>(() => ({
    title: shift?.title ?? '',
    date: shift?.date ?? defaultDate,
    start_time: normalizeTime(shift?.start_time ?? '09:00'),
    end_time: normalizeTime(shift?.end_time ?? '17:00'),
    note: shift?.note ?? null,
  }))
  const [rows, setRows] = useState<Row[]>(() => toRows(shift))
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  const usedUserIds = useMemo(
    () => new Set(rows.map((r) => r.user_id)),
    [rows],
  )
  const availableProfiles = useMemo(
    () => profiles.filter((p) => !usedUserIds.has(p.id)),
    [profiles, usedUserIds],
  )

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addRow() {
    const candidate = availableProfiles[0]
    if (!candidate) return
    setRows((prev) => [
      ...prev,
      {
        key: nextKey(),
        user_id: candidate.id,
        start_time: form.start_time,
        end_time: form.end_time,
        status: 'pending',
        note: null,
      },
    ])
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  // ---- validation -------------------------------------------------------
  const titleError =
    form.title.trim() === '' ? t('shift.errTitleRequired') : null
  const shiftRangeError = isInvalidRange(form.start_time, form.end_time)
    ? t('shift.errShiftRange')
    : null
  const rowErrors = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      if (isInvalidRange(row.start_time, row.end_time)) {
        map.set(row.key, t('shift.errRowRange'))
      }
    }
    return map
  }, [rows, t])

  /** Non-blocking: staff scheduled outside the shift's own window. */
  const rowWarnings = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      if (rowErrors.has(row.key)) continue
      if (
        toMinutes(row.start_time) < toMinutes(form.start_time) ||
        toMinutes(row.end_time) > toMinutes(form.end_time)
      ) {
        map.set(row.key, t('shift.warnOutside'))
      }
    }
    return map
  }, [rows, rowErrors, form.start_time, form.end_time, t])

  const canSave =
    !titleError && !shiftRangeError && rowErrors.size === 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setSubmitError(null)
    const payload: ShiftInput = {
      ...form,
      title: form.title.trim(),
      note: form.note?.trim() ? form.note.trim() : null,
    }
    const assignments: AssignmentInput[] = rows.map(({ key: _key, ...rest }) => ({
      ...rest,
      note: rest.note?.trim() ? rest.note.trim() : null,
    }))
    try {
      if (isEdit) {
        await updateShift(shift.id, payload, assignments)
      } else {
        await createShift(payload, assignments)
      }
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('shift.errSave'))
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!shift) return
    setSaving(true)
    setSubmitError(null)
    try {
      await deleteShift(shift.id)
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('shift.errDelete'))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? t('shift.edit') : t('shift.new')}
      subtitle={
        isEdit
          ? t('shift.assignedCount', { count: rows.length })
          : t('shift.createSubtitle')
      }
      onClose={onClose}
      footer={
        confirmingDelete ? (
          <>
            <span className="mr-auto text-sm text-slate-600">
              {t('shift.deleteConfirm')}
            </span>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              onClick={() => setConfirmingDelete(false)}
              disabled={saving}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-rose-500 disabled:opacity-60"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? t('common.deleting') : t('shift.deleteAction')}
            </button>
          </>
        ) : (
          <>
            {isEdit && (
              <button
                type="button"
                className="mr-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                <Trash2 className="h-4 w-4" />
                {t('common.delete')}
              </button>
            )}
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              onClick={onClose}
              disabled={saving}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleSave}
              disabled={!canSave}
            >
              {saving
                ? t('common.saving')
                : isEdit
                  ? t('shift.saveChanges')
                  : t('shift.create')}
            </button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {submitError && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
            {submitError}
          </p>
        )}

        {/* ---- Shift details ---- */}
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="shift-title">
              {t('common.title')}
            </label>
            <input
              id="shift-title"
              className={inputClass}
              value={form.title}
              placeholder={t('shift.titlePlaceholder')}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            {titleError && (
              <p className="mt-1 text-xs text-rose-600">{titleError}</p>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="shift-date">
              {t('common.date')}
            </label>
            <input
              id="shift-date"
              type="date"
              className={inputClass}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="shift-start">
                {t('common.starts')}
              </label>
              <input
                id="shift-start"
                type="time"
                className={inputClass}
                value={form.start_time}
                onChange={(e) =>
                  setForm({ ...form, start_time: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="shift-end">
                {t('common.ends')}
              </label>
              <input
                id="shift-end"
                type="time"
                className={inputClass}
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
          </div>

          {shiftRangeError && (
            <p className="text-xs text-rose-600 sm:col-span-2">
              {shiftRangeError}
            </p>
          )}

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="shift-note">
              {t('common.note')}{' '}
              <span className="font-normal text-slate-400">
                {t('common.optional')}
              </span>
            </label>
            <textarea
              id="shift-note"
              rows={2}
              className={inputClass}
              value={form.note ?? ''}
              placeholder={t('shift.notePlaceholder')}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </section>

        {/* ---- Roster ---- */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {t('shift.staffOnShift')}
            </h3>
            <button
              type="button"
              onClick={addRow}
              disabled={availableProfiles.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t('shift.addStaff')}
            </button>
          </div>

          {rows.length === 0 ? (
            <button
              type="button"
              onClick={addRow}
              disabled={availableProfiles.length === 0}
              className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-5 w-5" />
              {t('shift.noOneAssigned')}
            </button>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => {
                const error = rowErrors.get(row.key)
                const warning = rowWarnings.get(row.key)
                const profile = profiles.find((p) => p.id === row.user_id)
                const isHighlighted =
                  !!highlightAssignmentId && row.id === highlightAssignmentId
                return (
                  <li key={row.key}>
                    <div
                      ref={isHighlighted ? highlightRef : undefined}
                      className={`rounded-lg border bg-white p-3 transition ${
                        error
                          ? 'border-rose-300 bg-rose-50/40'
                          : isHighlighted
                            ? 'border-indigo-400 ring-2 ring-indigo-500/20'
                            : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[10rem] flex-1">
                          <label className={labelClass}>
                            {t('common.staff')}
                          </label>
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={profile?.display_name ?? '?'}
                              seed={row.user_id}
                              size="sm"
                            />
                            <select
                              className={inputClass}
                              value={row.user_id}
                              onChange={(e) =>
                                patchRow(row.key, { user_id: e.target.value })
                              }
                            >
                              {profiles.map((p) => (
                                <option
                                  key={p.id}
                                  value={p.id}
                                  disabled={
                                    p.id !== row.user_id && usedUserIds.has(p.id)
                                  }
                                >
                                  {p.display_name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="w-28">
                          <label className={labelClass}>
                            {t('common.from')}
                          </label>
                          <input
                            type="time"
                            className={inputClass}
                            value={row.start_time}
                            onChange={(e) =>
                              patchRow(row.key, { start_time: e.target.value })
                            }
                          />
                        </div>

                        <div className="w-28">
                          <label className={labelClass}>{t('common.to')}</label>
                          <input
                            type="time"
                            className={inputClass}
                            value={row.end_time}
                            onChange={(e) =>
                              patchRow(row.key, { end_time: e.target.value })
                            }
                          />
                        </div>

                        <div className="w-36">
                          <label className={labelClass}>
                            {t('common.status')}
                          </label>
                          <select
                            className={inputClass}
                            value={row.status}
                            onChange={(e) =>
                              patchRow(row.key, {
                                status: e.target.value as AssignmentStatus,
                              })
                            }
                          >
                            <option value="pending">{t('status.pending')}</option>
                            <option value="confirmed">
                              {t('status.confirmed')}
                            </option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          aria-label={t('shift.removeStaff', {
                            name: profile?.display_name ?? '',
                          })}
                          className="mb-0.5 flex h-11 w-11 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 sm:h-9 sm:w-9"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-2">
                        <input
                          className={inputClass}
                          value={row.note ?? ''}
                          placeholder={t('shift.personNotePlaceholder')}
                          onChange={(e) =>
                            patchRow(row.key, { note: e.target.value })
                          }
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {!error && (
                          <span className="text-slate-500">
                            {formatDuration(row.start_time, row.end_time)}
                          </span>
                        )}
                        {error && (
                          <span className="font-medium text-rose-600">
                            {error}
                          </span>
                        )}
                        {warning && (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            {warning}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {profiles.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              {t('shift.noStaffAccounts')}
            </p>
          ) : availableProfiles.length === 0 && rows.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              {t('shift.everyoneAssigned')}
            </p>
          ) : null}
        </section>
      </div>
    </Modal>
  )
}
