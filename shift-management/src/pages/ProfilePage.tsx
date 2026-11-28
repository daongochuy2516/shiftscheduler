import { useEffect, type ReactNode } from 'react'
import { IdCard } from 'lucide-react'
import type { Account } from '../types'
import { useAuth } from '../auth/AuthContext'
import { useI18n, type TranslateParams } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { NEW_HIRE_DAYS, hasLeft, tenure, todayKey, type Tenure } from '../lib/employment'
import { formatDateText } from '../lib/dateText'
import { Avatar } from '../components/Avatar'
import { RoleBadge } from '../components/RoleBadge'

/**
 * Hồ sơ của chính mình: họ tên, email, ngày vào công ty, đang làm hay đã
 * nghỉ. Chỉ đọc — admin sửa ở trang Tài khoản.
 *
 * Chỉ dựa vào phiên đăng nhập (my_profile() của 011/016), không dùng
 * ScheduleContext: người đã nghỉ cũng vào được trang này, mà với họ app không
 * tải dữ liệu lịch (database trả rỗng hết).
 */
export function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const { t } = useI18n()

  // Mở trang là lúc người ta muốn thấy số mới nhất (admin vừa sửa ngày vào).
  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  if (!user) return null

  const today = todayKey()
  const left = hasLeft(user, today)
  // dd/MM/yyyy như ô chọn ngày ở trang Tài khoản, ở cả hai ngôn ngữ.
  const longDate = formatDateText

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-medium text-slate-900">
          <IdCard className="h-5 w-5 shrink-0 text-slate-400" />
          {t('nav.profile')}
        </h1>
        <p className="text-sm text-slate-500">{t('profile.subtitle')}</p>
      </div>

      {left && (
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200">
          <p className="font-medium text-slate-900">{t('profile.leftTitle')}</p>
          <p className="mt-0.5 text-slate-600">
            {t('profile.leftHint')}
          </p>
        </div>
      )}

      <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
          <span className={left ? 'opacity-60' : ''}>
            <Avatar name={user.display_name} seed={user.id} />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium text-slate-900">
              <span className="truncate select-text">{user.display_name}</span>
              <RoleBadge role={user.role} />
            </p>
            <p className="truncate text-sm text-slate-500 select-text">
              {user.email}
            </p>
          </div>
        </div>

        <dl className="divide-y divide-slate-100">
          <Row label={t('profile.name')}>
            <span className="select-text">{user.display_name}</span>
          </Row>
          <Row label={t('profile.email')}>
            <span className="break-all select-text">{user.email}</span>
          </Row>
          <Row label={t('profile.joined')}>
            <Joined user={user} today={today} longDate={longDate} />
          </Row>
          <Row label={t('profile.status')}>
            <Status user={user} today={today} longDate={longDate} />
          </Row>
        </dl>
      </section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-sm text-slate-500 sm:w-44 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-900">{children}</dd>
    </div>
  )
}

function Joined({
  user,
  today,
  longDate,
}: {
  user: Account
  today: string
  longDate: (key: string) => string
}) {
  const { t } = useI18n()
  if (!user.joined_on) {
    return <span className="text-slate-400">{t('profile.unset')}</span>
  }
  const left = hasLeft(user, today)
  // Đã nghỉ thì tính tới ngày nghỉ, không phải tới hôm nay.
  const span = tenure(user.joined_on, left && user.left_on ? user.left_on : today)
  const isNew = !left && span !== null && span.days < NEW_HIRE_DAYS

  let detail: string
  if (span === null) detail = t('profile.notStarted')
  else if (span.days === 0 && !left) detail = t('profile.firstDay')
  else {
    const duration = formatTenure(span, t)
    detail = left
      ? t('profile.worked', { duration })
      : t('profile.soFar', { duration })
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="select-text">{longDate(user.joined_on)}</span>
      {isNew && (
        <span className="rounded px-1.5 py-0.5 text-[11px] leading-none font-medium text-indigo-700 ring-1 ring-indigo-200 ring-inset">
          {t('profile.newHire')}
        </span>
      )}
      <span className="text-slate-500">· {detail}</span>
    </span>
  )
}

function Status({
  user,
  today,
  longDate,
}: {
  user: Account
  today: string
  longDate: (key: string) => string
}) {
  const { t } = useI18n()
  const left = hasLeft(user, today)
  const leaving = !left && !!user.left_on
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${
          left ? 'bg-slate-400' : leaving ? 'bg-amber-500' : 'bg-emerald-500'
        }`}
      />
      {left && user.left_on
        ? t('profile.left', { date: longDate(user.left_on) })
        : leaving && user.left_on
          ? t('profile.leaving', { date: longDate(user.left_on) })
          : t('profile.active')}
    </span>
  )
}

/** "1 năm 3 tháng" / "2 tháng" / "12 ngày" — bỏ phần bằng 0. */
function formatTenure(
  span: Tenure,
  t: (key: TranslationKey, params?: TranslateParams) => string,
): string {
  if (span.years === 0 && span.months === 0) {
    return t('profile.days', { count: span.days })
  }
  const parts: string[] = []
  if (span.years > 0) parts.push(t('profile.years', { count: span.years }))
  if (span.months > 0) parts.push(t('profile.months', { count: span.months }))
  return parts.join(' ')
}
