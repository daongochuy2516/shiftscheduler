import type { User } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { getSupabase } from '../lib/supabaseClient'
import { CURRENT_PASSWORD_WRONG, type AuthBackend } from './backend'

/**
 * Reads the caller's row from `profiles`. The `handle_new_user` trigger
 * creates it, but if that ever hasn't run we still return a usable profile
 * derived from the auth user rather than bouncing them back to login.
 */
async function loadProfile(user: User): Promise<Profile> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('profiles')
    .select('id, email, display_name, created_at')
    .eq('id', user.id)
    .maybeSingle()

  if (data) return data as Profile

  const email = user.email ?? ''
  return {
    id: user.id,
    email,
    display_name: email.split('@')[0] || 'Unknown',
    created_at: user.created_at,
  }
}

export const supabaseAuth: AuthBackend = {
  async getSession() {
    const supabase = getSupabase()
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) return null
    return loadProfile(data.session.user)
  },

  async signIn(email: string, password: string) {
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
    const supabase = getSupabase()
    await supabase.auth.signOut()
  },

  async changePassword(currentPassword: string, newPassword: string) {
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
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase warns against awaiting other client calls inside this
      // callback — defer the profile lookup out of the auth lock.
      setTimeout(() => {
        if (!session) {
          callback(null)
          return
        }
        void loadProfile(session.user).then(callback)
      }, 0)
    })
    return () => data.subscription.unsubscribe()
  },
}
