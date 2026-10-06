import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { CURRENT_PASSWORD_WRONG } from '../auth/backend'
import { useI18n } from '../i18n/I18nContext'
import { useNotify } from '../notifications/NotificationContext'
import { Modal } from './Modal'

/** Supabase's default minimum. A stricter project policy is enforced server-side. */
const MIN_LENGTH = 6

const inputClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { user, changePassword } = useAuth()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reveal, setReveal] = useState(false)
  const [saving, setSaving] = useState(false)
  const notify = useNotify()

  // Only surface a rule once the field has been touched, so the form doesn't
  // open covered in red.
  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== next
  const sameAsOld = next.length > 0 && next === current

  const canSubmit =
    !saving &&
    current.length > 0 &&
    next.length >= MIN_LENGTH &&
    confirm === next &&
    next !== current

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)

    const message = await changePassword(current, next)
    if (message) {
      // Giữ form để nhập lại, nhất là khi sai mật khẩu hiện tại.
      notify.error(
        'notif.pwd.failed',
        message === CURRENT_PASSWORD_WRONG ? t('pwd.errCurrent') : message,
      )
      setSaving(false)
      return
    }

    notify.success('notif.pwd.changed', undefined, t('pwd.success'))
    onClose()
  }

  return (
    <Modal
      title={t('pwd.title')}
      subtitle={t('pwd.subtitle', { email: user?.email ?? '' })}
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            onClick={onClose}
            disabled={saving}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="change-password-form"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit}
          >
            {saving ? t('pwd.saving') : t('pwd.submit')}
          </button>
        </>
      }
    >
      {/* Kết quả (thành công hay lỗi từ máy chủ) báo qua thông báo; trong form
          chỉ còn lỗi nhập liệu của từng ô. */}
      <form
        id="change-password-form"
        onSubmit={handleSubmit}
        className="space-y-3"
      >
        <div>
          <label className={labelClass} htmlFor="pwd-current">
            {t('pwd.current')}
          </label>
          <input
            id="pwd-current"
            type={reveal ? 'text' : 'password'}
            autoComplete="current-password"
            className={inputClass}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="pwd-new">
            {t('pwd.new')}
          </label>
          <input
            id="pwd-new"
            type={reveal ? 'text' : 'password'}
            autoComplete="new-password"
            className={inputClass}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          {tooShort && (
            <p className="mt-1 text-xs text-rose-600">
              {t('pwd.errTooShort', { min: MIN_LENGTH })}
            </p>
          )}
          {!tooShort && sameAsOld && (
            <p className="mt-1 text-xs text-rose-600">{t('pwd.errSame')}</p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="pwd-confirm">
            {t('pwd.confirm')}
          </label>
          <input
            id="pwd-confirm"
            type={reveal ? 'text' : 'password'}
            autoComplete="new-password"
            className={inputClass}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && (
            <p className="mt-1 text-xs text-rose-600">
              {t('pwd.errMismatch')}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900"
        >
          {reveal ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {reveal ? t('pwd.hide') : t('pwd.show')}
        </button>

        <p className="text-xs text-slate-500">{t('pwd.hint')}</p>
      </form>
    </Modal>
  )
}
