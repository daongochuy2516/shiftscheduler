import { useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, UserCog } from 'lucide-react'
import type { Profile, ProfileInput } from '../types'
import type { TranslationKey } from '../i18n/translations'
import { useAuth } from '../auth/AuthContext'
import { useSchedule } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import { useNotify } from '../notifications/NotificationContext'
import { isListed } from '../lib/profiles'
import { Avatar } from '../components/Avatar'
import { PageSkeleton } from '../components/PageSkeleton'
import { RoleBadge } from '../components/RoleBadge'

const inputClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'

/**
 * Trang Tài khoản — chỉ admin. Sửa tên hiển thị và việc hiện / ẩn một người
 * trên các bảng xếp ca, cho toàn hệ thống.
 *
 * Người không phải admin không thấy link, vào thẳng URL thì bị đưa về trang
 * chính. Chặn thật nằm ở database (007_accounts.sql); ở đây chỉ là lối vào.
 */
export function AccountsPage() {
  const { user } = useAuth()
  const { profiles, loading, error, accountsAvailable } = useSchedule()
  const { t } = useI18n()

  if (user?.role !== 'admin') return <Navigate to="/" replace />
  if (loading) return <PageSkeleton />

  const hiddenCount = profiles.filter((p) => !isListed(p)).length

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <UserCog className="h-5 w-5 shrink-0 text-slate-400" />
          {t('accounts.title')}
        </h1>
        <p className="text-sm text-slate-500">{t('accounts.subtitle')}</p>
      </div>

      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {!accountsAvailable && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200">
          <p className="font-medium text-amber-900">
            {t('accounts.notInstalled')}
          </p>
          <p className="mt-0.5 text-amber-800">
            {t('accounts.notInstalledHint')}
          </p>
        </div>
      )}

      <p className="text-sm text-slate-500">
        {t('accounts.count', { count: profiles.length })}
        {hiddenCount > 0 &&
          ` · ${t('accounts.hiddenCount', { count: hiddenCount })}`}
      </p>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
        {profiles.map((profile) => (
          <AccountRow
            // key theo cả tên: lưu xong thì bản nháp lấy lại giá trị mới.
            key={`${profile.id}:${profile.display_name}`}
            profile={profile}
            isMe={profile.id === user.id}
            disabled={!accountsAvailable}
          />
        ))}
      </ul>
    </div>
  )
}

function AccountRow({
  profile,
  isMe,
  disabled,
}: {
  profile: Profile
  isMe: boolean
  disabled: boolean
}) {
  const { updateProfile } = useSchedule()
  const { t } = useI18n()
  const notify = useNotify()
  const [name, setName] = useState(profile.display_name)
  const [pending, setPending] = useState(0)
  const listed = isListed(profile)
  const nameError = name.trim() === ''

  /**
   * Không có nút Lưu: tên lưu khi rời ô (hoặc Enter), công tắc lưu ngay.
   *
   * Các lần lưu chạy lần lượt, và mỗi lần gửi đủ cả hai giá trị mới nhất.
   * Gõ tên rồi bấm ngay công tắc sẽ sinh hai lần lưu gần như cùng lúc — chạy
   * song song thì lần đến sau có thể ghi đè tên mới bằng tên cũ, hay ngược lại.
   */
  const queue = useRef<Promise<void>>(Promise.resolve())
  const latest = useRef<ProfileInput>({
    display_name: profile.display_name,
    displayed: listed,
  })

  function save(patch: Partial<ProfileInput>, title: TranslationKey) {
    const before = latest.current
    const input = { ...before, ...patch }
    latest.current = input
    setPending((n) => n + 1)
    const params = { name: input.display_name }
    queue.current = queue.current.then(async () => {
      try {
        await updateProfile(profile.id, input)
        notify.success(title, params, profile.email)
      } catch (err) {
        notify.error('notif.account.saveFailed', err, params)
        latest.current = before
        setName(before.display_name)
      } finally {
        setPending((n) => n - 1)
      }
    })
  }

  function commitName() {
    const trimmed = name.trim()
    // Để trống thì trả lại tên cũ thay vì lưu: tên không được rỗng.
    if (trimmed === '') {
      setName(latest.current.display_name)
      return
    }
    if (trimmed !== name) setName(trimmed)
    if (trimmed === latest.current.display_name) return
    save({ display_name: trimmed }, 'notif.account.renamed')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    commitName()
  }

  return (
    <li
      className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center ${
        listed ? '' : 'bg-slate-50'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={listed ? '' : 'opacity-50'}>
          <Avatar name={profile.display_name} seed={profile.id} size="sm" />
        </span>
        <form onSubmit={handleSubmit} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              aria-label={t('accounts.displayName')}
              className={inputClass}
              value={name}
              disabled={disabled}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                // Esc: bỏ phần đang gõ, trả lại tên đã lưu.
                if (e.key === 'Escape') setName(latest.current.display_name)
              }}
            />
          </div>
          {nameError && (
            <p className="mt-1 text-xs text-rose-600">
              {t('accounts.errNameRequired')}
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span className="truncate">{profile.email}</span>
            <RoleBadge role={profile.role} />
            {isMe && (
              <span className="font-medium text-indigo-600">
                {t('common.you')}
              </span>
            )}
            {pending > 0 && (
              <span className="text-slate-400">{t('common.saving')}</span>
            )}
          </p>
        </form>
      </div>

      {/* Hiện / ẩn lưu ngay: một nút, một thay đổi, không cần bấm Lưu. */}
      <button
        type="button"
        role="switch"
        aria-checked={listed}
        onClick={() => {
          const next = !latest.current.displayed
          save(
            { displayed: next },
            next ? 'notif.account.shown' : 'notif.account.hidden',
          )
        }}
        disabled={disabled}
        // Bề rộng cố định: "Đang hiện" / "Đang ẩn" dài khác nhau, không cố định
        // thì ô tên các dòng lệch nhau.
        className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-md px-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-40 sm:self-center sm:py-1.5 whitespace-nowrap"
      >
        <span
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
            listed ? 'bg-indigo-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-slate-900/10 transition-transform ${
              listed ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </span>
        {listed ? (
          <Eye className="h-4 w-4 text-slate-400" />
        ) : (
          <EyeOff className="h-4 w-4 text-slate-400" />
        )}
        {listed ? t('accounts.shown') : t('accounts.hidden')}
      </button>
    </li>
  )
}
