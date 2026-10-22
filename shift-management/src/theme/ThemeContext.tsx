import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

// Trùng với script chống nháy trong index.html — đổi một chỗ phải đổi cả hai.
const STORAGE_KEY = 'scheduler.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
/**
 * Màu thanh tiêu đề / thanh trạng thái khi cài như app: trùng nền header
 * (`bg-white`, bản tối là `--color-white` trong index.css). Script chống
 * nháy trong index.html lặp lại hai màu này.
 */
const THEME_COLOR = { light: '#ffffff', dark: '#1f1f1f' } as const
/**
 * Điện thoại / máy tính bảng: icon thanh trạng thái theo giao diện máy, nên
 * thanh cũng phải theo máy. iPadOS báo mình là Mac; phân biệt bằng màn cảm ứng
 * (giống `detectIos` trong pwa/install.ts). Script trong index.html lặp lại.
 */
const STATUS_BAR_FOLLOWS_DEVICE =
  /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)

interface ThemeContextValue {
  pref: ThemePref
  setPref: (pref: ThemePref) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredPref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage unavailable — follow the device.
  }
  return 'system'
}

function applyTheme(pref: ThemePref) {
  const dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia(DARK_QUERY).matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // index.html có hai thẻ theme-color theo `media` sáng / tối của máy. Theo
  // máy: trả mỗi thẻ về màu của nó, trình duyệt tự chọn — không đổi màu bằng
  // JS, vì app đã cài trên Android có thể bỏ qua màu đổi sau khi tải trang
  // mà icon thanh trạng thái vẫn theo giao diện máy (thanh trắng, icon trắng).
  // Vì icon theo máy nên trên Android / iOS thanh luôn theo máy, kể cả khi
  // chọn hẳn Sáng / Tối. Máy tính: chọn hẳn thì cả hai thẻ một màu cho thanh
  // tiêu đề cửa sổ khớp header (chữ trên đó trình duyệt tự chọn cho tương phản).
  const followDevice = pref === 'system' || STATUS_BAR_FOLLOWS_DEVICE
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const forDark = followDevice
      ? (meta.getAttribute('media')?.includes('dark') ?? dark)
      : dark
    const color = forDark ? THEME_COLOR.dark : THEME_COLOR.light
    if (meta.getAttribute('content') !== color) meta.setAttribute('content', color)
  })
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readStoredPref)

  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [pref])

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next)
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference just won't survive a reload.
    }
  }, [])

  const value = useMemo(() => ({ pref, setPref }), [pref, setPref])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
