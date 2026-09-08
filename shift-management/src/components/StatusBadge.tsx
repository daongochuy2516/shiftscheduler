import { CheckCircle2, Clock3 } from 'lucide-react'
import type { AssignmentStatus } from '../types'
import { useI18n } from '../i18n/I18nContext'

const STYLES: Record<AssignmentStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: AssignmentStatus
  size?: 'sm' | 'md'
}) {
  const { t } = useI18n()
  const Icon = status === 'confirmed' ? CheckCircle2 : Clock3
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${STYLES[status]} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <Icon className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {status === 'confirmed' ? t('status.confirmed') : t('status.pending')}
    </span>
  )
}
