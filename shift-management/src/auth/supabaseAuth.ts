import { isAuthRetryableFetchError, type User } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { getSupabase } from '../lib/supabaseClient'
import { OFFLINE_ERROR_MESSAGE, delay, isOnline } from '../lib/network'
import { CURRENT_PASSWORD_WRONG, type AuthBackend } from './backend'

/**
 * Hồ sơ của người đăng nhập gần nhất, để mở app khi mất mạng.
 *
 * supabase-js giữ phiên trong localStorage, nhưng token truy cập hết hạn
 * sau một giờ; offline thì nó không làm mới được, `getSession()` thử lại
 * ~30 giây rồi trả về null — tức là bị đá ra trang đăng nhập dù phiên vẫn
 * còn. Bản sao này cho app vào thẳng chế độ chỉ xem; có mạng lại thì
 * supabase-js tự làm mới token. Đăng xuất (hay máy chủ thu hồi phiên) là xoá.
 */
const PROFILE_KEY = 'scheduler.offlineProfile'

/** Chờ máy chủ xác nhận phiên tới ngần này rồi dùng bản sao. */
const SESSION_WAIT_MS = 4000

function readCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

function writeCachedProfile(profile: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    // Đầy hoặc bị chặn: chỉ mất khả năng mở app khi offline.
  }
}

function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY)
  } catch {
    // Không có gì để xoá.
  }
}

/**
 * Reads the caller's row from `profiles`. The `handle_new_user` trigger
 * creates it, but if that ever hasn't run we still return a usable profile
 * derived from the auth user rather than bouncing them back to login.
 */
async function loadProfile(user: User): Promise<Profile> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('profiles')
    // `*`: cột `role` chỉ có sau migration 005.
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (data) {
    const profile: Profile = {
      ...(data as Profile),
      role: data.role ?? null,
      displayed: data.displayed ?? null,
    }
    writeCachedProfile(profile)
    return profile
  }

  // Không đọc được (mất mạng giữa chừng): giữ hồ sơ lần trước, nhất là
  // `role` — hồ sơ dựng tạm dưới đây có role null, luật điểm danh phía
  // client sẽ tắt hết.
  const cached = readCachedProfile()
  if (error && cached?.id === user.id) return cached

  const email = user.email ?? ''
  return {
    id: user.id,
    email,
    display_name: email.split('@')[0] || 'Unknown',
    role: null,
    displayed: null,
    created_at: user.created_at,
  }
}

export const supabaseAuth: AuthBackend = {
  async getSession() {
    const cached = readCachedProfile()
    if (cached && !isOnline()) return cached

    const supabase = getSupabase()
    const fromServer = (async () => {
      const { data, error } = await supabase.auth.getSession()
      if (data.session) return loadProfile(data.session.user)
      // Không làm mới được token vì lỗi mạng: phiên chưa chắc đã hết.
      if (error && isAuthRetryableFetchError(error) && cached) return cached
      return null
    })()
    if (!cached) return fromServer
    // Mạng chập chờn: không bắt người dùng chờ supabase-js thử lại.
    return Promise.race([
      fromServer,
      delay(SESSION_WAIT_MS).then(() => cached),
    ])
  },

  async signIn(email: string, password: string) {
    if (!isOnline()) return OFFLINE_ERROR_MESSAGE
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (!error) return null

    // Supabase's wording for a bad login is vague; everything else passes
    // through so real problems (rate limits, unconfirmed email) stay visible.
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      return 'Invalid email or password.'
    }
    return error.message
  },

  async signOut() {
    clearCachedProfile()
    const supabase = getSupabase()
    // Offline thì chỉ xoá phiên trên máy (máy chủ không gọi được). Token hết
    // hạn thì supabase-js còn thử làm mới trước khi xoá — không bắt màn hình
    // chờ, nó tự xong ở nền.
    const done = supabase.auth.signOut(isOnline() ? undefined : { scope: 'local' })
    await Promise.race([done, delay(3000)])
  },

  async changePassword(currentPassword: string, newPassword: string) {
    if (!isOnline()) return OFFLINE_ERROR_MESSAGE
    const supabase = getSupabase()

    const { data, error: sessionError } = await supabase.auth.getSession()
    const email = data.session?.user.email
    if (sessionError || !email) return 'You are not signed in.'

    // Supabase's updateUser does not check the old password, so re-sign-in
    // proves the person at the keyboard is the account holder and not
    // someone who walked up to an unlocked screen.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (verifyError) return CURRENT_PASSWORD_WRONG

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })
    // Password-policy failures (length, strength) come back here — pass the
    // server's own wording through so the rule is visible.
    if (updateError) return updateError.message

    return null
  },

  onAuthChange(callback) {
    const supabase = getSupabase()
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Phiên lúc mở app do getSession() quyết. Offline mà token đã hết hạn
      // thì sự kiện này đến với session null — nghe theo là bị đá ra trang
      // đăng nhập dù getSession() đã cho vào bằng hồ sơ lưu trên máy.
      if (event === 'INITIAL_SESSION') return
      // Supabase warns against awaiting other client calls inside this
      // callback — defer the profile lookup out of the auth lock.
      setTimeout(() => {
        if (!session) {
          // SIGNED_OUT: tự đăng xuất, tab khác đăng xuất, hay máy chủ từ
          // chối refresh token. Lỗi mạng thì supabase-js không bắn sự kiện này.
          clearCachedProfile()
          callback(null)
          return
        }
        void loadProfile(session.user).then(callback)
      }, 0)
    })
    return () => data.subscription.unsubscribe()
  },
}
