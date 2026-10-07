# Thinkmay Team Board

Ứng dụng xếp ca nội bộ cho nhân viên. React + Vite + TypeScript + Tailwind, backend là Supabase (Postgres + Auth + Realtime).

Mô hình dữ liệu cốt lõi: **một ca chứa nhiều lượt phân công**, mỗi nhân viên trong ca có khung giờ riêng.

```
Ca: Trực trang, 08:00–18:00
├── Huy    08:00–12:00   đã xác nhận
├── Thiên  10:00–16:00   đã xác nhận
└── An     15:00–18:00   chờ xác nhận
```

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
- [8b. Chấm công và tính công](#8b-chấm-công-và-tính-công)
- [9. Đa ngôn ngữ và cập nhật thời gian thực](#9-đa-ngôn-ngữ-và-cập-nhật-thời-gian-thực)
- [9b. Nhật ký thao tác](#9b-nhật-ký-thao-tác)
- [9c. Thông báo](#9c-thông-báo)
- [10. Tra cứu nhanh](#10-tra-cứu-nhanh)
- [11. Dành cho quản trị viên](#11-dành-cho-quản-trị-viên)
- [12. Cấu trúc mã nguồn](#12-cấu-trúc-mã-nguồn)

---

## 1. Chạy dự án

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # kiểm tra kiểu + build production
npm run lint
```

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
| `supabase/005_attendance.sql` | Chấm công: cột `profiles.role`, `shift_assignments.confirmed_at` và các trigger luật điểm danh ([mục 8b](#8b-chấm-công-và-tính-công)) |
| `supabase/006_shift_rules.sql` | Nhân viên chỉ thao tác phần của mình: rời ca trong 30 phút, không thêm / sửa / gỡ người khác, không sửa / xoá ca có người khác ([mục 8b](#8b-chấm-công-và-tính-công)). Cần 005 trước; thay luật "ca tạo quá 30 phút không xoá được" của 005 |
| `supabase/007_accounts.sql` | Trang Tài khoản: cột `profiles.displayed` (hiện / ẩn trên bảng), admin sửa được mọi tài khoản, người khác không sửa được ([mục 11](#trang-tài-khoản)). Cần 005 trước |
| `supabase/008_template_admin.sql` | Chỉ admin tạo / sửa / bật-tắt / xoá ca mẫu; nhân viên vẫn nhận ca mẫu bình thường ([mục 7](#quản-lý-ca-mẫu)). Cần 002 và 005 trước |

Chưa chạy 002 hay 003 thì ứng dụng **vẫn chạy bình thường** — chỉ hiện thông báo vàng ở khu vực ca mẫu / trang Nhật ký. Chưa chạy 005 thì không có luật chấm công nào: ai cũng xác nhận được mọi ca như trước.

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
- Nếu bạn dán một đường dẫn sâu (ví dụ `/pending`) khi chưa đăng nhập, hệ thống ghi nhớ và **đưa bạn về đúng trang đó** sau khi đăng nhập xong.
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
| **Ca của tôi** | Chỉ những ca bạn được phân công |
| **Chờ xác nhận** | Các lượt phân công chưa xác nhận — có **số đếm** hiển thị ngay trên nhãn |
| **Nhật ký** | Nhật ký thao tác, chỉ đọc ([mục 9b](#9b-nhật-ký-thao-tác)) |
| **VI / EN** | Đổi ngôn ngữ giao diện |
| **Tạo ca** (nút xanh) | Mở form tạo ca mới, mặc định là **hôm nay** |
| ⋮⋮⋮ (nút lưới, ngoài cùng bên phải) | Mở bảng các ô: **Tài khoản** (chỉ admin thấy — sửa tên hiển thị, hiện / ẩn người trên bảng, [mục 11](#trang-tài-khoản)), **Thông báo** (số đỏ trên nút là số chưa đọc, [mục 9c](#9c-thông-báo)), **Giao diện** (bấm để đổi Hệ thống → Sáng → Tối), **Trạng thái** (kết nối tới máy chủ và phiên đăng nhập), **Đổi mật khẩu**, **Đăng xuất** |
| Avatar + tên | Tài khoản đang đăng nhập, kèm nhãn vai trò **Admin** / **Staff** (giống nhau ở cả hai ngôn ngữ) |

Trên điện thoại không có nút lưới: chuông 🔔 nằm riêng, còn giao diện, đổi mật khẩu, đăng xuất nằm trong bảng mở ra khi bấm avatar.

Màn hình chưa đủ rộng để xếp cả hàng (dưới 1320px) thì thanh chia hai dòng: logo và các nút ở trên, các mục điều hướng xếp thành dải bên dưới. Không mục nào bị ẩn.

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

- **Thanh ca mẫu** để nhận ca nhanh (xem [mục 7](#7-ca-mẫu-và-nhận-ca-nhanh)).
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

> Chế độ Tuần và Ngày có ô tích **"Chỉ nhân viên có ca"** để ẩn những người không được phân công, giúp lưới gọn lại khi công ty đông người.

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
| Nút **Tạo ca** trên thanh điều hướng | Ca mới, ngày = hôm nay |
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

- Nút **Điểm danh** theo đúng luật ở [mục 8b](#8b-chấm-công-và-tính-công): chưa tới giờ thì hiện *Mở điểm danh lúc …*, quá giờ thì *Hết giờ điểm danh — bạn không có quyền điểm danh trễ*. Điểm danh trước giờ bắt đầu (trong 30 phút sớm) sẽ được hỏi lại một lần.
- Vừa đổi giờ mà chưa lưu thì không điểm danh được: lưu giờ mới trước.
- **Rời ca** hỏi lại một lần trước khi gỡ bạn khỏi ca. Nhân viên chỉ tự rời được trong **30 phút đầu** sau khi nhận ca — nút ghi rõ hạn (*Rời ca · tới 16:34*); quá hạn thì nút được thay bằng câu *Đã nhận ca quá 30 phút — bạn không còn quyền rời ca*.

**Nâng cao** là form đầy đủ mô tả ở các phần dưới: sửa thông tin ca, thêm/gỡ/sửa người khác, xoá ca. Hai chế độ dùng chung một bản nháp — sửa dở ở bên này rồi chuyển sang bên kia vẫn còn.

### Phần thông tin ca

**Tiêu đề**, **Ngày**, **Bắt đầu**, **Kết thúc**, **Ghi chú** (không bắt buộc).

Khung giờ ở đây là khung giờ *tổng* của ca. Từng nhân viên vẫn có giờ riêng bên dưới.

### Phần nhân viên trong ca

Mỗi dòng gồm: **chọn người** · **Từ** · **Đến** · **Trạng thái** · nút xoá · ô ghi chú riêng cho người đó.

- **Thêm nhân viên**: thêm một dòng mới, mặc định lấy khung giờ của ca và trạng thái *Chờ xác nhận*. Với nhân viên thường, nút này là **Thêm tôi vào ca** — chỉ admin thêm được người khác ([mục 8b](#8b-chấm-công-và-tính-công)).
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

Nhân viên chỉ xoá được ca **đang trống**, hoặc ca **chỉ có chính mình** khi bạn **còn rời được** (chưa điểm danh, chưa quá 30 phút kể từ lúc nhận). Không xoá được thì nút **Xoá** được thay bằng câu giải thích, chỉ admin xoá được ([mục 8b](#8b-chấm-công-và-tính-công)).

### Đóng form

Ba cách: nút **✕**, phím **Esc**, hoặc bấm ra vùng nền tối bên ngoài. Thay đổi chưa lưu sẽ bị bỏ.

---

## 7. Ca mẫu và nhận ca nhanh

Ca mẫu là **định nghĩa ca lặp lại** — ví dụ *Trực trang 08:00–18:00, Thứ 2 đến Thứ 6*. Nhân viên nhận ca chỉ bằng một cú bấm, không phải điền form.

Thanh ca mẫu nằm ngay trên timeline, **chỉ có ở chế độ Ngày** (vì nhận ca luôn gắn với một ngày cụ thể).

### Nhận ca

Mỗi ca mẫu lặp vào thứ đó hiện thành một chip: `● Trực trang  08:00 – 18:00  [+ Nhận ca]`

Bấm **Nhận ca** sẽ mở hộp thoại **chọn ngày** — bạn không bị mặc định nhận vào ngày đang xem, và **chọn được nhiều ngày cùng lúc**.

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

Bấm **Quản lý ca mẫu** ở góc phải thanh ca mẫu. **Chỉ admin** thấy nút này (cần chạy `supabase/008_template_admin.sql`): nhân viên chỉ nhận ca mẫu, không tạo, sửa, bật/tắt hay xoá được — database cũng chặn, gọi thẳng API sẽ nhận *Bạn không có quyền sửa ca mẫu.* Khi chưa có ca mẫu nào, nhân viên thấy dòng *Chưa có ca mẫu nào — admin sẽ tạo.*

- **Tạo ca mẫu**: tiêu đề, giờ bắt đầu/kết thúc, ghi chú.
- **Lặp vào**: chọn các thứ trong tuần. **Không chọn thứ nào = lặp mọi ngày.**
- **Màu**: mọi ca nhận từ ca mẫu này hiện đúng màu đã chọn ở mọi chế độ xem. Ca tạo bằng nút **Tạo ca** thì có màu ngẫu nhiên (cố định theo từng ca).
- **Đang dùng**: bỏ tích để tạm ngừng — mẫu vẫn được lưu nhưng không ai nhận được nữa.
- **Xoá ca mẫu**: các ca đã tạo từ mẫu đó **vẫn được giữ nguyên**, chỉ mất liên kết với mẫu.

### Nếu thấy thông báo vàng "Chưa cài đặt tính năng ca mẫu"

Nghĩa là file `supabase/002_shift_templates.sql` chưa được chạy. Mọi phần khác của ứng dụng vẫn hoạt động bình thường.

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
  | **Từ ngày / Đến ngày** | Thu hẹp **bên trong** tab: tab *Sắp tới* không chọn được ngày đã qua, và ngược lại |
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

## 8b. Chấm công và tính công

**Chấm công = xác nhận.** Bấm **✓ Xác nhận** trên lượt phân công của mình là điểm danh cho lượt đó. **Tính công** là trang **Tổng kết**: nó chỉ cộng những lượt đã xác nhận *và* đã qua giờ kết thúc của riêng người đó, theo ngày / tuần / tháng, ra số lượt và tổng giờ của từng người.

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

Trong form sửa ca, dòng đã điểm danh bị khoá kèm biểu tượng 🔒, ô **Trạng thái** không đổi tay được, và nút **Xoá** được thay bằng câu giải thích khi ca không còn xoá được. Dòng của người khác bị khoá toàn bộ, dòng của bạn đã quá 30 phút thì khoá nút thùng rác, kèm lý do bên dưới. Ô chọn người luôn khoá với nhân viên thường. Ca có người khác thì tên, ngày và giờ của ca cũng bị khoá — ô ghi chú của ca vẫn mở.

Giờ tính theo **đồng hồ máy chủ, múi giờ Việt Nam** — chỉnh đồng hồ máy mình không có tác dụng. Mọi luật nằm trong trigger của database nên gọi thẳng Supabase API cũng không lách được; giao diện chỉ ẩn sẵn những gì database sẽ từ chối. Mọi can thiệp của admin đều vào [Nhật ký](#9b-nhật-ký-thao-tác).

Ca mẫu chỉ admin quản lý (sau khi chạy `008_template_admin.sql`, xem [mục 7](#quản-lý-ca-mẫu)). Phần còn chưa chặn: xem [roadmap.md](roadmap.md).

---

## 9. Đa ngôn ngữ và cập nhật thời gian thực

**Ngôn ngữ.** Mặc định tiếng Việt. Nút **VI / EN** ở thanh trên đổi toàn bộ giao diện, kể cả định dạng ngày tháng (*Thứ Hai, 8 tháng 9 2026* ↔ *Monday, 8 September 2026*). Lựa chọn được ghi nhớ cho lần sau.

**Thời gian thực.** Ứng dụng lắng nghe thay đổi trên `shifts`, `shift_assignments` và `shift_templates` qua Supabase Realtime. Khi đồng nghiệp tạo ca, nhận ca hay xác nhận, màn hình của bạn **tự cập nhật** — không cần F5.

---

## 9b. Nhật ký thao tác

Trang **Nhật ký** ghi lại mọi thay đổi dữ liệu: tạo/sửa/xoá ca, thêm/gỡ nhân viên, nhận ca, đổi trạng thái, và tạo/sửa/xoá/bật-tắt ca mẫu.

Mỗi dòng gồm thời điểm, người thực hiện, hành động, loại đối tượng và câu mô tả. Bấm **Chi tiết** để xem `old_data` / `new_data` / ngữ cảnh dạng JSON — đủ để đối chiếu chính xác đã đổi trường nào.

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

**Bộ lọc**: từ ngày, đến ngày, nhân viên liên quan, hành động, loại đối tượng, và tìm kiếm trong phần mô tả. Phân trang 50 dòng mỗi trang, không tải toàn bộ.

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

**Ngăn thông báo** (nút lưới → **Thông báo**; trên điện thoại là nút 🔔. Số đỏ là số chưa đọc). Giống Action Center của Windows: trượt ra từ mép phải, thông báo nhóm theo ngày, mới nhất ở trên.

| Thao tác | Cách làm |
| --- | --- |
| Đánh dấu đã đọc | Bấm vào thông báo, hoặc nút phong bì bên phải nó |
| Đánh dấu chưa đọc lại | Nút phong bì trên thông báo đã đọc |
| Xoá một thông báo | Nút **✕** bên phải nó |
| Đánh dấu tất cả đã đọc / Xoá tất cả | Hai nút ở đầu ngăn |

Trên máy tính, hai nút của từng thông báo chỉ hiện khi rê chuột vào; trên điện thoại chúng luôn hiện.

**Lưu ở đâu.** Thông báo nằm trong `localStorage` của trình duyệt, riêng cho từng tài khoản (`scheduler.notifications.<id>`), giữ tối đa 200 cái gần nhất. **Không đồng bộ** giữa các máy và không gửi lên máy chủ: xoá dữ liệu trình duyệt là mất. Các tab cùng trình duyệt thì thấy chung. Muốn biết chắc ai đã làm gì, xem [Nhật ký](#9b-nhật-ký-thao-tác) — đó mới là bản ghi của máy chủ.

Lỗi nhập liệu (thiếu tiêu đề, giờ kết thúc trước giờ bắt đầu, mật khẩu quá ngắn…) vẫn hiện ngay dưới ô nhập như cũ — đó không phải phản hồi từ máy chủ. Form đăng nhập cũng giữ dòng báo lỗi riêng, vì lúc đó chưa có tài khoản để gắn thông báo.

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
| `/my-shifts` | Ca của tôi |
| `/pending` | Chờ xác nhận |
| `/logs` | Nhật ký thao tác |
| `/accounts` | Tài khoản (chỉ admin; người khác bị đưa về `/`) |
| `/login` | Đăng nhập |

Ngày và chế độ xem nằm trong URL nên **gửi link cho đồng nghiệp là họ mở đúng màn hình bạn đang xem**.

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
| `Esc` | Đóng form đang mở |
| Bấm nền tối ngoài form | Đóng form |
| Bấm khối / chip ca | Mở form sửa ca đó |
| Bấm tiêu đề cột ngày (Tuần) | Sang chế độ Ngày |
| `Ctrl + K` (Mac: `⌘K`) | Mở / đóng **bảng tìm nhanh** (xem bên dưới) |
| Bấm số ngày (Tháng) | Sang chế độ Ngày |

### Tìm nhanh (Ctrl + K)

Bấm **Ctrl + K** ở bất cứ trang nào (trên điện thoại: bấm avatar → **Tìm nhanh**). Gõ để lọc, **↑ ↓** để chọn, **Enter** để chạy, **Esc** để đóng. Gõ không dấu cũng được, tiếng Việt hay tiếng Anh đều tìm ra.

| Gõ | Được |
| --- | --- |
| Tên trang: *lịch tuần*, *tổng kết*, *nhật ký*… | Đi tới trang đó (Lịch ngày / tuần / tháng, Tất cả ca, Tổng kết, Ca của tôi, Chờ xác nhận, Nhật ký, Trạng thái, Tài khoản với admin) |
| *tạo ca*, *thông báo*, *giao diện tối*, *ngôn ngữ*, *đổi mật khẩu*, *đăng xuất* | Chạy thao tác đó. Đăng xuất phải Enter hai lần |
| Tên một người: *mai* | **Ca của Mai Le** — mở Tất cả ca, lọc sẵn theo người đó |
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

**Anon không có quyền gì.** Mọi nhân viên đã đăng nhập đều xem được tất cả ca và tạo/sửa được ca, kể cả ca của người khác — đây là chủ ý cho công cụ nội bộ. Ngoại lệ là các luật chấm công ở [mục 8b](#8b-chấm-công-và-tính-công) (sau khi chạy migration 005): những việc đó chỉ admin làm được.

---

## 12. Cấu trúc mã nguồn

```
src/
├── auth/           # Xác thực: interface + bản mock + bản Supabase
├── data/           # Truy cập dữ liệu: interface + bản mock + bản Supabase
├── components/     # Timeline, WeekGrid, MonthGrid, các modal, layout
├── pages/          # Login, Lịch, Tất cả ca, Ca của tôi, Chờ xác nhận
├── i18n/           # Từ điển vi/en và provider
├── lib/            # Tiện ích thời gian, màu sắc, Supabase client
└── types.ts        # Kiểu dữ liệu, khớp 1:1 với cột trong Supabase
```

Hai file quyết định backend nào đang chạy:

- `src/data/index.ts` — chọn `supabaseBackend` hoặc `mockBackend`
- `src/auth/index.ts` — chọn `supabaseAuth` hoặc `mockAuth`

Cả hai tự động dựa vào việc `.env` có được cấu hình hay không. Giao diện không import trực tiếp bất kỳ backend nào, nên đổi backend không phải sửa component.

### Tải ca theo lát cắt

Ứng dụng **không bao giờ tải toàn bộ ca**. Mỗi màn hình xin đúng phần nó hiển thị qua `useShifts(query)` trong `src/data/ScheduleContext.tsx`:

| Màn hình | Lát cắt |
| --- | --- |
| Lịch, Tổng kết | Đúng ngày / tuần / tháng đang xem (tháng của Lịch đệm cho tròn tuần) |
| Thanh ca mẫu | Ngày đang xem — trùng khoá với Lịch nên không tải thêm |
| Hộp thoại nhận ca | Các ngày đang hiện trên lịch chọn |
| Tất cả ca | Từng tháng trong khoảng của tab (thu hẹp thêm bởi bộ lọc), theo chiều sắp xếp, tải khi cuộn tới đáy |
| Ca của tôi | Ca có mình (lọc ở database) |
| Chờ xác nhận + số đếm trên nav | Ca còn lượt chờ (lọc ở database), dùng chung một lát |

Bộ đệm nằm ở `src/data/shiftStore.ts`: lát cắt đang xem được làm tươi khi có thay đổi (giữ dữ liệu cũ trên màn hình trong lúc chờ), lát không ai xem thì bị bỏ. Lịch và Tổng kết tải trước khoảng liền trước/sau để bấm `‹ ›` không phải chờ.

### Giới hạn đã biết

- Khi đã cuộn sâu nhiều tháng ở trang Tất cả ca, mỗi thay đổi qua Realtime làm tươi lại **từng tháng đang hiển thị** (mỗi tháng một truy vấn nhỏ có index). Đổi tab hoặc bộ lọc thì quay về một tháng.
- **Ca của tôi** tải toàn bộ lịch sử của *một* người (cần cho ô tổng số lượt). Nhẹ hơn nhiều so với cả nhóm, nhưng vẫn tăng dần theo thời gian.
- Bundle khoảng 590 KB (chủ yếu là `supabase-js`), chưa tách code.
- Ca qua nửa đêm (22:00 → 02:00) chưa được hỗ trợ: ràng buộc `end_time > start_time` yêu cầu ca nằm gọn trong một ngày.
