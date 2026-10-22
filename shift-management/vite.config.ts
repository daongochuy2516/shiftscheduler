import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_NAME } from './src/lib/brand.ts'

/**
 * Bản tối cho màn chờ và thanh trạng thái khi máy đang ở giao diện tối
 * (Chrome Android đọc khối này; trình duyệt khác bỏ qua). Không có thì máy
 * tối vẫn ra thanh trắng với icon trắng. Khớp nền trang tối
 * (`[data-theme='dark'] body`) và header tối (`--color-white`). Kiểu
 * ManifestOptions của vite-plugin-pwa chưa có trường này nên để riêng rồi trải vào.
 */
const DARK_MANIFEST = {
  user_preferences: {
    color_scheme_dark: { background_color: '#181818', theme_color: '#1f1f1f' },
  },
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Mốc build, hiện ở trang Trạng thái để biết máy đang chạy bản nào.
    __APP_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Có bản mới thì hỏi người dùng (UpdatePrompt) chứ không tự tải lại:
      // đang điền dở form mà trang tự nhảy là mất việc.
      registerType: 'prompt',
      // Tự đăng ký trong src/pwa/serviceWorker.ts để giữ trạng thái cho UI.
      injectRegister: false,
      manifest: {
        id: '/',
        name: APP_NAME,
        short_name: 'Team Board',
        description: 'Xếp ca và điểm danh nội bộ.',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Khớp nền trang (slate-100) và header (trắng) ở giao diện sáng.
        background_color: '#f1f5f9',
        theme_color: '#ffffff',
        ...DARK_MANIFEST,
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Giữ lâu biểu tượng app trên điện thoại / chuột phải ở taskbar.
        // Manifest là file tĩnh nên không đi qua t() — viết tiếng Việt.
        shortcuts: [
          { name: 'Lịch', url: '/' },
          { name: 'Ca của tôi', url: '/my-shifts' },
          { name: 'Chờ xác nhận', url: '/pending' },
        ],
      },
      workbox: {
        // Toàn bộ vỏ ứng dụng: mất mạng vẫn mở được app. Dữ liệu ca không
        // nằm ở đây mà trong IndexedDB (src/data/offlineBackend.ts).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // SPA: mọi đường dẫn (/shifts, /my-shifts…) đều trả index.html.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
