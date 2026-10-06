# Roadmap — Phân quyền và luật điểm danh

Trạng thái hiện tại của ứng dụng nằm ở [README.md](README.md).

**Đã làm** trong `supabase/005_attendance.sql` (README mục 8b): vai trò `staff` / `admin`, ba luật đầu ở mục 1, khoá lượt đã điểm danh (bỏ điểm danh, sửa giờ, gỡ), chặn xoá và dời ngày ca đã có người điểm danh, cột `confirmed_at`.

**Đã làm** trong `supabase/006_shift_rules.sql`: luật 4 được thay — bỏ hạn "ca tạo quá 30 phút không xoá được". Nhân viên chỉ thao tác phần của mình: tự rời ca chỉ trong 30 phút đầu sau khi nhận; chỉ admin thêm, sửa hay gỡ người khác (cả lượt đang chờ); ca có người khác thì chỉ admin sửa tên / ngày / giờ ca và xoá ca (ghi chú của ca ai cũng sửa được); ca chỉ có mình thì xoá được khi còn rời được (bịt đường lách "xoá ca thay cho rời ca"); ca trống xoá lúc nào cũng được.

Các câu hỏi treo được chốt theo đề xuất: cửa sổ tính theo **giờ riêng**, nhắn admin **ngoài** ứng dụng, phong admin **bằng tay** trong SQL Editor.

**Chưa làm**:

- Ca mẫu về tay admin (mục 2.1, dòng cuối).
- Ca đã qua mà trống, hoặc chỉ có mình chưa điểm danh: nhân viên vẫn sửa giờ / tên tự do (ca có người khác thì đã khoá từ 006).
- Ca qua nửa đêm.

Phần dưới là ghi chú thiết kế gốc, giữ lại để biết vì sao có các luật này.

Bối cảnh: hôm nay cả nhóm ngang hàng nhau — mọi nhân viên đăng nhập đều xem và sửa được tất cả ca, kể cả ca của người khác. Đó là chủ ý cho công cụ nội bộ khi cả nhóm tin nhau. Mốc cần làm chặt là **khi tuyển nhân viên mới** mà không muốn họ ngang hàng với nhóm hiện tại.

Trong tài liệu này **điểm danh = xác nhận** (`shift_assignments.status` chuyển `pending` → `confirmed`).

---

## 1. Luật đã chốt

| # | Luật | Ghi chú |
| --- | --- | --- |
| 1 | Điểm danh chỉ được trong khoảng **từ trước ca 30 phút đến khi ca kết thúc** | Sớm hơn 30 phút: không cho. |
| 2 | **Không điểm danh trễ.** Qua giờ kết thúc là hết cửa | Trực thật mà quên bấm thì nhắn admin duyệt thủ công. Nhân viên **không** có quyền tự điểm danh trễ. |
| 3 | Mỗi người chỉ điểm danh **ca của mình**. Admin điểm danh được cho người khác | |
| 4 | **Không xoá ca đã tạo quá 30 phút** | Quá hạn thì xoá phải qua admin. |

Cả bốn luật đều cần **vai trò** (`staff` / `admin`) — thứ hiện chưa tồn tại trong dữ liệu. Đó là việc phải làm trước tiên.

---

## 2. Cần chốt thêm

Những chỗ luật trên chưa nói tới nhưng sẽ chặn việc triển khai.

### 2.1 Lỗ rõ ràng nếu không bịt

| Vấn đề | Vì sao phải xử lý | Đề xuất |
| --- | --- | --- |
| **Tự bỏ điểm danh** | Nếu nhân viên tự chuyển `confirmed` → `pending` được thì luật "không điểm danh trễ" vô nghĩa: cứ bỏ rồi bấm lại. Cũng không nên cho họ tước điểm danh của người khác | Chỉ **admin** được bỏ điểm danh, của bất kỳ ai |
| **Sửa giờ riêng sau khi đã điểm danh** | Điểm danh 08:00–12:00 rồi sửa thành 08:00–20:00 là thổi phồng Tổng kết mà không cần điểm danh trễ | Đã `confirmed` thì **khoá giờ riêng**, chỉ admin sửa được |
| **Gỡ người khác khỏi ca** | Nhân viên gỡ được người khác thì xoá được cả điểm danh của họ, lách luật 4 | Nhân viên chỉ tự gỡ mình, và chỉ khi **chưa** điểm danh |
| **Sửa/xoá ca đã diễn ra** | Luật 4 chỉ chặn ca *mới tạo*. Ca hôm qua vẫn xoá được, kéo theo toàn bộ điểm danh trong đó | Ca **đã qua**, hoặc **đã có người điểm danh**: chỉ admin sửa/xoá |
| **Ca mẫu** | Ca mẫu là định nghĩa lặp cho cả nhóm, một người sửa là ảnh hưởng mọi người | Tạo/sửa/xoá/bật-tắt ca mẫu: chỉ **admin**. Nhân viên chỉ *nhận ca* |

### 2.2 Hai cái bẫy kỹ thuật

**Luật thời gian phải nằm ở database, không phải ở giao diện.** Nhân viên gọi thẳng Supabase API được, bỏ qua toàn bộ frontend — README mục 9b đã dựa trên đúng điều này để đặt tính bất biến của nhật ký xuống tầng database. Mọi mốc 30 phút phải là RLS policy / trigger / `check`, dùng `now()` của **máy chủ**. Lấy giờ máy người dùng là vô nghĩa: đổi đồng hồ máy là điểm danh được ca tuần trước.

**Múi giờ.** `shifts.date` là `date` và các cột giờ là `time`, đều không mang múi giờ. So chúng với `now()` mà không chốt múi giờ thì Postgres tính theo UTC và lệch 7 tiếng — ca 08:00 sẽ mở cửa điểm danh từ 00:30 hôm đó. Phải ghim `Asia/Ho_Chi_Minh` ở mọi phép so sánh, và viết test cho đúng biên (23:30, 00:30).

### 2.3 Câu hỏi còn treo

- **Cửa sổ điểm danh tính theo giờ của ca hay giờ riêng của người đó?** Đề xuất: **giờ riêng**, cho khớp với trang Tổng kết (đang lấy giờ kết thúc của từng người). Người làm 08:00–12:00 trong ca 08:00–18:00 thì cửa sổ là 07:30–12:00.
- **Ca qua nửa đêm** vẫn chưa được hỗ trợ (README, phần Giới hạn đã biết). Làm luật thời gian là lúc thuận tay để xử luôn, hoặc chốt rõ là vẫn không hỗ trợ.
- **Luồng "nhắn admin"** nằm trong hay ngoài ứng dụng? Đề xuất cho MVP: **ngoài** (chat nội bộ), admin vào sửa tay — mọi can thiệp tay đều đã tự vào Nhật ký nên vẫn truy được. Làm hàng đợi yêu cầu trong app là việc riêng, để sau.
- **Ai phong admin?** Đề xuất: đặt tay trong Supabase Dashboard, **không** có đường nào trong ứng dụng để tự phong. Tránh việc admin đầu tiên trở thành lỗ hổng.

---

## 3. Đề xuất bổ sung

### 3.1 Cột `confirmed_at`

Thêm `shift_assignments.confirmed_at` (ghi bởi trigger khi status chuyển sang `confirmed`).

Lý do: điểm danh sớm 30 phút vẫn chỉ là *lời hứa sẽ trực*, không phải bằng chứng đã trực. Có `confirmed_at` thì admin đối chiếu được "điểm danh lúc 07:31 cho ca 08:00–12:00" — đủ để phát hiện người bấm sớm rồi về. Hiện chỉ có `updated_at`, mà nó bị ghi đè bởi mọi lần sửa khác.

### 3.2 Tổng kết

Trang Tổng kết đang đếm đúng thứ cần đếm (đã xác nhận **và** đã qua giờ kết thúc của riêng người đó), nên khi có phân quyền thì **không phải sửa logic** — chỉ được lợi: điểm danh không còn là thứ bấm bừa lúc nào cũng được.

Nếu sau này muốn tổng kết **đóng băng** thật (sửa ca đã qua không làm đổi số liệu cũ) thì cần bảng `shift_records` riêng. Hiện tổng kết được suy ra từ `shifts` + `shift_assignments`, nên nó luôn khớp dữ liệu hiện tại chứ không phải ảnh chụp bất biến. Tính bất biến hiện nằm ở Nhật ký.

---

## 4. Thứ tự làm

1. **`profiles.role`** (`staff` | `admin`) + hàm SQL đọc vai trò của người gọi. Không có bước này thì không luật nào triển khai được.
2. **Luật thời gian điểm danh** (luật 1, 2) ở tầng database, chốt múi giờ trước khi viết.
3. **Chặn lách**: bỏ điểm danh, sửa giờ đã xác nhận, gỡ người khác (mục 2.1).
4. **Luật xoá** (luật 4) + ca đã qua.
5. **Ca mẫu về tay admin**.
6. **`confirmed_at`** (mục 3.1).
7. Giao diện đi sau: ẩn/vô hiệu hoá đúng những nút mà database đã chặn, kèm câu giải thích vì sao — để nhân viên không phải đoán.

Bước 7 đi sau cùng là có lý do: giao diện chỉ nên phản ánh luật đã có ở database. Làm ngược lại sẽ ra một ứng dụng trông như đã chặn mà thật ra chưa.
