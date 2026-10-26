import type { Account } from '../types'
import { MOCK_PROFILES } from '../data/mockData'
import { OFFLINE_ERROR_MESSAGE, isOnline } from '../lib/network'
import { CURRENT_PASSWORD_WRONG, type AuthBackend } from './backend'

const SESSION_KEY = 'scheduler.mock.session'
const PASSWORD_KEY = 'scheduler.mock.passwords'

/** The password every seeded account starts with. */
export const MOCK_PASSWORD = 'password'

const listeners = new Set<(user: Account | null) => void>()

function readSession(): Account | null {
  try {
    const id = localStorage.getItem(SESSION_KEY)
    return MOCK_PROFILES.find((p) => p.id === id) ?? null
  } catch {
    return null
  }
}

/**
 * Người đang đăng nhập ở chế độ mock — bản sao của `auth.uid()` phía server,
 * để mock backend ghi được người thực hiện vào nhật ký thao tác.
 */
export function currentMockProfile(): Account | null {
  return readSession()
}

/** Passwords changed during this demo, keyed by profile id. */
function readPasswords(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PASSWORD_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function passwordFor(profileId: string): string {
  return readPasswords()[profileId] ?? MOCK_PASSWORD
}

export const mockAuth: AuthBackend = {
  async getSession() {
    // Small delay so the loading state is exercised the same way it will be
    // against Supabase.
    await new Promise((r) => setTimeout(r, 150))
    return readSession()
  },

  async signIn(email: string, password: string) {
    await new Promise((r) => setTimeout(r, 300))
    // Giống bản Supabase: đăng nhập cần máy chủ.
    if (!isOnline()) return OFFLINE_ERROR_MESSAGE
    const profile = MOCK_PROFILES.find(
      (p) => p.email.toLowerCase() === email.trim().toLowerCase(),
    )
    if (!profile || password !== passwordFor(profile.id)) {
      return 'Invalid email or password.'
    }
    localStorage.setItem(SESSION_KEY, profile.id)
    listeners.forEach((fn) => fn(profile))
    return null
  },

  async signOut() {
    localStorage.removeItem(SESSION_KEY)
    listeners.forEach((fn) => fn(null))
  },

  async changePassword(currentPassword: string, newPassword: string) {
    await new Promise((r) => setTimeout(r, 300))
    if (!isOnline()) return OFFLINE_ERROR_MESSAGE
    const profile = readSession()
    if (!profile) return 'Not signed in.'
    if (currentPassword !== passwordFor(profile.id)) {
      return CURRENT_PASSWORD_WRONG
    }
    const passwords = readPasswords()
    passwords[profile.id] = newPassword
    try {
      localStorage.setItem(PASSWORD_KEY, JSON.stringify(passwords))
    } catch {
      return 'Could not save the new password.'
    }
    return null
  },

  onAuthChange(callback) {
    listeners.add(callback)
    return () => listeners.delete(callback)
  },
}
