# Thinkmay Team Board

Ứng dụng xếp ca nội bộ: **một ca chứa nhiều lượt phân công**, mỗi nhân viên trong ca có khung giờ và trạng thái (`pending` / `confirmed`) riêng. SPA React, backend là Supabase (Postgres + Auth + Realtime), không có server riêng.

- Hướng dẫn sử dụng và trạng thái hiện tại: [shift-management/README.md](shift-management/README.md)
- Thiết kế phân quyền và luật điểm danh, kèm phần còn chưa làm: [shift-management/roadmap.md](shift-management/roadmap.md)

## Lệnh

Toàn bộ app nằm trong `shift-management/`. `package.json` ở gốc repo không phải app — mọi lệnh npm chạy trong `shift-management/`.

```bash
cd shift-management
npm ci
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build — đây là bước kiểm tra kiểu
npm run lint     # oxlint
```

- Không có test tự động. `build` + `lint` là toàn bộ kiểm tra bằng máy; phần còn lại phải chạy app (skill `verify`).
- `lint` hiện có sẵn 2 cảnh báo `set-state-in-effect` (`useActionLogs.ts`, `ScheduleContext.tsx`). Không thêm cảnh báo mới.
- Node 22 (`.nvmrc`). Deploy tĩnh trên Netlify; `public/_redirects` lo phần SPA.
- Stack: React 19, Vite 8, TypeScript 6 (`erasableSyntaxOnly`, `verbatimModuleSyntax` → dùng `import type`, không `enum`), Tailwind 4 (cấu hình trong `src/index.css`, không có `tailwind.config`), react-router 7, date-fns 4, lucide-react.

## Kiến trúc

```
ThemeProvider → I18nProvider → AuthProvider → BrowserRouter
  /login
  ProtectedRoute            chỉ mount phần dưới khi đã đăng nhập
   NotificationProvider     thông báo (localStorage theo user) + popup + ngăn thông báo
    ScheduleProvider        nhân viên + ca mẫu + bộ đệm ca + mọi thao tác ghi
      ShiftEditorProvider   form tạo/sửa ca dùng chung (openCreate / openEdit)
        AppLayout           header, BottomNav (mobile), nút nổi, sheet tài khoản
          / · /shifts · /summary · /my-shifts · /pending · /logs · /status · /accounts (admin)
```

| Thư mục | Vai trò |
| --- | --- |
| `src/types.ts` | Kiểu dữ liệu, khớp 1:1 với cột trong Supabase |
| `src/data/` | `backend.ts` (interface) · `supabaseBackend.ts` · `mockBackend.ts` · `shiftStore.ts` (bộ đệm) · `ScheduleContext.tsx` (hook) |
| `src/auth/` | Cùng kiểu: interface + bản Supabase + bản mock |
| `src/lib/` | Hàm thuần: `time.ts`, `colors.ts`, `summary.ts`, `shiftChunks.ts`, các probe của trang Trạng thái |
| `src/i18n/` | Từ điển `en` / `vi` và `t()` |
| `supabase/` | `schema.sql` rồi `002`…`008`, chạy tay theo thứ tự trong SQL Editor |

**Hai backend.** Có `VITE_SUPABASE_URL` + key trong `shift-management/.env` thì dùng Supabase, không thì dùng mock lưu `localStorage` (băng vàng "Đang chạy dữ liệu mẫu"). Chọn ở `src/data/index.ts` và `src/auth/index.ts`.

**Tải ca theo lát cắt.** Không có "tải tất cả ca". Mỗi màn hình xin đúng phần nó hiện qua `useShifts(query)` với `ShiftQuery` là `range` / `user` / `pending`; `useShiftChunks` ghép nhiều tháng cho cuộn vô hạn; `usePrefetchShifts` tải trước khoảng kề bên. Bộ đệm khoá theo chuỗi (`shiftQueryKey`), lát đang xem được làm tươi khi dữ liệu đổi, lát không ai xem bị bỏ.

## Luật không được phá

**Dữ liệu**

- Component không import `supabaseBackend` / `mockBackend` / `getSupabase`. Đọc qua hook, ghi qua `useSchedule()` — các hàm ghi ở đó tự `refresh()` sau khi lưu; gọi thẳng `backend.*` thì màn hình giữ số cũ.
- Thêm gì vào `SchedulerBackend` hay `AuthBackend` là phải viết ở **cả hai** bản. Bản mock phải hành xử giống bản thật, kể cả nhật ký (`pushLog`).
- Thêm một `kind` cho `ShiftQuery` thì sửa cả `shiftQueryKey`, `parseShiftQueryKey` và `listShifts` ở hai backend.
- Snapshot trả cho `useSyncExternalStore` phải giữ nguyên tham chiếu khi dữ liệu không đổi — trả object mới mỗi lần gọi là render vô hạn.
- Lọc ca theo người là **AND** và không được cắt danh sách người trong ca: bản Supabase nhúng `shift_assignments!inner` thêm lần nữa dưới tên `match_N` để lọc, còn `assignments` vẫn trả đủ.
- Migration 002–008 là tuỳ chọn: bảng chưa có thì `listTemplates` / `listActionLogs` trả `null` (`isMissingTable`) và giao diện hiện thông báo vàng, không được vỡ. Cột chưa có (`role`, `confirmed_at`, `color`, `displayed`) đọc về là `null`.
- `profiles` gồm cả người đang ẩn (`displayed = false`, ví dụ tài khoản quản lý). Danh sách để **chọn / lọc** nhân viên dùng `rosterProfiles`; bảng xếp ca lọc hàng bằng `showRow` trong `lib/profiles.ts` (người ẩn vẫn hiện nếu có ca). Tra tên theo id thì dùng `profilesById` như cũ.

**Ngày giờ**

- Giờ là chuỗi `HH:mm`, ngày là chuỗi `yyyy-MM-dd` theo **giờ máy**. Dùng `toDateKey` / `fromDateKey` trong `lib/time.ts`, không dùng `toISOString()` (lệch ngày vì UTC).
- Postgres trả `time` dạng `HH:mm:ss` — qua `normalizeTime` trước khi đưa cho UI.
- Ca phải nằm gọn trong một ngày (`end_time > start_time` là ràng buộc DB). Ca qua nửa đêm chưa hỗ trợ.

**Bảo mật và nhật ký**

- Mọi biến `VITE_` đều xuống trình duyệt: chỉ publishable/anon key, không bao giờ `service_role`.
- Quyền hiện tại là chủ ý: anon không có gì, mọi nhân viên đã đăng nhập tạo/sửa được mọi ca. Luật nào cần chặn thật thì đặt ở database (RLS, trigger, `check`, `now()` của máy chủ); giao diện chỉ phản ánh lại.
- Chấm công = xác nhận (`pending` → `confirmed`). Luật cho `staff` nằm trong trigger của `005_attendance.sql`, bản mới nhất của hai hàm trigger là ở `006_shift_rules.sql` (sửa luật thì viết migration mới ghi đè hàm, đừng sửa file đã chạy); `lib/attendance.ts` là bản sao phía client để khoá nút và để mock hành xử giống — sửa luật thì sửa cả ba nơi (SQL, `attendance.ts`, `mockBackend.ts`). `profiles.role` là `null` nghĩa là 005 chưa chạy: không áp luật nào. Ca mẫu chỉ admin tạo / sửa / xoá (trigger trong `008_template_admin.sql`, bản client là `canManageTemplates`); nhân viên chỉ nhận.
- `action_logs` chỉ do trigger `record_action_log` ghi. Không thêm đường ghi từ client, không thêm policy insert/update/delete.
- Một thao tác của người dùng = đúng một dòng nhật ký (nhận ca, xoá ca đều đã gộp). Giữ nguyên tắc này khi thêm thao tác mới.

**Giao diện**

- Mọi chuỗi người dùng thấy đều qua `t()` — trừ tên sản phẩm `APP_NAME` (`lib/brand.ts`, giống nhau mọi ngôn ngữ; `<title>` trong `index.html` lặp lại nó). Thêm khoá vào `en` trước (nguồn của `TranslationKey`), rồi `vi` — thiếu ở `vi` là lỗi biên dịch. Số nhiều: `foo_one` / `foo_other` + `t('foo', { count })`. Chèn giá trị: `{{name}}`.
- Chế độ tối làm bằng cách định nghĩa lại biến màu Tailwind dưới `[data-theme='dark']` trong `index.css`, **không** rải `dark:` trong component. Viết class sáng như bình thường. Họ màu đã có bản tối: slate, indigo, rose, amber, emerald, sky, violet, teal, orange, lime, fuchsia, cyan — dùng họ khác thì thêm khối biến tương ứng.
- Class Tailwind phải viết nguyên chuỗi, không ghép từ mảnh lúc chạy (`bg-${x}-50` sẽ không được sinh). Xem `PALETTE` trong `lib/colors.ts`.
- Mốc mobile/desktop là `sm` (640px). Dưới mốc: `BottomNav`, nút nổi, `Modal` thành bottom sheet, vùng chạm tối thiểu 44px. Từ mốc trở lên giao diện PC không được đổi theo khi sửa mobile.
- Từ 640px nội dung cuộn trong `#app-scroll`, không phải `window`. Cần gốc cuộn (IntersectionObserver, `scrollTo`) thì dùng `scrollRoot()`.
- Hộp thoại dùng `components/Modal.tsx`; mở form ca bằng `useShiftEditor()`; màu ca lấy từ `useShiftColor()`.
- Hiệu ứng mở / đóng của `Modal` và ngăn thông báo nằm trong `index.css` (`modal-backdrop`, `modal-panel`, `drawer-panel`, `.is-leaving`). Đóng không cần chờ ở chỗ gọi: `useExitAnimation` để lại một bản sao tĩnh chạy hiệu ứng rồi xoá. Lớp phủ tự làm thì dùng lại hook này thay vì tự giữ state "đang đóng".
- Kết quả của thao tác ghi (thành công, hay lỗi máy chủ trả về) báo qua `useNotify()` — `success(key, params, body)` / `error(key, err, params)` — không thêm dòng xanh/đỏ trong form. Lỗi giữ form mở, thành công thì đóng. Tiêu đề lưu dạng khoá `t()` (`notif.*`), `body` là chuỗi thô nên đừng đưa chữ phụ thuộc ngôn ngữ vào đó. Lỗi nhập liệu từng ô vẫn hiện tại chỗ.
- Khoá `localStorage` của theme (`scheduler.theme`) lặp lại trong script chống nháy ở `index.html` — đổi một chỗ phải đổi cả hai.

## Quy ước

- Chú thích giải thích **vì sao**, tiếng Việt hoặc tiếng Anh theo file đang sửa.
- Thay đổi hành vi người dùng thấy thì cập nhật `README.md` cùng lúc (nó là hướng dẫn sử dụng). README hiện chưa có trang Tổng kết, Trạng thái và chế độ tối.
- Migration SQL chỉ người dùng chạy được (Supabase Dashboard → SQL Editor). Viết file xong phải nói rõ cần chạy file nào.

## Skill của dự án

| Skill | Dùng khi |
| --- | --- |
| `data-feature` | Thêm/sửa cột, bảng, truy vấn, hay thao tác ghi — đi đủ từ SQL tới UI |
| `ui-change` | Thêm/sửa màn hình, component, chuỗi hiển thị, màu, bố cục mobile |
| `verify` | Trước khi báo xong: build, lint, chạy app ở chế độ dữ liệu mẫu |
