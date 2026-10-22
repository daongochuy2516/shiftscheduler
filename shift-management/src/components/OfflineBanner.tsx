import { format, isSameDay } from 'date-fns'
import { WifiOff } from 'lucide-react'
import { useNetworkStatus } from '../data/networkStatus'
import { useI18n } from '../i18n/I18nContext'

/**
 * Băng dưới header khi mất mạng, hoặc khi có mạng mà không tới được máy chủ
 * và màn hình đang hiện bản lưu trên máy. Nói rõ dữ liệu cũ tới đâu — người
 * dùng không được tưởng lịch đang thấy là lịch mới nhất.
 */
export function OfflineBanner() {
  const { online, staleSince } = useNetworkStatus()
  const { t } = useI18n()
  if (online && staleSince === null) return null

  const time =
    staleSince === null
      ? null
      : format(staleSince, isSameDay(staleSince, new Date()) ? 'HH:mm' : 'HH:mm dd/MM')
  const text = !online
    ? time
      ? t('offline.banner', { time })
      : t('offline.bannerNoData')
    : t('offline.stale', { time: time ?? '' })

  return (
    <p
      role="status"
      className="safe-x flex items-center justify-center gap-1.5 bg-amber-100 py-1 text-center text-[11px] font-medium text-amber-900"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      {text}
    </p>
  )
}
