# Thinkmay Team Board

Ứng dụng xếp ca nội bộ cho nhân viên. React + Vite + TypeScript + Tailwind, backend là Supabase (Postgres + Auth + Realtime). Không có server riêng: trình duyệt nói chuyện thẳng với Supabase, các luật quan trọng nằm ở database.

Mô hình dữ liệu cốt lõi: **một ca chứa nhiều lượt phân công**, mỗi nhân viên trong ca có khung giờ và trạng thái (*chờ xác nhận* / *đã xác nhận*) riêng.

```
Ca: Trực trang, 08:00–18:00
├── Huy    08:00–12:00   đã xác nhận
├── Thiên  10:00–16:00   đã xác nhận
└── An     15:00–18:00   chờ xác nhận
```

Các trang: **Lịch**, **Tất cả ca**, **Tổng kết**, **Ca của tôi**, **Chờ xác nhận**, **Nhật ký**, **Trạng thái**, **Hướng dẫn**, và **Tài khoản** (chỉ admin).

Tài liệu liên quan: [roadmap.md](roadmap.md) (thiết kế phân quyền, luật điểm danh và phần còn chưa làm); trang **Hướng dẫn** trong ứng dụng là bản viết cho nhân viên, nội dung ở `src/help/content.ts`.

---

## Mục lục

- [1. Chạy dự án](#1-chạy-dự-án)
- [2. Đăng nhập và đăng xuất](#2-đăng-nhập-và-đăng-xuất)
- [3. Thanh điều hướng chung](#3-thanh-điều-hướng-chung)
- [4. Trang Lịch — ba chế độ xem](#4-trang-lịch--ba-chế-độ-xem)
- [5. Đọc timeline ngày](#5-đọc-timeline-ngày)
- [6. Tạo, sửa và xoá ca](#6-tạo-sửa-và-xoá-ca)
- [7. Ca mẫu và nhận ca nhanh](#7-ca-mẫu-và-nhận-ca-nhanh)
- [8. Ba trang lọc](#8-ba-trang-lọc)
- [8b. Chấm công và luật điểm danh](#8b-chấm-công-và-luật-điểm-danh)
- [8c. Trang Tổng kết](#8c-trang-tổng-kết)
- [9. Đa ngôn ngữ và cập nhật thời gian thực](#9-đa-ngôn-ngữ-và-cập-nhật-thời-gian-thực)
- [9b. Nhật ký thao tác](#9b-nhật-ký-thao-tác)
- [9c. Thông báo](#9c-thông-báo)
- [9d. Hướng dẫn và bài từng bước](#9d-hướng-dẫn-và-bài-từng-bước)
- [9e. Trang Trạng thái](#9e-trang-trạng-thái)
- [9f. Giao diện sáng / tối và chữ bôi đen](#9f-giao-diện-sáng--tối-và-chữ-bôi-đen)
- [9g. Cài ứng dụng và dùng khi mất mạng](#9g-cài-ứng-dụng-và-dùng-khi-mất-mạng)
- [10. Tra cứu nhanh](#10-tra-cứu-nhanh)
- [11. Dành cho quản trị viên](#11-dành-cho-quản-trị-viên)
- [12. Cấu trúc mã nguồn](#12-cấu-trúc-mã-nguồn)

---

## 1. Chạy dự án

Mọi lệnh chạy trong thư mục `shift-management/` (file `package.json` ở gốc repo không phải ứng dụng). Cần Node 22 (`.nvmrc`).

```bash
npm ci           # cài đúng phiên bản trong package-lock.json
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build: kiểm tra kiểu + build production
npm run lint     # oxlint
```

Không có test tự động: `build` và `lint` là toàn bộ phần máy kiểm tra, còn lại phải mở ứng dụng lên thử. `lint` hiện có sẵn 2 cảnh báo `set-state-in-effect` (`useActionLogs.ts`, `ScheduleContext.tsx`) — đã biết, không phải lỗi mới.

**Triển khai.** Ứng dụng là SPA tĩnh, đang deploy trên Netlify (`npm run build` ra thư mục `dist/`). `public/_redirects` đưa mọi đường dẫn về `index.html` để mở thẳng `/pending` hay `/shifts?...` không bị 404. `build` sinh thêm `sw.js` (service worker) và `manifest.webmanifest` cho phần cài ứng dụng / offline ([mục 9g](#9g-cài-ứng-dụng-và-dùng-khi-mất-mạng)). Đổi tên miền thì cập nhật **Site URL** và **Redirect URLs** của Supabase ([mục 11](#thiết-lập-auth-cần-thiết)).

### Biến môi trường

Tạo file `.env` trong thư mục `shift-management/` (xem mẫu ở `.env.example`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Dự án cũ dùng tên `VITE_SUPABASE_ANON_KEY` — ứng dụng chấp nhận cả hai tên.
Tuyệt đối **không** đặt `service_role` key vào đây: mọi biến `VITE_` đều được gửi xuống trình duyệt.

> Vite chỉ đọc `.env` lúc khởi động. Sửa xong phải khởi động lại `npm run dev`.

### SQL cần chạy trên Supabase

Chạy theo thứ tự trong **SQL Editor** của Supabase:

| File | Nội dung |
| --- | --- |
| `supabase/schema.sql` | 3 bảng `profiles` / `shifts` / `shift_assignments`, RLS, trigger tạo profile tự động, Realtime |
| `supabase/002_shift_templates.sql` | Bảng `shift_templates` + cột `shifts.template_id` cho tính năng ca mẫu |
| `supabase/003_action_logs.sql` | Bảng `action_logs` + trigger ghi nhật ký, quyền chỉ-đọc |
| `supabase/004_template_colors.sql` | Cột `shift_templates.color` — màu cho ca mẫu |
| `supabase/005_attendance.sql` | Chấm công: cột `profiles.role`, `shift_assignments.confirmed_at` và các trigger luật điểm danh ([mục 8b](#8b-chấm-công-và-luật-điểm-danh)) |
| `supabase/006_shift_rules.sql` | Nhân viên chỉ thao tác phần của mình: rời ca trong 30 phút, không thêm / sửa / gỡ người khác, không sửa / xoá ca có người khác ([mục 8b](#8b-chấm-công-và-luật-điểm-danh)). Cần 005 trước; thay luật "ca tạo quá 30 phút không xoá được" của 005 |
| `supabase/007_accounts.sql` | Trang Tài khoản: cột `profiles.displayed` (hiện / ẩn trên bảng), admin sửa được mọi tài khoản, người khác không sửa được ([mục 11](#trang-tài-khoản)). Cần 005 trước |
| `supabase/008_template_admin.sql` | Chỉ admin tạo / sửa / bật-tắt / xoá ca mẫu; nhân viên vẫn nhận ca mẫu bình thường ([mục 7](#quản-lý-ca-mẫu)). Cần 002 và 005 trước |
| `supabase/009_server_time.sql` | Hàm `server_now()` cho đồng hồ trên thanh trên chạy theo giờ máy chủ. Chưa chạy thì đồng hồ dùng giờ máy, có chấm vàng cạnh giờ. Không cần file nào trước |

Các file từ 002 trở đi là **tuỳ chọn** — chưa chạy thì ứng dụng **vẫn chạy bình thường**, chỉ thiếu tính năng tương ứng:

| Chưa chạy | Hệ quả |
| --- | --- |
| 002 | Thông báo vàng ở khu vực ca mẫu; lựa chọn *Nhận ca mẫu* mờ đi |
| 003 | Trang Nhật ký hiện thông báo vàng, không có dòng nào |
| 004 | Ca mẫu không có màu riêng (cột `color` đọc về là `null`) |
| 005 | Không có luật chấm công nào: ai cũng xác nhận được mọi ca như trước, vai trò không tồn tại |
| 007 | Trang Tài khoản hiện thông báo vàng và không sửa được gì; cột `displayed` chưa có nên không ai bị ẩn |
| 008 | Nhân viên vẫn tạo / sửa được ca mẫu như trước |
| 009 | Đồng hồ trên thanh trên dùng giờ máy, có chấm vàng cạnh giờ |

> Chạy 005 xong **mọi người đều là nhân viên thường**. Phong admin ngay sau đó (mục 7 trong file, hoặc [mục 11](#11-dành-cho-quản-trị-viên)), nếu không sẽ không còn ai sửa được lượt đã điểm danh.

### Chế độ dữ liệu mẫu

Không có `.env` thì ứng dụng tự chuyển sang dữ liệu mẫu trong `localStorage`, hiện dải băng vàng *"Đang chạy dữ liệu mẫu"*. Đăng nhập bằng bất kỳ email mẫu nào với mật khẩu `password`. Hữu ích khi muốn xem giao diện mà chưa có Supabase.

---

## 2. Đăng nhập và đăng xuất

Mở ứng dụng, nếu chưa đăng nhập bạn luôn bị chuyển về `/login`. Không có trang đăng ký — tài khoản do quản trị viên tạo (xem [mục 11](#11-dành-cho-quản-trị-viên)).

**Cách đăng nhập**

1. Nhập **Email** và **Mật khẩu** công ty cấp.
2. Bấm **Đăng nhập**.

Vài điểm cần biết:

- Nút **Tiếng Việt / English** nằm ngay trên form, đổi được trước cả khi đăng nhập.
- Sai email hoặc mật khẩu sẽ hiện *"Email hoặc mật khẩu không đúng."* Các lỗi khác (bị khoá, giới hạn số lần thử) hiện nguyên văn để dễ báo cho quản trị viên.
- Nếu bạn dán một đường dẫn sâu (ví dụ `/pending`) khi chưa đăng nhập, hệ thống ghi nhớ và **đưa bạn về đúng trang đó** sau khi đăng nhập xong. Chỉ nhớ tên trang: các bộ lọc nằm sau dấu `?` trên link (ngày, chế độ xem…) **không** được giữ lại, sau khi đăng nhập bạn mở lại link đó một lần nữa.
- Toàn bộ dữ liệu chỉ được tải sau khi có phiên đăng nhập hợp lệ. Người chưa đăng nhập không đọc được gì, kể cả ở tầng cơ sở dữ liệu.

**Đăng xuất**: bấm nút lưới ở góc phải trên cùng rồi chọn **Đăng xuất** (điện thoại: bấm avatar). Phải **bấm hai lần**: lần đầu ô chuyển đỏ, hiện *Bấm lần nữa để đăng xuất*; bấm tiếp trong 4 giây mới đăng xuất, để quá thì trở lại như cũ. Bạn sẽ được đưa về trang đăng nhập ngay.

### Quên mật khẩu

Link **Quên mật khẩu?** nằm bên phải nhãn *Mật khẩu* trên form đăng nhập. Bấm vào chỉ hiện một hộp thoại hướng dẫn — **không có chức năng tự đặt lại mật khẩu**, quản trị viên phải đặt lại thủ công (xem [mục 11](#11-dành-cho-quản-trị-viên)).

Cố ý làm vậy: bật tính năng gửi email đặt lại mật khẩu của Supabase sẽ cho phép bất kỳ ai biết email nhân viên cũng kích hoạt được luồng đó.

> Muốn ghi số điện thoại hay email của quản trị viên vào hộp thoại, sửa chuỗi `forgot.body` trong `src/i18n/translations.ts` (cả bản `vi` lẫn `en`).

### Đổi mật khẩu

Bấm nút lưới ở góc phải trên cùng rồi chọn **Đổi mật khẩu** (điện thoại: bấm avatar).

Form gồm ba ô: **Mật khẩu hiện tại**, **Mật khẩu mới**, **Nhập lại mật khẩu mới**. Có nút *Hiện mật khẩu* để soi lại nếu gõ nhầm.

Điều kiện để nút **Đổi mật khẩu** sáng lên:

- Mật khẩu mới dài **ít nhất 6 ký tự** (đúng mức tối thiểu mặc định của Supabase — nếu dự án bạn đặt chính sách chặt hơn, thông báo của máy chủ sẽ hiện nguyên văn).
- Hai ô mật khẩu mới **khớp nhau**.
- Mật khẩu mới **khác** mật khẩu hiện tại.

Lỗi hiện ngay dưới từng ô khi bạn gõ, không phải bấm nút mới biết.

> **Mật khẩu hiện tại được kiểm tra thật.** Supabase không tự đối chiếu mật khẩu cũ khi đổi, nên ứng dụng đăng nhập lại ngầm bằng mật khẩu bạn vừa nhập trước khi cho đổi. Nhờ vậy người tình cờ ngồi vào máy bạn đang mở sẵn cũng không đổi được mật khẩu.

Kết quả báo bằng [thông báo](#9c-thông-báo): thành công thì form tự đóng; sai mật khẩu hiện tại hay máy chủ từ chối thì form vẫn mở để nhập lại.

Sau khi đổi thành công, bạn **vẫn đăng nhập bình thường trên thiết bị này**. Các thiết bị khác giữ phiên cho tới khi hết hạn.

*Ở chế độ dữ liệu mẫu, mật khẩu mới được lưu trong `localStorage` của trình duyệt, đủ để thử luồng đổi mật khẩu mà không cần Supabase.*

---

## 3. Thanh điều hướng chung

Thanh trên cùng có mặt ở mọi trang:

| Thành phần | Công dụng |
| --- | --- |
| **Lịch** | Trang chính: timeline ngày/tuần/tháng |
| **Tất cả ca** | Danh sách mọi ca, có tìm kiếm |
| **Tổng kết** | Bảng công: ai đã trực xong những ca nào, tổng bao nhiêu giờ ([mục 8c](#8c-trang-tổng-kết)) |
| **Ca của tôi** | Chỉ những ca bạn được phân công |
| **Chờ xác nhận** | Các lượt phân công chưa xác nhận — có **số đếm** hiển thị ngay trên nhãn |
| **Nhật ký** | Nhật ký thao tác, chỉ đọc ([mục 9b](#9b-nhật-ký-thao-tác)) |
| Đồng hồ | Giờ phút giây và ngày tháng năm, chạy theo **giờ máy chủ** — đồng hồ mà luật điểm danh dùng. **Bấm** vào đồng hồ (rê chuột không bật gì) để mở bảng giống đồng hồ taskbar của Windows: giờ to, ngày đầy đủ kèm thứ, và **lịch tháng** — `‹ ›` đổi tháng, bấm tên tháng để chọn nhanh tháng rồi năm, bấm một ngày là mở trang Lịch của ngày đó. Ô **tô tím đặc** là ngày đang xem (ngày trên đường dẫn của trang Lịch / Tổng kết — mở lại bảng sau khi bấm là thấy ngay ngày vừa chọn, lịch mở đúng tháng đó); trang không có ngày thì tô hôm nay. Hôm nay, nếu khác ngày đang xem, có viền tím. Bấm đồng hồ lần nữa, bấm ra ngoài hoặc **Esc** để đóng. Có chấm vàng cạnh giờ nghĩa là chưa lấy được giờ máy chủ, đang hiện giờ máy |
| **Tạo ca** (nút xanh) | Xổ menu hai lựa chọn: **Nhận ca mẫu** (chọn một mẫu trong danh sách rồi chọn ngày) hoặc **Tạo ca thủ công** (form tạo ca, mặc định **hôm nay**) |
| Avatar + tên | Tài khoản đang đăng nhập, kèm nhãn vai trò **Admin** / **Staff** (giống nhau ở cả hai ngôn ngữ) và email. Tên lấy từ danh sách nhân viên nên admin vừa đổi tên bạn ở trang Tài khoản thì thanh trên đổi theo ngay. Dưới 768px chỉ còn avatar |
| ⋮⋮⋮ (nút lưới, ngoài cùng bên phải) | Mở bảng các ô, theo thứ tự: **Tài khoản** (chỉ admin thấy — sửa tên hiển thị, hiện / ẩn người trên bảng, [mục 11](#trang-tài-khoản)), **Thông báo** ([mục 9c](#9c-thông-báo)), **Giao diện** (bấm để đổi Hệ thống → Sáng → Tối, [mục 9f](#9f-giao-diện-sáng--tối-và-chữ-bôi-đen)), **Ngôn ngữ** (bấm để đổi tiếng Việt ↔ tiếng Anh), **Trạng thái** ([mục 9e](#9e-trang-trạng-thái)), **Hướng dẫn** ([mục 9d](#9d-hướng-dẫn-và-bài-từng-bước)), **Đổi mật khẩu**, **Đăng xuất**. Cuối bảng có dòng nhắc *Ctrl + K — Quick Search*. Bấm ô Giao diện hay Ngôn ngữ thì bảng giữ nguyên để bấm tiếp; các ô còn lại đóng bảng |

Cuối trang (chỉ PC) có một dòng chào theo buổi — sáng / trưa / chiều / tối — kèm tên bạn.

### Trên điện thoại (dưới 640px)

Thanh trên chỉ còn logo, nút chuông 🔔 và avatar; phần điều hướng chuyển xuống dưới:

| Thành phần | Công dụng |
| --- | --- |
| **Thanh dưới** | Bốn trang dùng nhiều nhất: **Lịch**, **Tất cả ca**, **Ca của tôi**, **Chờ xác nhận**. Trang đang mở có gạch trên màu indigo; số lượt chờ của bạn hiện trên icon (từ 10 trở lên ghi `9+`) |
| **Nút tròn** góc dưới phải | Mở bảng **Tạo ca**: *Nhận ca mẫu*, *Tạo ca thủ công* (ngày = ngày đang xem), và *Quản lý ca mẫu* với admin |
| **Chuông 🔔** | Mở ngăn thông báo |
| **Avatar** | Mở bảng tài khoản: tên, nhãn vai trò, email và lời chào ở đầu, rồi các mục có cùng màu với ô trên PC — **Tổng kết**, **Nhật ký**, **Trạng thái**, **Hướng dẫn**, **Tài khoản** (admin), **Quick Search**, **Đổi mật khẩu**, **Ngôn ngữ** và **Giao diện** (bấm để đổi, giá trị đang dùng ghi bên phải), **Đăng xuất** (bấm hai lần) |

Nút bấm trên điện thoại cao tối thiểu 44px; hộp thoại mở dạng bảng trượt từ đáy lên (*bottom sheet*). Từ 640px trở lên giao diện PC không đổi.

### Khi cửa sổ hẹp

Màn hình chưa đủ rộng để xếp cả hàng (dưới 1320px) thì thanh chia hai dòng: logo và các nút ở trên, các mục điều hướng xếp thành dải bên dưới. Không mục nào bị ẩn. Từ 640px nội dung trang cuộn trong khung riêng dưới thanh trên (thanh trên luôn đứng yên).

> Con số màu vàng cạnh chữ "Chờ xác nhận" chỉ đếm **các lượt phân công của riêng bạn** đang chờ xác nhận. Ca của người khác không tính vào đây — mở trang *Chờ xác nhận* rồi bỏ tích *Chỉ ca của tôi* để xem của cả nhóm.

---

## 4. Trang Lịch — ba chế độ xem

Đây là màn hình chính. Bên trái là bộ điều hướng thời gian, bên phải là bộ chuyển chế độ xem **Ngày | Tuần | Tháng**.

### Điều hướng thời gian

| Nút | Chế độ Ngày | Chế độ Tuần | Chế độ Tháng |
| --- | --- | --- | --- |
| `‹` | Ngày trước | Tuần trước | Tháng trước |
| Nút giữa | **Hôm nay** | **Tuần này** | **Tháng này** |
| `›` | Ngày sau | Tuần sau | Tháng sau |

Dòng dưới tiêu đề luôn cho biết phạm vi đang xem có bao nhiêu ca và bao nhiêu lượt phân công.

### Chế độ **Ngày**

Timeline chi tiết theo giờ. Đây là chế độ duy nhất có:

- **Bộ chọn khung giờ**: *Vừa theo ngày* (tự co giãn theo dữ liệu thực tế), *06:00–22:00*, *08:00–20:00*, *Cả ngày*.
- Nút **Thêm ca vào ngày này** — khác với nút "Tạo ca" ở thanh trên (nút đó luôn dùng ngày hôm nay).
- Dải chip liệt kê các ca trong ngày ở cuối trang; bấm chip là mở ca đó ra sửa.

### Chế độ **Tuần**

Lưới **nhân viên theo hàng × 7 ngày theo cột**, tuần bắt đầu từ Thứ Hai.

- Mỗi ô là các chip ca của người đó trong ngày đó; bấm chip để sửa.
- Cột **Tổng** ở ngoài cùng bên phải là tổng số giờ làm trong tuần của từng người — dùng để cân đối khối lượng.
- Bấm vào **tiêu đề cột ngày** để nhảy sang chế độ Ngày của ngày đó.

### Chế độ **Tháng**

Lịch tháng dạng lưới, tuần bắt đầu từ Thứ Hai, có hiển thị cả các ngày đầu/cuối tháng liền kề để đủ tuần.

- Mỗi ô hiện tối đa **3 ca**, phần còn lại gộp thành **"+N nữa"**.
- Ca **bạn có tham gia** được viền màu indigo.
- Bấm **số ngày** hoặc **"+N nữa"** để mở chế độ Ngày.
- Bấm một chip ca để sửa ca đó.

> Chế độ Tuần và Ngày có ô tích **"Chỉ nhân viên có ca"** để ẩn những người không được phân công, giúp lưới gọn lại khi công ty đông người. Trên điện thoại ô này và bộ chọn khung giờ gom vào nút **Bộ lọc** (icon thanh trượt, cạnh nút Ngày | Tuần | Tháng); chế độ Tháng không có bộ lọc nào.

Ngày đang xem, chế độ xem, khung giờ và ô tích đều nằm trên đường dẫn ([mục 10](#10-tra-cứu-nhanh)): gửi link là người nhận mở ra đúng màn hình bạn đang xem, F5 cũng không mất.

---

## 5. Đọc timeline ngày

Đây là phần cần nắm rõ nhất.

```
          08    09    10    11    12    13    14    15    16    17    18
Huy  ┃ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ┃                                       ← đã xác nhận
     ┃              ┌ ─ ─ ─ ─ ─ ─ ─ ┐                                   ← chờ xác nhận
Thiên┃              ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
An   ┃                                        ┌ ─ ─ ─ ─ ─ ─ ─ ┐
```

| Quy ước | Ý nghĩa |
| --- | --- |
| **Cột trái** | Danh sách nhân viên. **Bạn luôn ở hàng đầu tiên**, nền indigo nhạt, có nhãn *"Bạn"* |
| **Trục ngang** | Giờ trong ngày, theo khung giờ bạn đang chọn |
| **Khối màu** | Một lượt phân công. Bên trong ghi tên ca và khung giờ của riêng người đó |
| **Viền liền** | Trạng thái **đã xác nhận** |
| **Viền nét đứt + icon đồng hồ** | Trạng thái **chờ xác nhận** |
| **Màu khối** | Mỗi ca một màu cố định, không đổi giữa các lần tải trang |
| **Nhiều khối xếp chồng trong một hàng** | Người đó có các lượt phân công **trùng giờ nhau** — hệ thống tự tách tầng để không đè lên nhau |
| **Vạch đỏ dọc** | Thời điểm hiện tại. Chỉ xuất hiện khi bạn đang xem **hôm nay** |

**Bấm vào một khối** sẽ mở form sửa ca, đồng thời cuộn tới và tô sáng đúng dòng nhân viên bạn vừa bấm.

**Dải cảnh báo vàng ở đáy timeline** xuất hiện khi có lượt phân công nằm ngoài khung giờ đang xem (ví dụ ca đêm 22:00–02:00 trong khi bạn đang xem 08:00–20:00). Chuyển bộ chọn khung giờ sang **Cả ngày** để thấy chúng.

Timeline cuộn ngang được khi khung giờ rộng; cột tên nhân viên luôn dính lại bên trái.

---

## 6. Tạo, sửa và xoá ca

### Mở form

| Cách | Kết quả |
| --- | --- |
| Nút **Tạo ca** trên thanh điều hướng → **Tạo ca thủ công** | Ca mới, ngày = hôm nay |
| Nút tròn (điện thoại) → **Tạo ca thủ công** | Ca mới, ngày = ngày đang xem |
| Nút **Thêm ca vào ngày này** (chế độ Ngày) | Ca mới, ngày = ngày đang xem |
| Bấm một khối trên timeline / chip tuần / chip tháng | Sửa ca đã có |
| Nút **Sửa** trên thẻ ca ở các trang danh sách | Sửa ca đã có |

### Hai chế độ: **Đơn giản** và **Nâng cao**

Khi mở một ca **đã có**, đầu form có công tắc **Đơn giản | Nâng cao**. Form nhớ chế độ bạn chọn lần trước (trên trình duyệt đó); lần đầu là **Đơn giản**. Tạo ca mới thì luôn là form đầy đủ.

**Đơn giản** chỉ xoay quanh *phần của bạn* trong ca. Thông tin ca và những người khác chỉ hiện để xem.

| Bạn đang… | Form hiện | Bấm là |
| --- | --- | --- |
| Chưa có trong ca | Ô **Từ / Đến** (sẵn giờ của ca), ghi chú, nút **Nhận ca này** | Lưu ngay, đóng form |
| Có trong ca, chờ xác nhận | Giờ và ghi chú sửa được, nút **Cả ca** để về khung giờ của ca, nút **Điểm danh** khi tới giờ, nút **Rời ca** | **Điểm danh** và **Rời ca** lưu ngay. Sửa giờ / ghi chú thì bấm **Lưu thay đổi** ở chân form |
| Đã điểm danh | Giờ bị khoá kèm 🔒, chỉ còn sửa ghi chú | — |

- Nút **Điểm danh** theo đúng luật ở [mục 8b](#8b-chấm-công-và-luật-điểm-danh): chưa tới giờ thì hiện *Mở điểm danh lúc …*, quá giờ thì *Hết giờ điểm danh — bạn không có quyền điểm danh trễ*. Điểm danh trước giờ bắt đầu (trong 30 phút sớm) sẽ được hỏi lại một lần.
- Vừa đổi giờ mà chưa lưu thì không điểm danh được: lưu giờ mới trước.
- **Rời ca** hỏi lại một lần trước khi gỡ bạn khỏi ca. Nhân viên chỉ tự rời được trong **30 phút đầu** sau khi nhận ca — nút ghi rõ hạn (*Rời ca · tới 16:34*); quá hạn thì nút được thay bằng câu *Đã nhận ca quá 30 phút — bạn không còn quyền rời ca*.

**Nâng cao** là form đầy đủ mô tả ở các phần dưới: sửa thông tin ca, thêm/gỡ/sửa người khác, xoá ca. Hai chế độ dùng chung một bản nháp — sửa dở ở bên này rồi chuyển sang bên kia vẫn còn.

### Phần thông tin ca

**Tiêu đề**, **Ngày**, **Bắt đầu**, **Kết thúc**, **Ghi chú** (không bắt buộc).

Ô **Ngày** gõ được bằng phím như ô ngày thường: `dd/mm/yyyy`, dấu `/` tự chèn, **↑ ↓** tăng giảm phần ngày / tháng / năm ở chỗ con trỏ. Bấm icon lịch (hoặc **Alt + ↓**) để mở lịch; trên lịch bấm tên tháng để chọn nhanh tháng, bấm tiếp năm để chọn năm.

Khung giờ ở đây là khung giờ *tổng* của ca. Từng nhân viên vẫn có giờ riêng bên dưới.

### Phần nhân viên trong ca

Mỗi dòng gồm: **chọn người** · **Từ** · **Đến** · **Trạng thái** · nút xoá · ô ghi chú riêng cho người đó.

- **Thêm nhân viên**: thêm một dòng mới, mặc định lấy khung giờ của ca và trạng thái *Chờ xác nhận*. Với nhân viên thường, nút này là **Thêm tôi vào ca** — chỉ admin thêm được người khác ([mục 8b](#8b-chấm-công-và-luật-điểm-danh)).
- Người đã có trong ca sẽ bị **làm mờ** trong danh sách chọn, tránh trùng.
- Nút thùng rác **gỡ người đó khỏi ca**. Thay đổi chỉ có hiệu lực sau khi bấm **Lưu thay đổi**.
- Dưới mỗi dòng hiện **thời lượng** đã tính sẵn (ví dụ `4h 30m`).

### Kiểm tra dữ liệu

| Loại | Thông báo | Hậu quả |
| --- | --- | --- |
| **Lỗi** (đỏ) | *Vui lòng nhập tiêu đề* | Không lưu được |
| **Lỗi** (đỏ) | *Giờ kết thúc phải sau giờ bắt đầu* | Không lưu được |
| **Cảnh báo** (vàng) | *Nằm ngoài khung giờ của ca* | **Vẫn lưu được** — chỉ nhắc bạn xem lại |

Cảnh báo vàng cố ý không chặn, vì có những ca thực tế cần người vào sớm hoặc ở lại muộn hơn khung chung.

### Xoá ca

Bấm **Xoá** (góc trái dưới), form chuyển sang bước xác nhận, bấm **Xoá ca** lần nữa. Thao tác này xoá luôn toàn bộ phân công thuộc ca đó.

Nhân viên chỉ xoá được ca **đang trống**, hoặc ca **chỉ có chính mình** khi bạn **còn rời được** (chưa điểm danh, chưa quá 30 phút kể từ lúc nhận). Không xoá được thì nút **Xoá** được thay bằng câu giải thích, chỉ admin xoá được ([mục 8b](#8b-chấm-công-và-luật-điểm-danh)).

### Đóng form

Ba cách: nút **✕**, phím **Esc**, hoặc bấm ra vùng nền tối bên ngoài. Thay đổi chưa lưu sẽ bị bỏ.

---

## 7. Ca mẫu và nhận ca nhanh

Ca mẫu là **định nghĩa ca lặp lại** — ví dụ *Trực trang 08:00–18:00, Thứ 2 đến Thứ 6*. Nhân viên nhận ca chỉ bằng một cú bấm, không phải điền form.

Mọi thứ về ca mẫu nằm trong nút **Tạo ca** (máy tính: thanh trên; điện thoại: nút tròn ở góc dưới), dùng được ở bất cứ trang nào. Trang Lịch không còn thanh ca mẫu riêng.

### Nhận ca

Bấm **Tạo ca → Nhận ca mẫu**: menu liệt kê mọi ca mẫu đang dùng, mỗi dòng ghi giờ và các thứ mẫu lặp vào. Trong Ctrl + K, gõ *nhận ca mẫu* để vào thẳng danh sách này.

Bấm một mẫu sẽ mở hộp thoại **chọn ngày** — bạn không bị mặc định nhận vào ngày đang xem, và **chọn được nhiều ngày cùng lúc**.

**Chọn nhanh** (hàng chip phía trên):

| Chip | Kết quả |
| --- | --- |
| **Hôm nay** | Chọn đúng hôm nay |
| **Ngày mai** | Chọn đúng ngày mai |
| **Ngày đang xem** | Chỉ hiện khi ngày đang xem khác hôm nay/ngày mai |
| **Các ngày lặp tuần này** | Thêm mọi ngày mà ca mẫu lặp trong tuần hiện tại |
| **Các ngày lặp tuần sau** | Tương tự cho tuần kế tiếp |
| **Bỏ chọn hết** | Xoá toàn bộ lựa chọn |

**Lịch chọn** bên dưới có nút chuyển **Tuần | Tháng** cùng mũi tên `‹ ›` để đi tới lui. Quy ước ô ngày:

| Hiển thị | Ý nghĩa |
| --- | --- |
| Ô nền indigo | Đang chọn |
| Ô nền xanh lá + dấu ✓ | Bạn **đã nhận** ngày đó rồi — không bấm được |
| Chấm tròn nhỏ dưới số ngày | Ngày ca mẫu lặp lại |
| Số ngày màu nhạt | Ngoài các ngày lặp — **vẫn chọn được** nếu bạn muốn làm bù |
| Viền indigo mảnh | Hôm nay |

Bấm một ô để bật/tắt lựa chọn. Nút dưới cùng ghi rõ số ngày, ví dụ **Nhận 5 ngày**.

Với mỗi ngày được chọn, hệ thống làm đúng ba việc:

1. Nếu ngày đó **chưa ai** nhận ca mẫu này → tạo ca thật từ mẫu.
2. Nếu **đã có người** nhận → bạn được thêm vào **chính ca đó**.
3. Bạn được phân công với khung giờ của mẫu, trạng thái **Chờ xác nhận**.

> Một ca mẫu + một ngày = **đúng một ca**. Ràng buộc này nằm ở tầng cơ sở dữ liệu, nên hai người bấm cùng lúc cũng không tạo ra ca trùng.

Trên chip ca mẫu, nhãn **✓ Đã nhận** cho biết bạn đã nhận ca đó **trong ngày đang xem**. Nút *Nhận ca* vẫn bấm được để đặt thêm những ngày khác.

Muốn đổi giờ sau khi nhận? Bấm vào khối của bạn trên timeline rồi sửa như ca thường.

### Quản lý ca mẫu

Bấm **Tạo ca → Quản lý ca mẫu**. **Chỉ admin** thấy lựa chọn này (cần chạy `supabase/008_template_admin.sql`): nhân viên chỉ nhận ca mẫu, không tạo, sửa, bật/tắt hay xoá được — database cũng chặn, gọi thẳng API sẽ nhận *Bạn không có quyền sửa ca mẫu.* Khi chưa có ca mẫu nào, nhân viên thấy dòng *Chưa có ca mẫu nào — admin sẽ tạo.*

- **Tạo ca mẫu**: tiêu đề, giờ bắt đầu/kết thúc, ghi chú.
- **Lặp vào**: chọn các thứ trong tuần. **Không chọn thứ nào = lặp mọi ngày.**
- **Màu**: mọi ca nhận từ ca mẫu này hiện đúng màu đã chọn ở mọi chế độ xem. Ca tạo bằng nút **Tạo ca** thì có màu ngẫu nhiên (cố định theo từng ca).
- **Đang dùng**: bỏ tích để tạm ngừng — mẫu vẫn được lưu nhưng không ai nhận được nữa.
- **Xoá ca mẫu**: các ca đã tạo từ mẫu đó **vẫn được giữ nguyên**, chỉ mất liên kết với mẫu.

### Nếu lựa chọn "Nhận ca mẫu" mờ đi

Dòng giải thích bên dưới nói rõ lý do: *Chưa có ca mẫu nào* (admin cần tạo ở **Quản lý ca mẫu**), hoặc *Chưa cài đặt ca mẫu* — file `supabase/002_shift_templates.sql` chưa được chạy. Mọi phần khác của ứng dụng vẫn hoạt động bình thường.

---

## 8. Ba trang lọc

### Tất cả ca

Danh sách đầy đủ, **nhóm theo ngày**, tiêu đề nhóm ghi rõ *Hôm nay / Ngày mai / Hôm qua* khi phù hợp.

- **Sắp tới / Đã qua / Tất cả**: lọc theo mốc hôm nay.
- **Ô tìm kiếm**: lọc theo tiêu đề ca, ghi chú, **và tên nhân viên**. Bộ lọc nằm **ngay trong ô này**, kiểu thanh lọc của Supabase:
  - Bấm **Lọc** ở cuối ô → chọn loại → chọn giá trị. Mỗi bộ lọc đang bật thành một **chip** trong ô, ô dài ra theo số chip (hết chỗ thì chip xuống dòng).
  - Bấm chip để sửa, bấm **×** trên chip để bỏ. Ô chữ đang trống mà bấm **Backspace** thì bỏ chip cuối.
  - Nút **×** lớn ở cuối ô xoá cả chữ lẫn mọi chip. Tab giữ nguyên.

  | Bộ lọc | Ghi chú |
  | --- | --- |
  | **Từ ngày / Đến ngày** | Thu hẹp **bên trong** tab: tab *Sắp tới* không chọn được ngày đã qua, và ngược lại. Gõ `dd/mm/yyyy` rồi Enter, hoặc bấm một ngày trên lịch ngay bên dưới (bấm tên tháng để chọn nhanh tháng, năm) |
  | **Nhân viên** | Chọn được nhiều người, mỗi người một chip. **AND**: ca phải có **tất cả** người đã chọn. Lọc ở database; thẻ ca vẫn hiện đủ mọi người trong ca |
  | **Sắp xếp** | Mặc định Cũ → mới; chỉ hiện chip khi chọn Mới → cũ |
- **Cuộn vô hạn**: danh sách tải từng tháng một **theo chiều sắp xếp** — Cũ → mới thì tiến dần từ đầu khoảng, Mới → cũ thì lùi dần từ cuối khoảng. Tháng mới luôn nối vào cuối. Tới hết thì hiện *"Đã hết ca trong khoảng này."*
- **Tìm kiếm** lọc trên phần đã tải. Nếu chưa khớp ca nào mà vẫn còn tháng chưa tải, danh sách tự tải tiếp cho tới hết — thu hẹp ngày trong bộ lọc để tìm nhanh hơn.
- Mỗi thẻ ca liệt kê toàn bộ nhân viên kèm giờ, thời lượng và trạng thái.
- Dòng của bạn có nền indigo nhạt và nhãn *"Bạn"*.
- Dòng đang **chờ xác nhận** có nút **✓ Xác nhận** để duyệt ngay tại chỗ, không cần mở form.

### Ca của tôi

Chỉ các ca bạn có tham gia, và trong mỗi ca **chỉ hiện dòng của bạn**.

Bốn ô số ở đầu trang:

| Ô | Ý nghĩa |
| --- | --- |
| **Lượt phân công** | Tổng số lượt của bạn, cả quá khứ lẫn tương lai |
| **Sắp tới** | Số lượt từ hôm nay trở đi |
| **Chờ xác nhận** | Số lượt của bạn chưa được xác nhận |
| **Số giờ sắp tới** | Tổng giờ từ hôm nay trở đi |

### Chờ xác nhận

Chỉ hiện các lượt phân công đang chờ.

- Ô tích **"Chỉ ca của tôi"** **được tích sẵn** khi mở trang, nên mặc định bạn thấy đúng phần của mình — khớp với con số vàng trên thanh điều hướng. Bỏ tích để xem của cả nhóm.
- Bấm **✓ Xác nhận** trên từng dòng để duyệt.
- Khi mọi thứ đã duyệt xong, trang hiện *"Không có gì chờ xác nhận."*

---

## 8b. Chấm công và luật điểm danh

**Chấm công = xác nhận.** Bấm **✓ Xác nhận** trên lượt phân công của mình là điểm danh cho lượt đó (trạng thái đổi từ *Chờ xác nhận* sang *Đã xác nhận*; trong form sửa ca ở chế độ Đơn giản thì nút này tên **Điểm danh**). Số công được tính ở trang [Tổng kết](#8c-trang-tổng-kết).

Sau khi chạy `supabase/005_attendance.sql`, nhân viên thường phải theo các luật sau. Admin được miễn toàn bộ.

| Luật | Chi tiết |
| --- | --- |
| Chỉ điểm danh lượt của mình | Lượt của người khác không có nút **Xác nhận** |
| Chỉ trong giờ | Từ **30 phút trước giờ bắt đầu** đến **giờ kết thúc** của *riêng bạn* (không phải của cả ca). Làm 08:00–12:00 trong ca 08:00–18:00 thì cửa sổ là 07:30–12:00 |
| Không điểm danh trễ | Qua giờ kết thúc là hết cửa. Trực thật mà quên bấm thì nhắn admin xác nhận hộ |
| Đã điểm danh là khoá | Không bỏ điểm danh, không sửa giờ, không đổi người, không gỡ khỏi ca. Ghi chú vẫn sửa được |
| Ca đã có người điểm danh | Không xoá, không dời sang ngày khác |

Sau khi chạy thêm `supabase/006_shift_rules.sql` — **nhân viên chỉ thao tác phần của mình**:

| Luật | Chi tiết |
| --- | --- |
| Tự rời ca | Chỉ trong **30 phút đầu** kể từ lúc nhận ca. Quá hạn thì nhắn admin |
| Xoá ca | Ca **đang trống**: lúc nào cũng được. Ca **chỉ có bạn**: được khi bạn còn rời được (chưa điểm danh, chưa quá 30 phút). Có **người khác** trong ca: chỉ admin |
| Thêm người khác vào ca | Chỉ admin — kể cả khi tạo ca mới. Bạn chỉ thêm được chính mình (nhận ca) |
| Lượt của người khác | Chỉ admin sửa (giờ, ghi chú, trạng thái) hay gỡ được — kể cả khi họ chưa điểm danh |
| Tên, ngày, giờ của ca | Ca có người khác thì chỉ admin sửa được. Bạn vẫn nhận ca đó được và sửa phần của mình |
| Ghi chú của ca | Ai cũng sửa được, kể cả khi ca có người khác |

006 bỏ luật "ca tạo quá 30 phút thì không xoá được" của 005.

Trên giao diện, thay cho nút **Xác nhận** bạn sẽ thấy:

| Hiển thị | Ý nghĩa |
| --- | --- |
| *Mở điểm danh lúc 07:30 8/9* | Chưa tới giờ. Nút tự hiện khi tới giờ, không cần tải lại |
| *Hết giờ điểm danh — bạn không có quyền điểm danh trễ* | Đã qua giờ kết thúc của bạn |
| *lúc 07:42 8/9* cạnh nhãn **Đã xác nhận** | Thời điểm điểm danh, do máy chủ ghi |

Trong form sửa ca, ô bị khoá chuyển xám. Khoá **theo luật** thì kèm một dòng 🔒 nói rõ lý do: dòng đã điểm danh (không sửa giờ, không gỡ), dòng của bạn đã nhận quá 30 phút (không rời được), ca đã có người điểm danh (không dời ngày, không xoá), ca bạn nhận quá 30 phút (không xoá). Khoá chỉ vì **ca có người khác** (tên, ngày, giờ của ca; dòng của người khác; nút Xoá) hay vì không phải admin (ô chọn người, thêm người khác) thì chỉ khoá / ẩn, không kèm câu giải thích. Ô ghi chú của ca vẫn mở.

Giờ tính theo **đồng hồ máy chủ, múi giờ Việt Nam** — chỉnh đồng hồ máy mình không có tác dụng. Mọi luật nằm trong trigger của database nên gọi thẳng Supabase API cũng không lách được; giao diện chỉ ẩn sẵn những gì database sẽ từ chối. Mọi can thiệp của admin đều vào [Nhật ký](#9b-nhật-ký-thao-tác).

Ca mẫu chỉ admin quản lý (sau khi chạy `008_template_admin.sql`, xem [mục 7](#quản-lý-ca-mẫu)). Phần còn chưa chặn: xem [roadmap.md](roadmap.md).

---

## 8c. Trang Tổng kết

Trang **Tổng kết** (`/summary`; điện thoại: avatar → **Tổng kết**) là bảng công: ai đã trực xong những ca nào, tổng bao nhiêu giờ. Không cần migration riêng — số liệu được suy ra từ chính `shifts` và `shift_assignments`, nên luôn khớp dữ liệu hiện tại.

### Một lượt phân công vào bảng khi nào

Đúng hai điều kiện, thiếu một là chưa tính:

1. Nhân viên **đã xác nhận** (điểm danh) lượt đó.
2. **Đã qua giờ kết thúc của riêng người đó** — làm 08:00–12:00 trong ca 08:00–18:00 thì 12:00 là tính được, không phải đợi 18:00.

Lượt chưa xác nhận thì **không bao giờ** vào bảng, dù ca đã qua từ lâu. Bảng tự cập nhật mỗi phút nên ca vừa kết thúc tự hiện ra, không cần F5.

### Cách xem

Giống trang Lịch: nút `‹ Hôm nay / Tuần này / Tháng này ›` và bộ chuyển **Ngày | Tuần | Tháng**. Khác Lịch ở hai điểm: mở ra mặc định là **Tuần**, và chế độ Tháng lấy đúng các ngày của tháng đó (không đệm thêm ngày tháng liền kề cho tròn tuần — bảng tháng 9 không cộng ngày 31/8).

Bốn ô số ở đầu trang:

| Ô | Ý nghĩa |
| --- | --- |
| **Nhân viên được tính** | Số người có ít nhất một lượt đã ghi nhận trong khoảng đang xem |
| **Lượt đã trực** | Số lượt đã ghi nhận |
| **Tổng giờ** | Tổng giờ của các lượt đó |
| **Chưa ghi nhận** | Số lượt nằm trong khoảng nhưng chưa vào bảng (chưa xác nhận, hoặc đã xác nhận mà chưa tới giờ kết thúc). Ô này có để con số không trông như dữ liệu bị mất |

Dưới các ô là một dòng nhắc luật ghi nhận ở trên.

### Đọc bảng

- **Hàng** là nhân viên — bạn luôn ở hàng đầu (nền indigo nhạt, nhãn *Bạn*), còn lại xếp theo tên. **Cột** là ngày, cuối cùng là cột **Tổng** của từng người; hàng cuối **Theo ngày** là tổng giờ từng ngày.
- Chế độ Ngày và Tuần: mỗi ô là các khối ca của người đó trong ngày, cùng màu với trên Lịch, ghi tên ca và khung giờ **riêng của người đó**.
- Chế độ Tháng có tới 31 cột nên mỗi ô chỉ ghi **số giờ** (`·` nếu không có); rê chuột vào để xem tên ca và giờ.
- Ô tích **Hiện cả nhân viên không có ca** (điện thoại: *Hiện tất cả*) hiện thêm những người không có lượt nào trong khoảng; mặc định ẩn để bảng không đầy dòng rỗng. Người đang bị **ẩn** (tài khoản quản lý, xem [Trang Tài khoản](#trang-tài-khoản)) chỉ hiện khi họ có công thật.
- Bảng **chỉ để xem**: bấm vào một ca không mở form sửa. Muốn sửa thì đi qua trang Lịch.
- Chưa có tài khoản nhân viên nào thì bảng báo *Chưa có tài khoản nhân viên*; có tài khoản mà khoảng này chưa ghi nhận được ca nào thì báo *Chưa ghi nhận được ca nào trong khoảng này.*

> Tổng kết **không phải ảnh chụp bất biến**: nó tính lại từ dữ liệu hiện có mỗi lần mở. Nếu một ca đã qua bị sửa (admin sửa giờ, gỡ người…) thì con số cũ đổi theo. Chứng cứ bất biến về việc ai đã làm gì nằm ở [Nhật ký](#9b-nhật-ký-thao-tác).

Đường dẫn: `/summary`, tham số `date`, `view` (`day` / `month`; tuần là mặc định nên không ghi), `all=1` — xem [mục 10](#10-tra-cứu-nhanh).

---

## 9. Đa ngôn ngữ và cập nhật thời gian thực

**Ngôn ngữ.** Mặc định tiếng Việt. Ô **Ngôn ngữ** trong nút lưới (điện thoại: bảng avatar) đổi toàn bộ giao diện, kể cả định dạng ngày tháng (*Thứ Hai, 8 tháng 9 2026* ↔ *Monday, 8 September 2026*). Lựa chọn được ghi nhớ cho lần sau.

**Thời gian thực.** Ứng dụng lắng nghe thay đổi trên `shifts`, `shift_assignments` và `shift_templates` qua Supabase Realtime. Khi đồng nghiệp tạo ca, nhận ca hay xác nhận, màn hình của bạn **tự cập nhật** — không cần F5.

---

## 9b. Nhật ký thao tác

Trang **Nhật ký** ghi lại mọi thay đổi dữ liệu: tạo/sửa/xoá ca, thêm/gỡ nhân viên, nhận ca, đổi trạng thái, và tạo/sửa/xoá/bật-tắt ca mẫu.

Mỗi dòng gồm thời điểm, người thực hiện, hành động, loại đối tượng và câu mô tả. Bấm **Chi tiết** để xem `old_data` / `new_data` / ngữ cảnh dạng JSON. Với thao tác sửa (có cả trước lẫn sau), những trường bị đổi được tô màu: đỏ kèm dấu `-` ở bản trước, xanh kèm dấu `+` ở bản sau.

### Một thao tác = một dòng

Nguyên tắc: một cú bấm của người dùng cho ra đúng một dòng nhật ký, kể cả khi dưới database nó là nhiều lệnh.

**Xoá ca** — chỉ một dòng *Xoá ca*, không sinh thêm dòng *Gỡ nhân viên* nào. Danh sách người đang trong ca được chụp lại ngay trong dòng đó:

| Nơi ghi | Nội dung |
| --- | --- |
| Câu mô tả | `Xoá ca Trực trang (2026-09-12 08:00-18:00) — gỡ 3 nhân viên: Huy, Thiên, An` |
| `metadata.staff_count` | Số người đang trong ca |
| `metadata.staff_removed` | Mảng đầy đủ: tên, giờ riêng, trạng thái, ghi chú của từng người |

Ngược lại, gỡ một người **trong form sửa ca** vẫn sinh dòng *Gỡ nhân viên* riêng — vì đó mới là thao tác người dùng chủ động làm.

Cách phân biệt: trigger kiểm tra ca cha còn tồn tại không. Không còn nghĩa là dòng đó bị cascade xoá theo khi xoá cả ca, và bỏ qua.

> Riêng trigger xoá ca phải chạy ở `BEFORE DELETE` chứ không phải `AFTER`: chỉ lúc đó các phân công mới còn tồn tại để liệt kê. Vẫn an toàn vì log nằm chung transaction — xoá thất bại thì log cũng rollback theo.



Bấm **Nhận ca** dưới database là hai lệnh: tạo ca rồi thêm phân công. Nhật ký **gộp lại thành một dòng duy nhất là "Nhận ca"** — tách đôi sẽ khiến một cú bấm trông như hai sự kiện rời rạc.

Câu mô tả chỉ ghi gọn `Nhận ca <tên ca> ngày <ngày> (giờ)`. Không cần nói ca đến từ ca mẫu, vì đã là *Nhận ca* thì chắc chắn từ ca mẫu. Phần còn lại nằm trong chi tiết:

| Trường | Nội dung |
| --- | --- |
| `metadata.shift_created` | `true` nếu ca được tạo bởi chính lần nhận này, `false` nếu vào ca người khác đã mở |
| `metadata.shift_snapshot` | Toàn bộ dòng `shifts` tương ứng |
| `metadata.template_id` | Ca mẫu đã dùng |

Cách làm: trigger trên bảng `shifts` **cố ý bỏ qua** những ca có `template_id`, vì dòng "Nhận ca" ngay sau đó đã ghi việc tạo ca. Trigger xác định ca có phải vừa tạo hay không bằng cách kiểm tra người nhận có phải người đầu tiên trong ca.

> Kèm theo đó, nếu bước thêm phân công thất bại sau khi ca đã được tạo, ứng dụng **xoá luôn ca vừa tạo**. Nếu để lại thì sẽ có một ca không nằm trong bất kỳ dòng nhật ký nào.

**Bộ lọc**: từ ngày, đến ngày (gõ `dd/mm/yyyy` hoặc bấm icon lịch, có nút ✕ để bỏ; *Từ* không chọn được sau *Đến* và ngược lại), nhân viên liên quan, hành động, loại đối tượng, và tìm kiếm trong phần mô tả. Phân trang 50 dòng mỗi trang, không tải toàn bộ. Ô **Hành động** có thêm **Điểm danh** và **Gỡ điểm danh**, tách hai chiều của *Đổi trạng thái* (lọc *Đổi trạng thái* vẫn ra cả hai). Hai mục này lọc ngay trên từng trang tải về, nên một trang có thể ít hơn 50 dòng hoặc trống, và không hiện tổng số dòng.

**Nhân viên liên quan** chọn được nhiều người, theo **AND**: dòng phải dính tới **tất cả** người đã chọn. Một người được coi là liên quan tới một dòng khi họ là:

| Vai trò | Trường |
| --- | --- |
| Người thực hiện | `actor_id` |
| Người bị tác động (thêm, gỡ, nhận ca, đổi trạng thái) | `metadata.target_user_id` |
| Người bị gỡ khi xoá cả ca | `metadata.staff_removed[].user_id` |

Ví dụ chọn Huy + An là ra những lần Huy thêm / gỡ / đổi trạng thái của An, hoặc một ca có cả hai bị xoá.

### Vì sao nhật ký đáng tin

Dự án cho **mọi nhân viên đăng nhập sửa được toàn bộ ca**, nên nhật ký chỉ có giá trị nếu nhân viên không thể can thiệp vào nó. Tính bất biến được đặt ở **database**, không phải ở giao diện:

| Lớp | Cơ chế |
| --- | --- |
| Sinh log | Trigger `record_action_log` trên cả ba bảng. Thao tác thành công là log được ghi, không phụ thuộc frontend gọi đúng hay không |
| Quyền SQL | `revoke all`, chỉ `grant select` cho `authenticated` |
| RLS | Chỉ có policy cho `SELECT`. **Không có** policy `INSERT`/`UPDATE`/`DELETE` |
| Ghi được nhờ đâu | Hàm trigger là `SECURITY DEFINER`, chạy dưới quyền chủ sở hữu bảng |

Hệ quả:

- Nhân viên **không** sửa/xoá được log, kể cả khi gọi thẳng Supabase API và bỏ qua frontend.
- Nhân viên **không** tạo được log giả — không có quyền `INSERT`.
- Trên web **không tồn tại** chức năng sửa/xoá nhật ký. Đây là chủ ý, không phải thiếu sót.
- Chỉ `service_role` hoặc người quản trị database trực tiếp mới can thiệp được.

Muốn tự kiểm chứng, mục 5 trong `supabase/003_action_logs.sql` có sẵn bốn câu lệnh: một câu `select` phải chạy được, ba câu `insert`/`update`/`delete` phải báo *permission denied*.

> Trang Nhật ký **không** dùng Realtime — log sinh ra ở mọi thao tác nên sẽ khiến màn hình nhảy liên tục và phá phân trang. Bấm **Tải lại** khi cần xem dòng mới.

## 9c. Thông báo

Mọi thao tác ghi dữ liệu — tạo / lưu / xoá ca, nhận ca, rời ca, điểm danh, xác nhận hộ, nhận ca mẫu, quản lý ca mẫu, đổi mật khẩu — đều báo kết quả bằng **thông báo** thay vì dòng chữ trong form.

**Popup ở góc.** Khi máy chủ trả kết quả, một popup hiện ở góc trên bên phải, ngay dưới thanh trên cùng (mobile: trên cùng màn hình). Popup mới nhất nằm trên. Popup nổi trên cả form đang mở, nên lỗi lưu ca vẫn thấy được trong khi form còn mở để sửa.

| Loại | Biểu tượng | Tự ẩn sau | Nội dung |
| --- | --- | --- | --- |
| Thành công | ✓ xanh | 5 giây | Việc vừa làm, kèm ngày và giờ của ca |
| Lỗi | ✕ đỏ | 10 giây | Câu từ chối **nguyên văn** của máy chủ (ví dụ *Bạn không có quyền điểm danh ngoài giờ…*) |

Rê chuột vào popup thì nó dừng đếm giờ. Bấm **✕** chỉ ẩn popup — thông báo vẫn nằm trong ngăn. Bấm vào nội dung popup thì mở ngăn thông báo.

**Ngăn thông báo** (nút lưới → **Thông báo**; trên điện thoại là nút 🔔). Không có đã đọc / chưa đọc, nút lưới và chuông cũng không đếm số — thông báo nào cũng là kết quả việc bạn vừa tự bấm. Giống Action Center của Windows: trượt ra từ mép phải, thông báo nhóm theo ngày, mới nhất ở trên.

| Thao tác | Cách làm |
| --- | --- |
| Xoá một thông báo | Nút **✕** bên phải nó |
| Xoá tất cả | Nút ở đầu ngăn |

Trên máy tính, nút ✕ của từng thông báo chỉ hiện khi rê chuột vào; trên điện thoại nó luôn hiện.

**Lưu ở đâu.** Thông báo nằm trong `localStorage` của trình duyệt, riêng cho từng tài khoản (`scheduler.notifications.<id>`), giữ tối đa 200 cái gần nhất. **Không đồng bộ** giữa các máy và không gửi lên máy chủ: xoá dữ liệu trình duyệt là mất. Các tab cùng trình duyệt thì thấy chung. Muốn biết chắc ai đã làm gì, xem [Nhật ký](#9b-nhật-ký-thao-tác) — đó mới là bản ghi của máy chủ.

Lỗi nhập liệu (thiếu tiêu đề, giờ kết thúc trước giờ bắt đầu, mật khẩu quá ngắn…) vẫn hiện ngay dưới ô nhập như cũ — đó không phải phản hồi từ máy chủ. Form đăng nhập cũng giữ dòng báo lỗi riêng, vì lúc đó chưa có tài khoản để gắn thông báo.

---

## 9d. Hướng dẫn và bài từng bước

Mở trang **Hướng dẫn** (`/help`) từ nút lưới → **Hướng dẫn**, từ bảng avatar trên điện thoại, hoặc gõ *hướng dẫn* trong Ctrl + K. Trang viết cho nhân viên. Trên cùng là mục **Luật điểm danh** (mốc giờ, việc được và không được làm), bấm vào đầu mục để thu gọn (trình duyệt nhớ lựa chọn); dưới là các bài từng bước, rồi mục lục, ô tìm (gõ không dấu được) và một mục **Dành cho admin** chỉ admin thấy. Có đủ tiếng Việt và tiếng Anh theo ngôn ngữ đang chọn.

**Bài từng bước (wizard)**: bấm một bài ngay dưới Luật điểm danh, hoặc **Xem từng bước** cạnh từng mục. Bài hướng dẫn tự chuyển tới đúng trang, làm tối màn hình trừ đúng phần cần bấm, và hiện thẻ giải thích ngay cạnh đó. Khi cần, nó tự mở menu, mở một ca, hay chuyển form sang chế độ Đơn giản.

| Bài | Chỉ vào |
| --- | --- |
| Làm quen giao diện | Thanh điều hướng, chọn ngày, Ngày / Tuần / Tháng, cách đọc lịch, Tạo ca, menu, Ctrl + K |
| Nhận ca mẫu | Nút Tạo ca, lựa chọn Nhận ca mẫu, danh sách mẫu, chọn ngày, nút xác nhận |
| Mở và sửa ca của mình | Mở một ca, Đơn giản / Nâng cao, phần của bạn, điểm danh / rời ca, người khác |
| Điểm danh | Trang Chờ xác nhận, ô Chỉ ca của tôi, thẻ ca, nút Xác nhận và các luật |
| Menu và thông báo | Các ô trong nút lưới (điện thoại: chuông và avatar) |

Phím: **→** hoặc **Enter** tiếp, **←** lùi, **Esc** dừng. Trong lúc hướng dẫn, trang phía dưới không bấm được — bài tự bấm hộ những gì cần mở. Phần nào chưa có trên màn hình (ví dụ hôm nay chưa có ca, hay chưa tới giờ điểm danh) thì thẻ nói rõ vì sao.

Lần đăng nhập đầu tiên, góc dưới trái hiện lời mời **Mới dùng Thinkmay Team Board?** — bấm **Bắt đầu** để xem bài Làm quen giao diện, hoặc **Để sau**. Mỗi tài khoản chỉ được hỏi một lần (nhớ trên trình duyệt đó).

Các bài cũng gọi được từ **Quick Search** (Ctrl + K): gõ *hướng dẫn* hoặc tên bài, mục nằm trong nhóm **Hướng dẫn** ở cuối danh sách — gõ *điểm danh* là ra chỗ điểm danh trước, bài hướng dẫn về nó đứng sau. Chữ gõ vào ô tìm của trang Hướng dẫn nằm trên đường dẫn (`/help?q=…`) như bộ lọc các trang khác: F5 hay gửi link vẫn ra đúng các mục đang lọc.

Với người sửa mã: mỗi bước của bài trỏ vào phần tử có thuộc tính `data-tour="…"`. Đổi tên, xoá hay chuyển chỗ một phần tử như vậy thì sửa kịch bản `src/help/tours.ts` cùng lúc rồi chạy lại bài đó; đổi hành vi mà hướng dẫn mô tả thì sửa cả `src/help/content.ts` và README này.

---

## 9e. Trang Trạng thái

Trang **Trạng thái** (`/status`) cho biết ứng dụng có đang nói chuyện được với máy chủ không, phiên đăng nhập còn bao lâu, service worker và cache offline đang thế nào — nơi đầu tiên cần mở khi *"ứng dụng chậm"* hay *"bấm mà không lưu được"*. Mở từ nút lưới → **Trạng thái** (điện thoại: avatar → **Trạng thái**), hoặc gõ *trạng thái* trong Ctrl + K.

**Ngôn ngữ.** Tiêu đề, dòng mô tả và nút **Kiểm tra lại** theo ngôn ngữ của web; **mọi thứ trong các thẻ luôn tiếng Anh** (nhãn, trạng thái, tooltip, "5 seconds ago", số kiểu `1.6 Mbps`), dù web đang ở tiếng Việt — đây là trang kỹ thuật, thuật ngữ gốc đọc chuẩn nhất. Bảng dưới dùng đúng nhãn hiện trên trang.

Trang tự kiểm tra lại **mỗi 30 giây** (chạy ngầm; tab đang ẩn thì tạm dừng, quay lại tab là kiểm tra ngay), hoặc bấm **Kiểm tra lại** để kiểm tra ngay (nút quay trong lúc chờ). Có sáu thẻ, mỗi thẻ một nhãn màu ở góc: xanh (tốt), vàng (chậm / không ổn định), đỏ (lỗi), xám (đang kiểm tra / không áp dụng).

| Thẻ | Có gì |
| --- | --- |
| **Supabase** | **Project host**; **Authentication** (hỏi thẳng máy chủ Auth, xác thực luôn token hiện tại) và **Database (REST API)** (một truy vấn nhỏ nhất qua RLS), mỗi dòng ghi thời gian khứ hồi bằng ms; **Realtime** (*Connected · n of m channels joined* / *Disconnected*); **Last checked**. Nhãn thẻ: *Operational*, *Degraded*, *Down* |
| **Session** | **Account** (tên, email); **Access token expires** — lúc nào và còn bao lâu (tự refresh trước khi hết hạn); **Last signed in**; **User identifier** — các dòng này chọn và chép được để gửi cho admin |
| **Application** | **Display mode**: *Standalone window (installed)* (mở như app đã cài) hay *Browser tab*; bấm F11 thì thành *Fullscreen (installed app)* / *Fullscreen (browser tab)* — cửa sổ app vẫn được nhận là app đã cài; **Service worker**: *Activated and running* / *Waiting, new version ready*; **Precached files**: số tệp và dung lượng app shell được lưu sẵn để mở khi offline; **Installation** — nút **Install app** (Chrome, Edge, Android) hoặc **How to install** (iPhone / iPad), đã cài thì *Installed*; Chrome / Edge chưa mời cài (thường vì app đã cài trên máy, đang mở bằng tab thường) thì *Not offered*, trình duyệt không hỗ trợ cài thì *Not supported*. Chân thẻ: **Build time** và nút **Check for updates** (không có bản mới thì báo *Up to date*; có thì thành **Update now**). Nhãn thẻ *Ready for offline use*, *Update available* (vàng); chạy `npm run dev` thì *Disabled in development* và thẻ chỉ ghi cách thử bản build ([mục 9g](#9g-cài-ứng-dụng-và-dùng-khi-mất-mạng)) |
| **Offline cache** | **Network** online / offline, kèm loại mạng, độ trễ, tốc độ khi trình duyệt cho biết (Chrome, Edge, Android); bốn ô số **Since this tab was opened**: *Reads from server*, *Reads from cache* (bao nhiêu lần do máy chủ chậm quá hạn — *server timeouts*), *Times offline* (tổng bao lâu), *Writes blocked offline*; **IndexedDB cache**: số mục, dung lượng, gồm những gì (shifts, date ranges, action logs, staff profiles, shift templates), *last saved* — chỉ tính mục còn trong hạn 48 giờ. Chân thẻ: **Browser storage** đã dùng / trần, và **Clear cache** (bấm hai lần). Nhãn thẻ: *Online* (xanh), *Serving cached data* (vàng), *Offline* (đỏ) |
| **Cloudflare** | Chỉ có số liệu khi trang **thực sự đi qua Cloudflare**: **Edge location** (ví dụ `HKG · VN`), **Edge response time**, **Connection protocol** HTTP / TLS. Kèm trạng thái chung (**Cloudflare global status**) và **Open incidents** lấy từ cloudflarestatus.com |
| **Netlify** | Tương tự, cho Netlify: edge, độ trễ, **Edge cache status**; trạng thái chung từ netlifystatus.com |

**Màu của từng dòng.** Thời gian phản hồi dưới **500 ms** là xanh, tới **1500 ms** là vàng, hơn nữa hoặc gặp lỗi là đỏ. Realtime mất kết nối thì thẻ Supabase vàng. Phiên còn dưới **5 phút** thì vàng (*Expiring*), hết hạn là đỏ (*Expired*), không có phiên là đỏ (*No session*).

**Cloudflare / Netlify khi chạy local.** Mở app ở `localhost` thì trang không đi qua nhà cung cấp nào, dòng Edge location ghi *Not served through Cloudflare / Netlify* và nhãn thẻ theo trạng thái chung của họ. Khi app đang được chính nhà cung cấp đó phục vụ thì nhãn theo **thời gian phản hồi thật** của app — trạng thái chung của họ gần như lúc nào cũng có sự cố nhỏ ở đâu đó trên thế giới nên để nó quyết định thì thẻ luôn vàng. Sự cố đang mở hiện tối đa 3 dòng (bấm để mở trang sự cố), còn lại gộp thành *+N more*.

Những kiểm tra này chạy **từ trình duyệt của bạn**: trạng thái chung lấy bằng cách gọi trang Statuspage công khai của nhà cung cấp, không gửi dữ liệu ca hay tài khoản đi đâu. Mỗi lần gọi chờ tối đa 10 giây; hỏng thì thử lại một lần. Một lượt tự kiểm tra hỏng trong khi lượt ngay trước còn lấy được thì thẻ vẫn giữ kết quả trước (mạng chập chờn một nhịp không làm thẻ nhảy đỏ); hỏng liền hai lượt (khoảng một phút) thì dòng đó mới ghi *… unreachable* — rê chuột vào để xem lỗi gốc — các thẻ khác vẫn chạy.

**Chế độ dữ liệu mẫu.** Không có Supabase để kiểm tra: thẻ Supabase ghi *Mock data* và thẻ Session ghi *Mock session stored in this browser (localStorage)*; các thẻ còn lại vẫn chạy.

Với người sửa mã: phần thẻ nằm trong `StatusCards`, bọc bởi `FixedLang lang="en"` (`src/i18n/I18nContext.tsx`) — `useI18n()` bên trong trả `t()` tiếng Anh và `dateLocale` enUS. Khoá `status.*` của phần thẻ chỉ có ở từ điển `en` (kiểu `EnglishOnlyKey` trong `translations.ts`; thêm bản `vi` là lỗi biên dịch).

---

## 9f. Giao diện sáng / tối và chữ bôi đen

### Sáng / Tối / Theo hệ thống

Ba lựa chọn: **Hệ thống** (theo cài đặt của thiết bị, đổi theo ngay khi thiết bị đổi), **Sáng**, **Tối**. Đổi bằng ô **Giao diện** trong nút lưới — mỗi lần bấm chuyển một bước **Hệ thống → Sáng → Tối** — hoặc trong avatar trên điện thoại, hoặc gõ *giao diện tối* / *sáng* / *hệ thống* trong Ctrl + K.

Lựa chọn nhớ trên trình duyệt đó (khoá `scheduler.theme`; chọn **Hệ thống** thì không lưu gì, để thiết bị quyết định). Một đoạn script nhỏ trong `index.html` áp giao diện trước khi trang vẽ nên mở ứng dụng ở chế độ tối không bị nháy trắng.

Với người sửa mã: chế độ tối làm bằng cách **định nghĩa lại biến màu Tailwind** dưới `[data-theme='dark']` trong `src/index.css`, không rải `dark:` trong từng component — viết class sáng như bình thường là đủ. Dùng họ màu mới ngoài những họ đã có bản tối (slate, indigo, rose, amber, emerald, sky, violet, teal, orange, lime, fuchsia, cyan) thì phải thêm khối biến tương ứng.

### Chữ không bôi đen được

Cho ra cảm giác app chứ không phải trang web, **mặc định không bôi đen được chữ** (nút, nhãn, tiêu đề). Ô nhập liệu thì luôn gõ và bôi được. Những thông tin đáng chép vẫn chọn được: ghi chú, email, câu báo lỗi của máy chủ, JSON trong Nhật ký, nội dung trang Hướng dẫn, các dòng trên trang Trạng thái. Chữ nằm **trong một nút** thì trình duyệt không cho bôi đen dù có bật.

### Tooltip tự vẽ

Mọi chữ hiện ra khi rê chuột (tên nút chỉ có icon, giờ đầy đủ của một dòng nhật ký, chi tiết một ca trên lịch…) là tooltip **tự vẽ**, không phải tooltip của trình duyệt: cùng kiểu ở mọi máy, theo chế độ tối, không bao giờ tràn ra ngoài màn hình (sát đáy thì hiện lên trên).

- Hiện sau khi dừng chuột khoảng nửa giây; lướt từ nút này sang nút bên cạnh thì hiện ngay, không phải chờ lại.
- Bấm vào là tắt, và không hiện lại cho tới khi chuột rời phần tử đó. Cuộn trang, đổi cỡ cửa sổ hay **Esc** cũng tắt.
- Tab tới bằng bàn phím thì hiện ngay. Trên điện thoại (chạm) không có tooltip.

Với người sửa mã: gắn `data-tooltip="…"` lên phần tử, **không dùng `title`** (sẽ ra tooltip của trình duyệt). `TooltipLayer` (`src/components/Tooltip.tsx`, gắn một lần trong `App.tsx`) nghe sự kiện ở cấp trang nên phần tử thêm sau cũng tự có tooltip. Chữ có `\n` thì xuống dòng.

### Ô chọn tự vẽ

Ô chọn một giá trị, ô tích, ô chọn ngày và chọn nhiều nhân viên đều là thành phần tự vẽ chứ không phải ô gốc của trình duyệt, nên giống nhau ở mọi máy và theo được chế độ tối. Ô ngày gõ được bằng phím (xem [mục 6](#phần-thông-tin-ca)).

---

## 9g. Cài ứng dụng và dùng khi mất mạng

Ứng dụng là một **PWA**: cài được ra màn hình chính / menu Start như app thật, mở trong cửa sổ riêng không có thanh địa chỉ, và **mất mạng vẫn mở được để xem** lịch đã xem lần cuối.

### Cài ứng dụng

| Thiết bị | Cách cài |
| --- | --- |
| Chrome / Edge trên máy tính, Android | Nút lưới → **Cài ứng dụng** (điện thoại: avatar → **Cài ứng dụng**), hoặc biểu tượng cài trên thanh địa chỉ của trình duyệt |
| iPhone / iPad | Mục **Cài ứng dụng** mở hướng dẫn: mở trang bằng Safari → nút **Chia sẻ** → **Thêm vào MH chính** → **Thêm** |

Đã cài, hoặc trình duyệt không cài được (Firefox trên máy tính), thì không có mục này. Giữ lâu biểu tượng app (điện thoại) hay chuột phải ở taskbar (Windows) có lối tắt vào **Lịch**, **Ca của tôi**, **Chờ xác nhận**.

### Khi mất mạng

- **Mở được app.** Toàn bộ giao diện được lưu sẵn trên máy sau lần mở đầu tiên. Phiên đăng nhập vẫn giữ, kể cả khi token đã quá một giờ (có mạng lại thì tự làm mới).
- **Xem được những gì đã xem.** Mỗi lần tải được từ máy chủ — một ngày / tuần / tháng trên Lịch, Ca của tôi, Chờ xác nhận, danh sách nhân viên, ca mẫu, trang Nhật ký đã mở — đều được lưu trên máy. Offline thì app đọc bản lưu đó; phần **chưa mở lúc có mạng trong 2 ngày qua** thì báo *phần này chưa được lưu trên máy*.
- **Băng vàng dưới header** nói rõ đang xem dữ liệu lưu lúc mấy giờ: *Bạn đang offline — đang xem dữ liệu lưu lúc 12:48*. Có wifi mà không tới được máy chủ (mạng chập chờn) thì sau 5 giây app cũng dùng bản lưu và báo *Không kết nối được máy chủ*.
- **Chỉ xem, không ghi.** Tạo / sửa / xoá ca, nhận ca, điểm danh, đổi mật khẩu khi offline đều bị chặn ngay, báo *Bạn đang offline nên chưa gửi gì đi* và form giữ nguyên để bấm lại khi có mạng. App cố ý **không xếp hàng gửi sau**: luật điểm danh tính theo giờ máy chủ, một lượt điểm danh gửi bù lúc có mạng sẽ sai giờ hoặc bị từ chối. Mất mạng giữa lúc đang gửi thì báo *Mất kết nối giữa chừng* — có mạng lại hãy kiểm tra xem thay đổi đã vào chưa.
- **Có mạng lại** thì mọi thứ đang hiện được tải lại ngay (Realtime không báo những gì đổi trong lúc mất mạng), băng vàng tự tắt.
- **Đăng nhập** cần có mạng. **Đăng xuất** lúc offline vẫn được và xoá sạch bản lưu trên máy.

### Bản lưu trên máy

Nằm trong IndexedDB của trình duyệt (`thinkmay-offline`), riêng từng tài khoản: **đăng xuất là xoá hết**, đăng nhập tài khoản khác thì phần của người trước bị xoá. Mỗi phần chỉ giữ **2 ngày** kể từ lần tải gần nhất — lịch cũ hơn dễ sai so với thực tế, nên offline thà báo chưa có còn hơn hiện lịch đã đổi; quá hạn là bị xoá. Tối đa 400 phần mới nhất. Trình duyệt không cho dùng IndexedDB (một số chế độ ẩn danh) thì app chạy bình thường, chỉ là không xem được khi offline. Hồ sơ của người đang đăng nhập (tên, vai trò) lưu thêm ở `localStorage` (`scheduler.offlineProfile`) để mở app offline — cũng bị xoá khi đăng xuất. Muốn xoá bản lưu mà không đăng xuất: trang Trạng thái → thẻ **Offline cache** → **Clear cache**. Ở đó cũng xem được bản lưu gồm những gì.

### Phiên bản mới

Deploy bản mới thì app đang mở **không tự tải lại** (đang điền dở form là mất). App tự hỏi bản mới mỗi giờ và mỗi lần quay lại tab; có bản mới thì hiện hộp **Đã có phiên bản mới** (điện thoại: phía trên nút nổi; máy tính: góc phải dưới) với **Tải lại** / **Để sau**. Để sau thì lần mở app sau sẽ chạy bản mới, hoặc vào trang Trạng thái → **Cập nhật ngay**.

Với người sửa mã:

- Service worker do `vite-plugin-pwa` sinh lúc `build` (cấu hình `VitePWA` trong `vite.config.ts`), chỉ giữ **vỏ ứng dụng** (JS, CSS, icon, `index.html` cho mọi đường dẫn). `npm run dev` không đăng ký service worker — thử offline thì `npm run build && npm run preview` rồi DevTools → Network → Offline.
- Dữ liệu offline không đi qua service worker mà ở tầng backend: `src/data/offlineBackend.ts` bọc backend đang chạy (cả bản mock) — đọc qua mạng trước, hỏng mạng thì lấy bản lưu (`offlineCache.ts`), ghi thì chặn khi offline. Thêm phương thức đọc vào `SchedulerBackend` thì quyết định luôn nó có lưu offline không (bộ bọc là object kiểu `SchedulerBackend`, thiếu là lỗi biên dịch).
- Phần phiên offline nằm trong `src/auth/supabaseAuth.ts` (hồ sơ lưu trên máy, bỏ qua sự kiện `INITIAL_SESSION`, đăng xuất `scope: 'local'` khi offline).
- Icon app: `public/favicon.svg` (bo góc) và `public/app-icon-maskable.svg` (tràn viền, cho Android / iOS); các PNG `pwa-*.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png` dựng từ hai file này — đổi logo thì dựng lại cả bộ.
- Màu thanh tiêu đề / thanh trạng thái khi chạy như app theo giao diện sáng / tối **của máy** ngay từ HTML: `index.html` có hai thẻ `<meta name="theme-color">` với `media` sáng / tối, manifest có thêm bản tối (`user_preferences.color_scheme_dark`, trong `vite.config.ts`). Chỉ trên máy tính, khi chọn hẳn Sáng / Tối trong app, script chống nháy và `ThemeContext.tsx` mới ghi đè cả hai thẻ cho thanh tiêu đề cửa sổ khớp header; trên điện thoại / máy tính bảng (Android, iOS, iPadOS) thanh trạng thái **luôn theo máy**. Lý do: trên Android, app đã cài có thể bỏ qua màu do JS đổi sau khi tải, còn icon thanh trạng thái luôn theo giao diện máy — máy tối mà thanh trắng là mất icon; iOS cũ hơn 26 có thể tô thanh bằng `theme-color` trong khi chữ theo máy, cùng một kiểu lỗi. Từ iOS 26, Safari bỏ qua `theme-color` và lấy màu thanh từ phần tử `sticky` / `fixed` trên cùng rộng ≥ 90% màn hình — tức header (`sticky top-0`, nền `bg-white/90`): đổi header thì giữ nó dính trên cùng, rộng hết màn hình, nền đủ đặc (độ trong ≥ 0,75), không thì thanh trạng thái trên iPhone lệch màu. Các chỗ này và `THEME_COLOR` phải khớp nhau. Đổi màu trong manifest thì app đã cài chỉ nhận sau khi Chrome cập nhật app (có thể mất tới một ngày; gỡ và cài lại để thấy ngay).

---

## 10. Tra cứu nhanh

### Đường dẫn

| URL | Màn hình |
| --- | --- |
| `/` | Lịch, chế độ Ngày, hôm nay |
| `/?view=week` | Lịch, chế độ Tuần |
| `/?view=month&date=2026-09-08` | Lịch tháng 9/2026 |
| `/?date=2026-09-08` | Timeline ngày 08/09/2026 |
| `/shifts` | Tất cả ca |
| `/summary` | Tổng kết, chế độ Tuần, tuần này |
| `/summary?view=month&date=2026-09-08` | Tổng kết tháng 9/2026 |
| `/my-shifts` | Ca của tôi |
| `/pending` | Chờ xác nhận |
| `/logs` | Nhật ký thao tác |
| `/status` | Trạng thái hệ thống |
| `/help` | Hướng dẫn và các bài từng bước |
| `/accounts` | Tài khoản (chỉ admin; người khác bị đưa về `/`) |
| `/login` | Đăng nhập |

Ngày, chế độ xem **và mọi bộ lọc** nằm trong URL nên **gửi link cho đồng nghiệp là họ mở đúng màn hình, đúng bộ lọc bạn đang để**. Đổi bộ lọc không tạo thêm bước trong lịch sử trình duyệt — bấm Back là về trang trước, không lùi qua từng lần tích.

| Trang | Tham số |
| --- | --- |
| Lịch | `date`, `view` (`week` / `month`; Ngày là mặc định), `scale` (thang giờ: `work` / `business` / `full`), `working=1` (Chỉ nhân viên có ca) |
| Tổng kết | `date`, `view` (`day` / `month`; Tuần là mặc định), `all=1` (hiện cả người không có ca) |
| Tất cả ca | `q` (chữ tìm), `tab` (`past` / `all`), `from`, `to`, `staff` (lặp lại được), `order=desc` |
| Chờ xác nhận | `all=1` (bỏ tích Chỉ ca của tôi) |
| Nhật ký | `from`, `to`, `staff` (lặp lại được), `action`, `entity`, `q`, `page` |
| Hướng dẫn | `q` (chữ tìm) |
| Trạng thái, Tài khoản | Không có tham số |

Giá trị mặc định không ghi lên URL, nên link khi chưa lọc gì vẫn gọn như cũ. Ô tìm kiếm (`q` ở Tất cả ca, Nhật ký, Hướng dẫn) lọc ngay theo từng phím nhưng chỉ ghi lên URL khi đã ngừng gõ khoảng 0,3 giây — để bộ gõ tiếng Việt như EVKey / Unikey không bị lộn chữ. Ví dụ `/shifts?tab=past&staff=<id>&order=desc` mở Tất cả ca, tab Đã qua, chỉ ca có người đó, mới nhất lên đầu.

### Quy ước hiển thị

| Dấu hiệu | Ý nghĩa |
| --- | --- |
| Viền nét đứt + 🕐 | Chờ xác nhận |
| Viền liền | Đã xác nhận |
| Nền indigo nhạt + nhãn "Bạn" | Hàng / dòng của chính bạn |
| Viền indigo (chế độ Tháng) | Ca bạn có tham gia |
| Vạch đỏ dọc | Thời điểm hiện tại |
| Dải vàng dưới timeline | Có phân công ngoài khung giờ đang xem |
| Số vàng cạnh "Chờ xác nhận" | Số lượt chờ xác nhận của riêng bạn |

### Phím và thao tác

| Thao tác | Kết quả |
| --- | --- |
| `Esc` | Đóng form, ngăn thông báo, Quick Search hay bài hướng dẫn đang mở |
| Bấm nền tối ngoài form | Đóng form |
| Bấm khối / chip ca | Mở form sửa ca đó |
| Bấm tiêu đề cột ngày (Tuần) | Sang chế độ Ngày |
| `Ctrl + K` (Mac: `⌘K`) | Mở / đóng **Quick Search** (xem bên dưới) |
| Bấm số ngày (Tháng) | Sang chế độ Ngày |

### Quick Search (Ctrl + K)

Bấm **Ctrl + K** ở bất cứ trang nào (trên điện thoại: bấm avatar → **Quick Search**). Gõ để lọc, **↑ ↓** để chọn, **Enter** để chạy, **Esc** để đóng. Gõ không dấu cũng được, tiếng Việt hay tiếng Anh đều tìm ra. Gõ tiếng Anh mà bộ gõ tiếng Việt (EVKey, Unikey) tự thêm dấu — *dark* thành *dảk*, *theme* thành *thêm* — thì bảng tự hiểu lại và ghi *Kết quả cho “dark”*. Chữ nào đoán sai thì thêm vào bảng `TYPO_FIXES` trong `src/lib/autocorrect.ts`.

| Gõ | Được |
| --- | --- |
| Tên trang: *lịch tuần*, *tổng kết*, *nhật ký*… | Đi tới trang đó (Lịch ngày / tuần / tháng, Tất cả ca, Tổng kết, Ca của tôi, Chờ xác nhận, Nhật ký, Trạng thái, Hướng dẫn, Tài khoản với admin) |
| *tạo ca*, *nhận ca mẫu*, *thông báo*, *giao diện tối*, *en* / *vi* (đặt ngôn ngữ), *đổi mật khẩu*, *đăng xuất* | Chạy thao tác đó rồi đóng bảng. Đăng xuất phải Enter hai lần |
| *hướng dẫn*, hay tên một bài (*điểm danh*, *nhận ca mẫu*…) | Mở trang Hướng dẫn, hoặc chạy thẳng bài từng bước đó. Nhóm này luôn nằm cuối danh sách |
| Tên một người: *mai* | **Ca của Mai Le** — mở Tất cả ca, lọc sẵn theo người đó. Chỉ gợi ý khi đã gõ, tối đa 6 người |
| Phép tính: `12*3+4`, `(1+2)^3` | Kết quả — Enter để chép |
| Giờ ± thời lượng: `08:00 + 4h30m`, `22:00 + 3h` | `12:30`, `01:00 (+1 ngày)` |
| Giờ − giờ: `17:30 - 08:15` | `9h 15m` (kèm số phút). Giờ sau nhỏ hơn thì hiểu là qua đêm |
| Thời lượng: `90m`, `1h30 + 45m`, `2 giờ 15 phút` | Đổi ra giờ + phút |
| Ngày ± ngày / tuần: `hôm nay + 10 ngày`, `15/10 - 2w`, `ngày mai` | Ngày đó — Enter để mở lịch ngày đó |
| Ngày − ngày: `20/12 - 15/10` | Số ngày giữa hai ngày |
| `now + 90m` / `bây giờ + 2h` | Giờ và ngày lúc đó |

Ngày viết `dd/mm`, `dd/mm/yyyy` hoặc `yyyy-mm-dd`; thiếu năm thì là năm nay. Đơn vị: `h` / `giờ`, `m` / `phút`, `d` / `ngày`, `w` / `tuần` (viết tiếng Anh cũng được).

---

## 11. Dành cho quản trị viên

### Tạo tài khoản nhân viên

Không có đăng ký công khai, nên tài khoản phải tạo thủ công:

1. Supabase Dashboard → **Authentication → Users → Add user**.
2. Nhập email và mật khẩu, **tích `Auto Confirm User`**.
3. (Nên làm) Thêm user metadata: `{"display_name": "Nguyễn Văn Huy"}`.

Trigger `handle_new_user` tự tạo dòng tương ứng trong bảng `profiles`. Nếu không đặt `display_name`, hệ thống lấy phần trước dấu `@` của email làm tên hiển thị.

### Đặt lại mật khẩu cho nhân viên

Ứng dụng không có luồng tự đặt lại — khi nhân viên báo quên mật khẩu, bạn làm thủ công:

1. Supabase Dashboard → **Authentication → Users**.
2. Tìm tài khoản → menu `···` → **Reset password** (hoặc sửa trực tiếp mật khẩu).
3. Gửi mật khẩu tạm cho nhân viên qua kênh nội bộ.
4. Nhắc họ tự đổi lại bằng mục **Đổi mật khẩu** (nút lưới) sau khi đăng nhập.

### Phong admin

Vai trò nằm ở cột `profiles.role` (`staff` | `admin`), có từ migration 005. Chỉ đổi được trong **SQL Editor** — không có đường nào trong ứng dụng, và nhân viên tự sửa dòng của mình cũng bị database từ chối:

```sql
update public.profiles set role = 'admin' where email = 'ban@congty.vn';
```

Người được phong cần tải lại trang để giao diện nhận vai trò mới.

Việc của admin khi nhân viên quên điểm danh: mở trang **Chờ xác nhận**, bỏ tích *Chỉ ca của tôi*, bấm **✓ Xác nhận** trên lượt của người đó.

> Nếu timeline báo *"Chưa có tài khoản nhân viên"* thì bảng `profiles` đang rỗng — hãy tạo tài khoản trước khi phân ca.

### Trang Tài khoản

Chỉ admin thấy ô **Tài khoản** trong nút lưới ở góc phải trên cùng (mobile: trong sheet mở ra khi bấm avatar). Người khác mở thẳng `/accounts` sẽ bị đưa về trang Lịch. Cần chạy `supabase/007_accounts.sql`; chưa chạy thì trang hiện thông báo vàng và không sửa được gì.

Mỗi dòng là một tài khoản, kèm email và vai trò:

| Thao tác | Cách làm |
| --- | --- |
| Đổi tên hiển thị | Sửa ô tên — **tự lưu** khi rời ô hoặc bấm Enter. **Esc** trả lại tên đang lưu. Để trống thì tên cũ được giữ nguyên |
| Hiện / ẩn trên bảng | Bấm công tắc **Đang hiện / Đang ẩn** — **tự lưu** ngay |

Không có nút Lưu. Mỗi lần lưu báo bằng [thông báo](#9c-thông-báo); lỗi thì ô quay về giá trị cũ.

**Ẩn** dành cho tài khoản chỉ vào để xem, ví dụ quản lý xem tổng: người đang ẩn không hiện trên Lịch ngày / tuần, Tổng kết, ô chọn nhân viên trong form ca và bộ lọc ở trang Tất cả ca. Họ vẫn đăng nhập và dùng web bình thường. Nếu người đang ẩn **có ca** trong khoảng đang xem thì dòng của họ vẫn hiện — ẩn người không làm mất ca. Nhật ký vẫn liệt kê họ khi lọc theo người.

Đổi email hay vai trò không làm ở đây: email theo tài khoản đăng nhập, vai trò đổi trong SQL Editor (mục trên).

Database chặn thật: chỉ admin sửa được tên hiển thị và hiện / ẩn, của bất kỳ ai. Người khác — kể cả sửa dòng của chính mình, kể cả gọi thẳng Supabase API — bị từ chối với *Bạn không có quyền sửa tài khoản.* Thay đổi ở trang này không ghi vào Nhật ký.

### Thiết lập Auth cần thiết

| Mục | Giá trị |
| --- | --- |
| Email provider | **Bật** |
| Confirm email | **Tắt** (tài khoản do admin tạo sẵn) |
| Allow new users to sign up | **Tắt** — đây là thứ chặn đăng ký công khai |
| Site URL | `http://localhost:5173` (đổi khi deploy) |
| Redirect URLs | `http://localhost:5173/**` |

### Phân quyền

**Anon không có quyền gì.** Mọi nhân viên đã đăng nhập đều **xem** được tất cả ca, thông tin nhân viên, Tổng kết và Nhật ký. Luật nào cần chặn thật thì đặt ở database (RLS, trigger, `check`, `now()` của máy chủ); giao diện chỉ phản ánh lại những gì database sẽ từ chối.

| Việc | Ai làm được | Cần chạy |
| --- | --- | --- |
| Tạo ca, nhận ca (thêm **chính mình** vào ca), nhận ca mẫu | Mọi nhân viên | `schema.sql`, 002 |
| Điểm danh, sửa giờ / ghi chú phần của mình, rời ca, xoá ca trống / ca chỉ có mình | Nhân viên, **trong các giới hạn** ở [mục 8b](#8b-chấm-công-và-luật-điểm-danh) | 005, 006 |
| Thêm / sửa / gỡ lượt của **người khác**, bỏ điểm danh, điểm danh hộ, sửa tên – ngày – giờ của ca có người khác, xoá ca có người khác | Chỉ **admin** | 005, 006 |
| Tạo / sửa / bật-tắt / xoá ca mẫu | Chỉ **admin** (nhân viên chỉ nhận) | 008 |
| Đổi tên hiển thị, hiện / ẩn người trên bảng | Chỉ **admin**, của bất kỳ ai | 007 |
| Phong admin | Chỉ làm tay trong SQL Editor ([mục 11](#phong-admin)) | 005 |
| Sửa / xoá / tạo dòng Nhật ký | **Không ai** qua ứng dụng ([mục 9b](#9b-nhật-ký-thao-tác)) | 003 |

Chưa chạy 005 thì cột `profiles.role` chưa có và **không áp luật nào**: mọi người sửa được mọi ca như bản đầu tiên. Danh sách còn chưa chặn: xem [roadmap.md](roadmap.md).

---

## 12. Cấu trúc mã nguồn

```
src/
├── auth/           # Xác thực: interface + bản mock + bản Supabase
├── data/           # Truy cập dữ liệu: interface, hai backend, bộ bọc offline + bản lưu IndexedDB, bộ đệm ca (shiftStore), ScheduleContext (hook đọc / ghi)
├── components/     # Timeline, WeekGrid, MonthGrid, SummaryGrid, form ca, Modal, Select, Checkbox, DateInput, header, menu…
├── pages/          # Login, Lịch, Tất cả ca, Tổng kết, Ca của tôi, Chờ xác nhận, Nhật ký, Trạng thái, Tài khoản, Hướng dẫn
├── help/           # Nội dung trang Hướng dẫn (content.ts), kịch bản wizard (tours.ts), TourProvider
├── notifications/  # Thông báo: popup + ngăn thông báo, lưu ở localStorage
├── pwa/            # Service worker (đăng ký, bản mới) và cài ứng dụng
├── theme/          # Sáng / Tối / Hệ thống
├── i18n/           # Từ điển vi/en và provider
├── lib/            # Hàm thuần: thời gian, màu, tổng kết, luật điểm danh phía client, lọc, URL, các probe của trang Trạng thái…
└── types.ts        # Kiểu dữ liệu, khớp 1:1 với cột trong Supabase
supabase/           # schema.sql rồi 002…009, chạy tay theo thứ tự trong SQL Editor
```

Thứ tự bọc của ứng dụng: `ThemeProvider → I18nProvider → AuthProvider → BrowserRouter`; các trang cần đăng nhập nằm trong `ProtectedRoute`, bên trong là `NotificationProvider → ScheduleProvider → ShiftEditorProvider → TourProvider → AppLayout`.

Hai file quyết định backend nào đang chạy:

- `src/data/index.ts` — chọn `supabaseBackend` hoặc `mockBackend`, rồi bọc trong `withOfflineCache` ([mục 9g](#9g-cài-ứng-dụng-và-dùng-khi-mất-mạng))
- `src/auth/index.ts` — chọn `supabaseAuth` hoặc `mockAuth`

Cả hai tự động dựa vào việc `.env` có được cấu hình hay không. Giao diện không import trực tiếp bất kỳ backend nào (đọc qua hook, ghi qua `useSchedule()` — các hàm ghi tự làm tươi màn hình sau khi lưu), nên đổi backend không phải sửa component. Thêm gì vào `SchedulerBackend` hay `AuthBackend` thì viết ở **cả hai** bản, và bản mock phải hành xử giống bản thật, kể cả nhật ký.

### Luật chấm công nằm ở ba nơi

Luật điểm danh ([mục 8b](#8b-chấm-công-và-luật-điểm-danh)) tồn tại ở **ba chỗ phải giữ khớp nhau**: trigger trong SQL (`005_attendance.sql`, bản mới nhất của hai hàm trigger ở `006_shift_rules.sql` — sửa luật thì viết migration mới ghi đè hàm, không sửa file đã chạy), `src/lib/attendance.ts` (bản sao phía client để khoá nút và giải thích vì sao), và `mockBackend.ts` (để chế độ dữ liệu mẫu cư xử giống). Ca mẫu chỉ admin: trigger trong `008_template_admin.sql` và `canManageTemplates` phía client.

### Thêm ngôn ngữ, chuỗi, màu

- Mọi chuỗi người dùng thấy đi qua `t()` — trừ tên sản phẩm (`src/lib/brand.ts`) và nội dung trang Hướng dẫn (`src/help/`, viết thẳng dạng `Record<Lang, …>`). Thêm khoá vào bản `en` trước (nguồn của kiểu `TranslationKey`) rồi `vi`; thiếu ở `vi` là lỗi biên dịch. Số nhiều: `foo_one` / `foo_other` + `t('foo', { count })`; chèn giá trị: `{{name}}`.
- Class Tailwind phải viết nguyên chuỗi, không ghép từ mảnh lúc chạy (`bg-${x}-50` sẽ không được sinh) — xem `PALETTE` trong `src/lib/colors.ts`.
- Bộ lọc của trang nằm trên URL qua `useUrlParams()` (`src/lib/urlParams.ts`); thêm tham số mới thì thêm vào bảng ở [mục 10](#đường-dẫn).
- Giờ là chuỗi `HH:mm`, ngày là chuỗi `yyyy-MM-dd` theo **giờ máy** — dùng `toDateKey` / `fromDateKey` trong `src/lib/time.ts`, không dùng `toISOString()` (lệch ngày vì UTC). Giờ Postgres trả về (`HH:mm:ss`) qua `normalizeTime`.
- Quy ước chi tiết cho người (và công cụ) sửa mã nằm ở [CLAUDE.md](../CLAUDE.md) ở gốc repo.

### Tải ca theo lát cắt

Ứng dụng **không bao giờ tải toàn bộ ca**. Mỗi màn hình xin đúng phần nó hiển thị qua `useShifts(query)` trong `src/data/ScheduleContext.tsx`:

| Màn hình | Lát cắt |
| --- | --- |
| Lịch, Tổng kết | Đúng ngày / tuần / tháng đang xem (tháng của Lịch đệm cho tròn tuần) |
| Hộp thoại nhận ca | Các ngày đang hiện trên lịch chọn |
| Tất cả ca | Từng tháng trong khoảng của tab (thu hẹp thêm bởi bộ lọc), theo chiều sắp xếp, tải khi cuộn tới đáy |
| Ca của tôi | Ca có mình (lọc ở database) |
| Chờ xác nhận + số đếm trên nav | Ca còn lượt chờ (lọc ở database), dùng chung một lát |

Bộ đệm nằm ở `src/data/shiftStore.ts`: lát cắt đang xem được làm tươi khi có thay đổi (giữ dữ liệu cũ trên màn hình trong lúc chờ), lát không ai xem thì bị bỏ. Lịch và Tổng kết tải trước khoảng liền trước/sau để bấm `‹ ›` không phải chờ.

### Giới hạn đã biết

- Khi đã cuộn sâu nhiều tháng ở trang Tất cả ca, mỗi thay đổi qua Realtime làm tươi lại **từng tháng đang hiển thị** (mỗi tháng một truy vấn nhỏ có index). Đổi tab hoặc bộ lọc thì quay về một tháng.
- **Ca của tôi** tải toàn bộ lịch sử của *một* người (cần cho ô tổng số lượt). Nhẹ hơn nhiều so với cả nhóm, nhưng vẫn tăng dần theo thời gian.
- Bundle khoảng 880 KB (gzip khoảng 245 KB), chưa tách code; `build` có cảnh báo chunk lớn hơn 500 KB. Service worker tải sẵn cả bundle ở lần mở đầu (~970 KB chưa nén).
- Offline chỉ xem được, không ghi; chỉ xem được những phần đã mở lúc có mạng ([mục 9g](#9g-cài-ứng-dụng-và-dùng-khi-mất-mạng)).
- Ca qua nửa đêm (22:00 → 02:00) chưa được hỗ trợ: ràng buộc `end_time > start_time` yêu cầu ca nằm gọn trong một ngày.
- Tổng kết tính lại từ dữ liệu hiện có mỗi lần mở, không phải ảnh chụp bất biến ([mục 8c](#8c-trang-tổng-kết)).
- Ca đã qua mà trống, hoặc chỉ có mình chưa điểm danh: nhân viên vẫn sửa được giờ / tên. Xem phần "Chưa làm" trong [roadmap.md](roadmap.md).
