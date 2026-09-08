import type { Profile } from '../types'

/**
 * Sentinel returned by `changePassword` when the current password is wrong.
 * The UI swaps it for a translated message; every other string comes back
 * from the server and is shown as-is.
 */
export const CURRENT_PASSWORD_WRONG = 'CURRENT_PASSWORD_WRONG'

export interface AuthBackend {
  /**
   * Resolves the currently signed-in user, or null. Called once on app load
   * to decide between the app and the login page.
   */
  getSession(): Promise<Profile | null>

  /** Returns an error message on failure, or null on success. */
  signIn(email: string, password: string): Promise<string | null>

  signOut(): Promise<void>

  /**
   * Changes the signed-in user's password after checking the current one.
   * Returns an error message on failure, or null on success.
   */
  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<string | null>

  /**
   * Fires whenever the session changes (sign in, sign out, token refresh,
   * or a sign-out in another tab). Returns an unsubscribe function.
   */
  onAuthChange(callback: (user: Profile | null) => void): () => void
}
