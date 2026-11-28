import type { Account, ProfileInput, UUID } from '../types'
import { MOCK_PROFILES } from './mockData'

/**
 * Tài khoản của chế độ dữ liệu mẫu: hằng số MOCK_PROFILES ghép với phần admin
 * đã sửa ở trang Tài khoản. Dùng chung cho đăng nhập mock (phiên phải thấy
 * ngày nghỉ admin vừa đặt — bản thật đọc lại qua my_profile()) và mock
 * backend, nên tách khỏi bộ nhớ của mockBackend để hai bên không import vòng.
 */
const EDITS_KEY = 'scheduler.mock.profileEdits'

function readEdits(): Record<UUID, ProfileInput> {
  try {
    const raw = localStorage.getItem(EDITS_KEY)
    return raw ? (JSON.parse(raw) as Record<UUID, ProfileInput>) : {}
  } catch {
    return {}
  }
}

export function mockAccounts(): Account[] {
  const edits = readEdits()
  return MOCK_PROFILES.map((p) => ({ ...p, ...edits[p.id] })).sort((a, b) =>
    a.display_name.localeCompare(b.display_name),
  )
}

export function findMockAccount(id: UUID | null): Account | null {
  if (!id) return null
  const base = MOCK_PROFILES.find((p) => p.id === id)
  return base ? { ...base, ...readEdits()[id] } : null
}

export function saveMockProfileEdit(id: UUID, input: ProfileInput) {
  const edits = readEdits()
  edits[id] = { ...edits[id], ...input }
  try {
    localStorage.setItem(EDITS_KEY, JSON.stringify(edits))
  } catch {
    // Đầy hoặc bị chặn: bản demo mất phần sửa, không vỡ gì.
  }
}

export function resetMockAccounts() {
  try {
    localStorage.removeItem(EDITS_KEY)
  } catch {
    // Không có gì để xoá.
  }
}
