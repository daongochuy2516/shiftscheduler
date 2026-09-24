import { useMemo, useState } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { CalendarPlus, Check, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ShiftTemplate, TemplateInput, UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { useSchedule } from '../data/ScheduleContext'
import {
  colorByKey,
  SHIFT_COLOR_KEYS,
  templateColor,
  templateColorKey,
  type ShiftColorKey,
} from '../lib/colors'
import { formatRange, isInvalidRange } from '../lib/time'
import { Modal } from './Modal'

const inputClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

interface Draft extends TemplateInput {
  id?: UUID
  color: ShiftColorKey
}

function emptyDraft(templates: ShiftTemplate[]): Draft {
  const used = new Set(templates.map(templateColorKey))
  return {
    title: '',
    start_time: '09:00',
    end_time: '17:00',
    note: null,
    weekdays: [],
    is_active: true,
    color: SHIFT_COLOR_KEYS.find((key) => !used.has(key)) ?? SHIFT_COLOR_KEYS[0],
  }
}

export function TemplateManagerModal({ onClose }: { onClose: () => void }) {
  const { t, dateLocale } = useI18n()
  const { templates, createTemplate, updateTemplate, deleteTemplate } =
    useSchedule()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<UUID | null>(null)

  /** Weekday chips in Monday-first order, carrying JS getDay() values. */
  const weekdayOptions = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i)
      return {
        value: day.getDay(),
        label: format(day, 'EEEEEE', { locale: dateLocale }),
      }
    })
  }, [dateLocale])

  function weekdayLabel(weekdays: number[]): string {
    if (weekdays.length === 0) return t('tpl.everyDay')
    return weekdayOptions
      .filter((o) => weekdays.includes(o.value))
      .map((o) => o.label)
      .join(', ')
  }

  function toggleWeekday(value: number) {
    if (!draft) return
    const has = draft.weekdays.includes(value)
    setDraft({
      ...draft,
      weekdays: has
        ? draft.weekdays.filter((d) => d !== value)
        : [...draft.weekdays, value].sort((a, b) => a - b),
    })
  }

  const titleError = draft && draft.title.trim() === ''
  const rangeError =
    draft && isInvalidRange(draft.start_time, draft.end_time)
  const canSave = draft !== null && !titleError && !rangeError && !saving

  async function handleSave() {
    if (!draft || !canSave) return
    setSaving(true)
    setError(null)
    const payload: TemplateInput = {
      title: draft.title.trim(),
      start_time: draft.start_time,
      end_time: draft.end_time,
      note: draft.note?.trim() ? draft.note.trim() : null,
      weekdays: draft.weekdays,
      is_active: draft.is_active,
      color: draft.color,
    }
    try {
      if (draft.id) await updateTemplate(draft.id, payload)
      else await createTemplate(payload)
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tpl.errSave'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: UUID) {
    setSaving(true)
    setError(null)
    try {
      await deleteTemplate(id)
      setConfirmingDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tpl.errSave'))
    } finally {
      setSaving(false)
    }
  }

  function toDraft(template: ShiftTemplate): Draft {
    return {
      id: template.id,
      title: template.title,
      start_time: template.start_time,
      end_time: template.end_time,
      note: template.note,
      weekdays: template.weekdays,
      is_active: template.is_active,
      color: templateColorKey(template),
    }
  }

  return (
    <Modal
      title={t('tpl.manage')}
      subtitle={t('tpl.sectionHint')}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        draft ? (
          <>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              onClick={() => setDraft(null)}
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
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="mr-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50"
              onClick={() => setDraft(emptyDraft(templates))}
            >
              <Plus className="h-4 w-4" />
              {t('tpl.new')}
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              onClick={onClose}
            >
              {t('common.close')}
            </button>
          </>
        )
      }
    >
      {error && (
        <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {draft ? (
        // ---- edit / create form ----
        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="tpl-title">
              {t('common.title')}
            </label>
            <input
              id="tpl-title"
              className={inputClass}
              value={draft.title}
              placeholder={t('tpl.titlePlaceholder')}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            {titleError && (
              <p className="mt-1 text-xs text-rose-600">
                {t('shift.errTitleRequired')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="tpl-start">
                {t('common.starts')}
              </label>
              <input
                id="tpl-start"
                type="time"
                className={inputClass}
                value={draft.start_time}
                onChange={(e) =>
                  setDraft({ ...draft, start_time: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="tpl-end">
                {t('common.ends')}
              </label>
              <input
                id="tpl-end"
                type="time"
                className={inputClass}
                value={draft.end_time}
                onChange={(e) =>
                  setDraft({ ...draft, end_time: e.target.value })
                }
              />
            </div>
          </div>
          {rangeError && (
            <p className="text-xs text-rose-600">{t('shift.errShiftRange')}</p>
          )}

          <div>
            <span className={labelClass}>{t('tpl.repeatOn')}</span>
            <div className="flex flex-wrap gap-1.5">
              {weekdayOptions.map((option) => {
                const active = draft.weekdays.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleWeekday(option.value)}
                    className={`min-w-11 rounded-md border px-2 py-1 text-xs font-medium capitalize transition ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {draft.weekdays.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">{t('tpl.everyDay')}</p>
            )}
          </div>

          <div>
            <span className={labelClass}>{t('tpl.color')}</span>
            <div className="flex flex-wrap items-center gap-2">
              {SHIFT_COLOR_KEYS.map((key) => {
                const selected = draft.color === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraft({ ...draft, color: key })}
                    aria-label={key}
                    aria-pressed={selected}
                    title={key}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                      colorByKey(key).dot
                    } ${
                      selected
                        ? 'ring-2 ring-slate-900 ring-offset-2'
                        : 'hover:scale-110'
                    }`}
                  >
                    {selected && <Check className="h-4 w-4 text-white" />}
                  </button>
                )
              })}
            </div>
            <div
              className={`mt-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm ${
                colorByKey(draft.color).block
              }`}
            >
              <span className="font-medium">
                {draft.title.trim() || t('tpl.titlePlaceholder')}
              </span>
              <span className="opacity-70">
                {formatRange(draft.start_time, draft.end_time)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('tpl.colorHint')}</p>
          </div>

          <div>
            <label className={labelClass} htmlFor="tpl-note">
              {t('common.note')}{' '}
              <span className="font-normal text-slate-400">
                {t('common.optional')}
              </span>
            </label>
            <textarea
              id="tpl-note"
              rows={2}
              className={inputClass}
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={draft.is_active}
              onChange={(e) =>
                setDraft({ ...draft, is_active: e.target.checked })
              }
            />
            {t('tpl.active')}
          </label>
          {!draft.is_active && (
            <p className="text-xs text-slate-500">{t('tpl.inactiveHint')}</p>
          )}
        </div>
      ) : templates.length === 0 ? (
        // ---- empty state ----
        <button
          type="button"
          onClick={() => setDraft(emptyDraft(templates))}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 px-4 py-10 text-sm text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-700"
        >
          <CalendarPlus className="h-5 w-5" />
          <span className="font-medium">{t('tpl.empty')}</span>
          <span className="max-w-sm text-center text-xs">
            {t('tpl.emptyHint')}
          </span>
        </button>
      ) : (
        // ---- list ----
        <ul className="space-y-2">
          {templates.map((template) => {
            const color = templateColor(template)
            const isConfirming = confirmingDelete === template.id
            return (
              <li
                key={template.id}
                className={`rounded-lg border border-slate-200 p-3 ${
                  template.is_active ? '' : 'bg-slate-50 opacity-70'
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
                  <span className="font-medium text-slate-900">
                    {template.title}
                  </span>
                  <span className="text-sm text-slate-500">
                    {formatRange(template.start_time, template.end_time)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 capitalize">
                    {weekdayLabel(template.weekdays)}
                  </span>
                  {!template.is_active && (
                    <span className="text-xs text-slate-500">
                      ({t('tpl.active')}: —)
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDraft(toDraft(template))}
                      aria-label={t('common.edit')}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(template.id)}
                      aria-label={t('common.delete')}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {template.note && (
                  <p className="mt-1 text-sm text-slate-500">{template.note}</p>
                )}

                {isConfirming && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-rose-50 px-3 py-2 ring-1 ring-rose-200">
                    <span className="text-sm text-rose-800">
                      {t('tpl.deleteConfirm')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      disabled={saving}
                      className="ml-auto rounded-md px-2 py-1 text-sm font-medium text-slate-700 transition hover:bg-white"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id)}
                      disabled={saving}
                      className="rounded-md bg-rose-600 px-2 py-1 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
                    >
                      {saving ? t('common.deleting') : t('common.delete')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
