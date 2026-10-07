import { useCallback, useEffect, useState } from 'react'

/**
 * Bấm hai lần mới làm — cho thao tác lỡ tay là mất việc (đăng xuất). Lần đầu
 * chỉ "lên cò" (`armed`), lần thứ hai trong `timeoutMs` mới chạy `action`.
 * Để quá giờ thì tự hạ cò, không kẹt ở trạng thái chờ xác nhận.
 */
export function useTwoStep(action: () => void, timeoutMs = 4000) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), timeoutMs)
    return () => window.clearTimeout(id)
  }, [armed, timeoutMs])

  const press = useCallback(() => {
    if (armed) {
      setArmed(false)
      action()
    } else {
      setArmed(true)
    }
  }, [armed, action])

  const reset = useCallback(() => setArmed(false), [])

  return { armed, press, reset }
}
