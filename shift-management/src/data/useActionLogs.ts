import { useCallback, useEffect, useState } from 'react'
import type { ActionLogPage, ActionLogQuery } from '../types'
import { backend } from './index'

interface UseActionLogsResult {
  page: ActionLogPage | null
  /** False khi migration 003 chưa chạy — tính năng tắt thay vì báo lỗi. */
  available: boolean
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Đọc một trang nhật ký thao tác qua tầng backend trừu tượng.
 *
 * Nhật ký cố ý không nằm trong ScheduleContext: nó phân trang và chỉ trang
 * Nhật ký cần, còn context thì tải toàn bộ dữ liệu cho mọi trang.
 *
 * `query` phải được useMemo ở phía gọi, nếu không mỗi lần render sẽ là một
 * object mới và effect chạy lại vô hạn.
 */
export function useActionLogs(query: ActionLogQuery): UseActionLogsResult {
  const [page, setPage] = useState<ActionLogPage | null>(null)
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)

    backend
      .listActionLogs(query)
      .then((result) => {
        if (!active) return
        setAvailable(result !== null)
        setPage(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(
          err instanceof Error ? err.message : 'Không tải được nhật ký thao tác.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [query, reloadToken])

  const reload = useCallback(() => setReloadToken((t) => t + 1), [])

  return { page, available, loading, error, reload }
}
