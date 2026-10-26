import { useCallback, useEffect, useState } from 'react'
import type { Account, UUID } from '../types'
import { ForbiddenError } from './backend'
import { backend } from './index'

interface UseAccountsResult {
  /** Chưa có câu trả lời đầu tiên của máy chủ cho người này. */
  loading: boolean
  /** `null` khi migration 011 chưa chạy (hoặc chưa tải xong / bị từ chối). */
  accounts: Account[] | null
  /** Máy chủ từ chối: người gọi không phải admin. */
  forbidden: boolean
  error: string | null
  /** Tải lại sau khi sửa — danh sách cũ vẫn hiện trong lúc chờ. */
  reload: () => void
}

/**
 * Danh sách tài khoản cho trang Tài khoản. Máy chủ quyết định có trả hay
 * không (`list_accounts()` của 011); giao diện không tự xét vai trò.
 *
 * Kết quả gắn với `userId` đã hỏi: đổi người thì coi như đang tải lại, khỏi
 * phải đặt lại state ngay trong effect.
 */
export function useAccounts(userId: UUID | null): UseAccountsResult {
  const [token, setToken] = useState(0)
  const [result, setResult] = useState<{
    userId: UUID
    accounts: Account[] | null
    forbidden: boolean
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    backend.listAccounts().then(
      (accounts) => {
        if (active) setResult({ userId, accounts, forbidden: false, error: null })
      },
      (err: unknown) => {
        if (!active) return
        const forbidden = err instanceof ForbiddenError
        setResult({
          userId,
          accounts: null,
          forbidden,
          error: forbidden ? null : err instanceof Error ? err.message : String(err),
        })
      },
    )
    return () => {
      active = false
    }
  }, [userId, token])

  const reload = useCallback(() => setToken((t) => t + 1), [])
  const current = result && result.userId === userId ? result : null
  return {
    loading: current === null,
    accounts: current?.accounts ?? null,
    forbidden: current?.forbidden ?? false,
    error: current?.error ?? null,
    reload,
  }
}
