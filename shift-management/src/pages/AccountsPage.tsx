import { useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, ShieldAlert, UserCog } from 'lucide-react'
import type { Account, ProfileInput } from '../types'
import type { TranslationKey } from '../i18n/translations'
import { useAuth } from '../auth/AuthContext'
import { useSchedule } from '../data/ScheduleContext'
import { useAccounts } from '../data/useAccounts'
import { useI18n } from '../i18n/I18nContext'
import { useNotify } from '../notifications/NotificationContext'
import { isListed } from '../lib/profiles'
import { hasLeft, todayKey } from '../lib/employment'
import { formatDateText } from '../lib/dateText'
import { Avatar } from '../components/Avatar'
import { DateInput } from '../components/DateInput'
import { PageSkeleton } from '../components/PageSkeleton'
import { RoleBadge } from '../components/RoleBadge'
import { LoadError } from '../components/LoadError'

const inputClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'

/**
 * Trang Tài khoản — chỉ admin. Sửa tên hiển thị, việc hiện / ẩn một người
 * trên các bảng xếp ca, và ngày vào / ngày nghỉ (016) — cho toàn hệ thống.
 *
 * Người không phải admin không thấy link. Dữ liệu trang này (email, vai trò)
 * chỉ đến từ list_accounts() (011): máy chủ kiểm tra admin rồi mới trả, không
 * phải thì từ chối và trang báo không có quyền — vào thẳng URL hay bật
 * `bypassuirestrict` cũng vậy. Danh bạ chung không có email / vai trò. Chặn
 * sửa thật nằm ở database (007_accounts.sql).
 */
export function AccountsPage() {
  const { user } = useAuth()
  const { accountsAvailable } = useSchedule()
  const { t } = useI18n()
  const { loading, accounts, forbidden, error, reload } = useAccounts(
    user?.id ?? null,
  )

  if (!user) return <Navigate to="/" replace />
  if (loading) return <PageSkeleton />
  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl bg-white px-4 py-10 text-center shadow-sm ring-1 ring-slate-900/5">
        <ShieldAlert className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-3 font-medium text-slate-900">
          {t('accounts.forbidden')}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {t('accounts.forbiddenHint')}
        </p>
      </div>
    )
  }

  const header = (
    <div>
      <h1 className="flex items-center gap-2 text-lg font-medium text-slate-900">
        <UserCog className="h-5 w-5 shrink-0 text-slate-400" />
        {t('accounts.title')}
      </h1>
      <p className="text-sm text-slate-500">{t('accounts.subtitle')}</p>
    </div>
  )

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        <LoadError message={error} />
      </div>
    )
  }

  // Chưa chạy 011: chưa có list_accounts() để máy chủ kiểm tra quyền, nên
  // không hiện gì thay vì đọc thẳng bảng như trước.
  if (!accounts) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200">
          <p className="font-medium text-amber-900">
            {t('accounts.privateNotInstalled')}
          </p>
          <p className="mt-0.5 text-amber-800">
            {t('accounts.privateNotInstalledHint')}
          </p>
        </div>
      </div>
    )
  }

  const hiddenCount = accounts.filter((p) => !isListed(p)).length
  const today = todayKey()
  const leftCount = accounts.filter((p) => hasLeft(p, today)).length
  // 016 chưa chạy thì list_accounts() không có hai cột này: không hiện ô,
  // không gửi lên (PGRST204).
  const employmentAvailable =
    accounts.length === 0 || accounts[0].joined_on !== undefined

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {header}

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

      {accountsAvailable && !employmentAvailable && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200">
          <p className="font-medium text-amber-900">
            {t('accounts.employmentNotInstalled')}
          </p>
          <p className="mt-0.5 text-amber-800">
            {t('accounts.employmentNotInstalledHint')}
          </p>
        </div>
      )}

      <p className="text-sm text-slate-500">
        {t('accounts.count', { count: accounts.length })}
        {hiddenCount > 0 &&
          ` · ${t('accounts.hiddenCount', { count: hiddenCount })}`}
        {leftCount > 0 &&
          ` · ${t('accounts.leftCount', { count: leftCount })}`}
      </p>
      {/* Nói một lần ở đây thay vì lặp dưới mỗi hàng. */}
      {employmentAvailable && (
        <p className="-mt-2 text-xs text-slate-400">{t('accounts.leftOnHint')}</p>
      )}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
        {accounts.map((profile) => (
          <AccountRow
            // key theo cả tên: lưu xong thì bản nháp lấy lại giá trị mới.
            key={`${profile.id}:${profile.display_name}`}
            profile={profile}
            isMe={profile.id === user.id}
            disabled={!accountsAvailable}
            employment={employmentAvailable}
            onSaved={reload}
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
  employment,
  onSaved,
}: {
  profile: Account
  isMe: boolean
  disabled: boolean
  /** 016 đã chạy: có ô ngày vào / ngày nghỉ và gửi hai cột đó lên. */
  employment: boolean
  /** Danh sách này không nằm trong ScheduleContext: lưu xong phải tự tải lại. */
  onSaved: () => void
}) {
  const { updateProfile } = useSchedule()
  const { t } = useI18n()
  const notify = useNotify()
  const [name, setName] = useState(profile.display_name)
  const [joined, setJoined] = useState(profile.joined_on ?? '')
  // Ngày nghỉ chỉ đặt ở Supabase (016): trang này chỉ hiện.
  const left = profile.left_on ?? ''
  const [pending, setPending] = useState(0)
  const listed = isListed(profile)
  const nameError = name.trim() === ''
  const hasLeftNow = hasLeft({ left_on: left || null })

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
    // Chỉ có khoá khi 016 đã chạy — vắng khoá là không gửi cột.
    ...(employment ? { joined_on: profile.joined_on ?? null } : {}),
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
        onSaved()
      } catch (err) {
        notify.error('notif.account.saveFailed', err, params)
        latest.current = before
        setName(before.display_name)
        setJoined(before.joined_on ?? '')
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
            <span className="truncate select-text">{profile.email}</span>
            <RoleBadge role={profile.role} />
            {hasLeftNow ? (
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] leading-none font-medium text-slate-600 ring-1 ring-slate-200 ring-inset">
                {t('accounts.leftBadge')}
              </span>
            ) : (
              left && (
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-none font-medium text-amber-700 ring-1 ring-amber-200 ring-inset">
                  {t('accounts.leavingBadge', { date: formatDateText(left) })}
                </span>
              )
            )}
            {isMe && (
              <span className="font-medium text-indigo-600">
                {t('common.you')}
              </span>
            )}
            {pending > 0 && (
              <span className="text-slate-400">{t('common.saving')}</span>
            )}
          </p>
          {employment && (
            // Ngày vào lưu ngay khi chọn xong một ngày, như công tắc hiện / ẩn.
            <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
              <div>
                <label
                  htmlFor={`joined-${profile.id}`}
                  className="mb-1 block text-xs text-slate-500"
                >
                  {t('accounts.joinedOn')}
                </label>
                <DateInput
                  id={`joined-${profile.id}`}
                  className={inputClass}
                  value={joined}
                  max={left || null}
                  disabled={disabled}
                  onChange={(date) => {
                    if (!date || date === latest.current.joined_on) return
                    setJoined(date)
                    save({ joined_on: date }, 'notif.account.joinedSet')
                  }}
                />
              </div>
              {/* Chỉ hiện: ngày nghỉ đặt trong Supabase, database từ chối mọi
                  thay đổi từ web (016), kể cả của admin. */}
              <div data-tooltip={t('accounts.leftOnReadonly')}>
                <span className="mb-1 block text-xs text-slate-500">
                  {t('accounts.leftOn')}
                </span>
                <span
                  className={`flex min-h-11 items-center rounded-md bg-slate-50 px-2.5 py-1.5 text-base ring-1 ring-slate-200 ring-inset sm:min-h-0 sm:text-sm ${
                    left ? 'text-slate-700 select-text' : 'text-slate-400'
                  }`}
                >
                  {left ? formatDateText(left) : t('accounts.leftOnNone')}
                </span>
              </div>
            </div>
          )}
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
