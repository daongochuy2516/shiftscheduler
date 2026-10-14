import type { Lang } from '../i18n/translations'
import type { TourId } from './tours'

/**
 * Nội dung trang Hướng dẫn (/help), viết cho nhân viên.
 *
 * Văn bản dài nên không đi qua từ điển `t()`: `HELP` là `Record<Lang, …>`,
 * thiếu một ngôn ngữ là lỗi biên dịch. Hai bản phải cùng thứ tự mục và cùng
 * `id` (mục lục và liên kết dựa vào đó).
 *
 * Định dạng trong chữ: **đậm** và `mã`. Đổi luật / giao diện thì sửa mục
 * tương ứng ở đây cùng lúc với README.
 */
export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'table'; head: [string, string]; rows: [string, string][] }
  | { type: 'note'; text: string }

export interface HelpSection {
  id: string
  title: string
  summary: string
  blocks: HelpBlock[]
  /** Bài từng bước đi kèm mục này. */
  tour?: TourId
  /** Chỉ admin thấy mục này. */
  adminOnly?: boolean
  /**
   * Ghim ở đầu trang, trên ô bài từng bước. Luôn hiện, không nằm trong mục
   * lục và ô tìm — ô tìm ở phía dưới, ẩn mục phía trên sẽ làm ô tìm nhảy.
   */
  pinned?: boolean
}

const vi: HelpSection[] = [
  {
    id: 'rules',
    pinned: true,
    title: 'Luật điểm danh',
    summary: 'Mốc giờ, việc được và không được làm, và vì sao.',
    blocks: [
      {
        type: 'p',
        text: 'Ví dụ: lúc 14:00 hôm nay bạn nhận ca **08:00–12:00 ngày mai**.',
      },
      {
        type: 'table',
        head: ['Mốc', 'Bạn làm được'],
        rows: [
          ['14:00 hôm nay', 'Nhận ca. Sửa được giờ của mình, **rời ca** được'],
          ['14:30 hôm nay', 'Hết 30 phút: không rời ca được nữa'],
          ['07:30 ngày mai', '**Mở điểm danh** — 30 phút trước giờ vào của riêng bạn'],
          ['12:00 ngày mai', '**Đóng điểm danh** — không điểm danh bù (nếu bạn có làm việc vào ca này nhưng quên điểm danh thì nhắn admin xem xét điểm danh bù)'],
          ['Đã điểm danh', 'Lượt bị **khoá**: không bỏ điểm danh, không sửa giờ, không rời ca'],
        ],
      },
      {
        type: 'table',
        head: ['Việc', 'Được khi'],
        rows: [
          ['Điểm danh', 'Lượt của mình, từ 30 phút trước giờ vào tới giờ kết thúc'],
          ['Bỏ điểm danh', 'Không được'],
          ['Sửa giờ của mình', 'Chưa điểm danh'],
          ['Rời ca', 'Trong 30 phút sau khi nhận, và chưa điểm danh'],
          ['Thêm / sửa / gỡ người khác', 'Không được — bạn chỉ thêm được chính mình'],
          ['Sửa tên / ngày / giờ ca', 'Ca không có người khác. Đổi ngày thì còn cần chưa ai điểm danh'],
          ['Xoá ca', 'Ca trống: luôn được. Chỉ có mình: khi còn rời được. Có người khác: không'],
          ['Ca mẫu', 'Chỉ nhận, không tạo / sửa / xoá'],
        ],
      },
      {
        type: 'list',
        items: [
          '**Vì sao không tự bỏ điểm danh?** Bỏ được thì cứ bỏ rồi bấm lại — luật không điểm danh trễ thành vô nghĩa.',
          '**Vì sao khoá giờ sau khi điểm danh?** Để không ai điểm danh 08:00–12:00 rồi sửa thành 08:00–20:00 cho phồng Tổng kết.',
          '**Vì sao xoá ca theo cùng hạn với rời ca?** Không thì xoá cả ca thành đường vòng để rời ca sau 30 phút.',
        ],
      },
    ],
  },
  {
    id: 'start',
    title: 'Bắt đầu nhanh',
    summary: 'Web này để làm gì, và đi lại giữa các trang thế nào.',
    tour: 'basics',
    blocks: [
      {
        type: 'p',
        text: 'Thinkmay Team Board là lịch xếp ca của nhóm. **Một ca** (ví dụ "Trực trang 08:00–18:00") chứa **nhiều lượt**: mỗi người trong ca có giờ riêng và trạng thái riêng — **Chờ xác nhận** hay **Đã xác nhận** (đã điểm danh).',
      },
      {
        type: 'table',
        head: ['Trang', 'Dùng để'],
        rows: [
          ['**Lịch**', 'Xem ca theo ngày / tuần / tháng, nhận ca mẫu, mở ca'],
          ['**Tất cả ca**', 'Tìm ca theo chữ, theo người, theo khoảng ngày'],
          ['**Tổng kết**', 'Số lượt và số giờ đã làm (đã điểm danh, đã hết giờ)'],
          ['**Ca của tôi**', 'Mọi ca bạn có, sắp tới ở trên'],
          ['**Chờ xác nhận**', 'Các lượt chưa điểm danh — **nơi điểm danh**'],
          ['**Nhật ký**', 'Ai đã làm gì, lúc nào'],
        ],
      },
      {
        type: 'list',
        items: [
          'Trên máy tính, các trang nằm ở thanh trên cùng; **nút lưới** ở góc phải chứa thông báo, giao diện, ngôn ngữ, Trạng thái, Hướng dẫn, đổi mật khẩu và đăng xuất.',
          'Trên điện thoại, bốn trang chính nằm ở **thanh dưới**; các mục còn lại nằm trong bảng mở ra khi bấm **avatar**.',
          'Bấm **Ctrl + K** (Mac: ⌘K) ở bất cứ đâu để mở Quick Search — xem mục Quick Search.',
        ],
      },
    ],
  },
  {
    id: 'schedule',
    title: 'Xem lịch',
    summary: 'Ba chế độ xem, và cách đọc timeline.',
    tour: 'basics',
    blocks: [
      {
        type: 'table',
        head: ['Chế độ', 'Hiện gì'],
        rows: [
          ['**Ngày**', 'Timeline theo giờ: mỗi hàng một người, mỗi khối một lượt'],
          ['**Tuần**', 'Mỗi người một hàng × 7 ngày; cột **Tổng** là số giờ trong tuần'],
          ['**Tháng**', 'Cả tháng; ca có bạn được viền màu. Bấm số ngày để sang chế độ Ngày'],
        ],
      },
      {
        type: 'list',
        items: [
          'Bạn luôn ở **hàng đầu**, nền xanh nhạt, có chữ "Bạn".',
          'Khối **viền liền** = đã điểm danh. Khối **viền nét đứt có đồng hồ** = còn chờ điểm danh.',
          '**Vạch đỏ** dọc là giờ hiện tại (chỉ khi xem hôm nay).',
          'Nút ‹ › lùi / tới; nút giữa về hôm nay. Ngày đang xem nằm trong địa chỉ trang — gửi link là người khác mở đúng ngày đó.',
          'Đông người quá thì tích **Chỉ nhân viên có ca** để ẩn những hàng trống.',
        ],
      },
    ],
  },
  {
    id: 'claim',
    title: 'Nhận ca mẫu',
    summary: 'Cách nhanh nhất để đăng ký làm một ca lặp lại.',
    tour: 'claim',
    blocks: [
      {
        type: 'p',
        text: '**Ca mẫu** là ca lặp lại admin đã tạo sẵn (ví dụ Trực trang 08:00–18:00). Nhận ca mẫu từ nút **Tạo ca**, ở bất cứ trang nào.',
      },
      {
        type: 'steps',
        items: [
          'Bấm **Tạo ca** (máy tính: thanh trên; điện thoại: nút tròn ở góc dưới) rồi chọn **Nhận ca mẫu**.',
          'Bấm vào mẫu bạn muốn làm. Mỗi dòng ghi giờ và các thứ mẫu đó lặp vào.',
          'Chọn một hoặc nhiều ngày trong lịch (chỉ những ngày mẫu lặp vào mới chọn được). Có nút chọn nhanh cả tuần / cả tháng.',
          'Bấm nút **Nhận** ở chân form. Kết quả hiện ở thông báo góc phải.',
        ],
      },
      {
        type: 'note',
        text: 'Nhận xong bạn có **30 phút** để đổi ý và rời ca. Quá 30 phút thì chỉ admin rút bạn ra được. Chỉ admin tạo / sửa / xoá được ca mẫu.',
      },
    ],
  },
  {
    id: 'shift',
    title: 'Mở và sửa ca của mình',
    summary: 'Chế độ Đơn giản / Nâng cao, sửa giờ, rời ca.',
    tour: 'shift',
    blocks: [
      {
        type: 'p',
        text: 'Bấm vào một khối trên lịch (hay nút **Sửa** trên thẻ ca ở các trang danh sách) để mở ca. Đầu form có công tắc **Đơn giản | Nâng cao**; form nhớ lựa chọn của bạn.',
      },
      {
        type: 'table',
        head: ['Chế độ', 'Làm được'],
        rows: [
          ['**Đơn giản**', 'Chỉ phần của bạn: nhận ca, sửa giờ và ghi chú của mình, điểm danh, rời ca. Người khác chỉ để xem'],
          ['**Nâng cao**', 'Form đầy đủ: tên, ngày, giờ, ghi chú của ca, danh sách người, xoá ca'],
        ],
      },
      {
        type: 'list',
        items: [
          '**Nhận ca này**: thêm bạn vào ca, giờ lấy sẵn theo ca — sửa trước khi bấm nếu cần.',
          '**Cả ca**: đưa giờ của bạn về đúng khung giờ của ca.',
          'Sửa giờ / ghi chú xong bấm **Lưu thay đổi** ở chân form.',
          '**Rời ca** chỉ được trong 30 phút đầu sau khi nhận; nút ghi rõ hạn ("tới 16:34").',
          'Ca có người khác: bạn không sửa được tên / ngày / giờ của ca, không thêm / sửa / gỡ người khác. **Ghi chú chung của ca** thì ai cũng sửa được.',
        ],
      },
    ],
  },
  {
    id: 'checkin',
    title: 'Điểm danh',
    summary: 'Khi nào bấm được, bấm ở đâu, và các luật đi kèm.',
    tour: 'checkin',
    blocks: [
      {
        type: 'p',
        text: '**Điểm danh = xác nhận** lượt của mình. Vào trang **Chờ xác nhận** rồi bấm **Xác nhận** trên lượt của mình (hoặc **Điểm danh** trong form ca, chế độ Đơn giản).',
      },
      {
        type: 'table',
        head: ['Luật', 'Chi tiết'],
        rows: [
          ['Chỉ trong giờ', 'Từ **30 phút trước giờ vào** đến **giờ kết thúc** của riêng bạn. Làm 08:00–12:00 thì điểm danh được 07:30–12:00'],
          ['Không điểm danh trễ', 'Qua giờ kết thúc là hết cửa — liên hệ admin để xác nhận hộ'],
          ['Chỉ lượt của mình', 'Lượt của người khác không có nút Xác nhận'],
          ['Đã điểm danh là khoá', 'Không bỏ điểm danh, không sửa giờ, không rời ca. Ghi chú vẫn sửa được'],
        ],
      },
      {
        type: 'list',
        items: [
          'Chưa tới giờ: thay cho nút là dòng "Mở điểm danh lúc 07:30". Nút **tự hiện** khi tới giờ, không cần tải lại.',
          'Điểm danh trước giờ bắt đầu (trong 30 phút sớm) sẽ được hỏi lại một lần.',
          'Giờ tính theo **đồng hồ máy chủ** — chỉnh giờ máy mình không có tác dụng.',
          '**Tổng kết** chỉ tính những lượt đã điểm danh **và** đã qua giờ kết thúc.',
          'Luật về rời ca, sửa giờ, xoá ca: xem **Luật điểm danh** ở đầu trang.',
        ],
      },
    ],
  },
  {
    id: 'create',
    title: 'Tạo và xoá ca',
    summary: 'Tạo ca mới, và khi nào được xoá.',
    blocks: [
      {
        type: 'steps',
        items: [
          'Bấm **Tạo ca** (máy tính: thanh trên; điện thoại: nút tròn ở góc dưới) rồi chọn **Tạo ca thủ công** — hoặc **Thêm ca vào ngày này** ở chế độ Ngày. (Lựa chọn còn lại, **Nhận ca mẫu**, xem mục Nhận ca mẫu.)',
          'Nhập tên, ngày, giờ, ghi chú. Bấm **Thêm tôi vào ca** nếu bạn làm ca này.',
          'Bấm **Tạo ca**. Lỗi nhập liệu (thiếu tên, giờ kết thúc trước giờ bắt đầu) hiện ngay dưới ô.',
        ],
      },
      {
        type: 'table',
        head: ['Ca', 'Xoá được không'],
        rows: [
          ['Đang trống', 'Được, lúc nào cũng được'],
          ['Chỉ có bạn, chưa điểm danh, nhận chưa quá 30 phút', 'Được'],
          ['Chỉ có bạn nhưng đã nhận quá 30 phút, hoặc đã điểm danh', 'Không — liên hệ admin'],
          ['Có người khác', 'Không — chỉ admin'],
        ],
      },
      {
        type: 'note',
        text: 'Bạn chỉ thêm được **chính mình** vào ca. Muốn xếp người khác thì nhờ admin.',
      },
    ],
  },
  {
    id: 'lists',
    title: 'Ca của tôi, Chờ xác nhận, Tất cả ca, Tổng kết',
    summary: 'Các trang danh sách và cách lọc.',
    blocks: [
      {
        type: 'list',
        items: [
          '**Ca của tôi**: mọi ca bạn có, sắp tới ở trên.',
          '**Chờ xác nhận**: các lượt chưa điểm danh — đây là nơi điểm danh. Mặc định chỉ hiện của bạn; bỏ tích **Chỉ ca của tôi** để xem cả nhóm.',
          '**Tất cả ca**: tab Sắp tới / Đã qua / Tất cả, ô tìm theo tên ca, ghi chú, tên người. Bộ lọc nhân viên là **và**: chọn hai người thì chỉ hiện ca có cả hai.',
          '**Tổng kết**: số lượt và số giờ đã làm theo ngày / tuần / tháng của từng người.',
        ],
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Thông báo',
    summary: 'Kết quả mọi thao tác hiện ở đâu, xem lại thế nào.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          'Mỗi lần lưu, nhận ca, điểm danh… kết quả hiện thành **popup ở góc phải** (điện thoại: trên cùng). Lỗi hiện **nguyên văn lý do** máy chủ từ chối.',
          'Mọi thông báo được giữ trong **ngăn thông báo** (nút lưới → Thông báo; điện thoại: chuông). Số đỏ là số chưa đọc.',
          'Trong ngăn: bấm để đánh dấu đã đọc, nút phong bì để đánh dấu chưa đọc lại, ✕ để xoá, hoặc **Đánh dấu tất cả đã đọc** / **Xoá tất cả**.',
          'Thông báo chỉ lưu trên **thiết bị này** — không đồng bộ sang máy khác.',
        ],
      },
    ],
  },
  {
    id: 'palette',
    title: 'Quick Search (Ctrl + K)',
    summary: 'Đi tới trang, chạy thao tác, và tính giờ / ngày.',
    blocks: [
      {
        type: 'p',
        text: 'Bấm **Ctrl + K** (Mac: ⌘K; điện thoại: avatar → Quick Search). Gõ để lọc, **↑ ↓** chọn, **Enter** chạy, **Esc** đóng. Gõ không dấu cũng được. Bộ gõ lỡ thêm dấu khi gõ tiếng Anh ("dark" thành "dảk") thì bảng tự hiểu lại.',
      },
      {
        type: 'table',
        head: ['Gõ', 'Được'],
        rows: [
          ['`lịch tuần`, `tổng kết`, `nhật ký`', 'Đi tới trang đó'],
          ['`tạo ca`, `giao diện tối`, `đăng xuất`', 'Chạy thao tác đó'],
          ['Tên một người: `mai`', 'Mở Tất cả ca, lọc sẵn ca của người đó'],
          ['`08:00 + 4h30m`', '`12:30` — Enter để chép'],
          ['`17:30 - 08:15`', '`9h 15m`'],
          ['`hôm nay + 10 ngày`, `15/10`', 'Ngày đó — Enter để mở lịch ngày đó'],
          ['`20/12 - 15/10`', 'Số ngày giữa hai ngày'],
          ['`12*3+4`', 'Kết quả phép tính'],
        ],
      },
    ],
  },
  {
    id: 'account',
    title: 'Tài khoản và bảo mật',
    summary: 'Đổi mật khẩu, đăng xuất, giao diện, ngôn ngữ.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          '**Đổi mật khẩu**: nút lưới → Đổi mật khẩu (điện thoại: avatar). Cần mật khẩu hiện tại; mật khẩu mới ít nhất 6 ký tự.',
          '**Đăng xuất**: phải bấm **hai lần** — lần đầu ô chuyển đỏ, bấm tiếp trong 4 giây mới đăng xuất.',
          '**Giao diện**: Hệ thống / Sáng / Tối. **Ngôn ngữ**: tiếng Việt / tiếng Anh. Cả hai nằm trong nút lưới (điện thoại: trong bảng avatar).',
          'Quên mật khẩu: không tự đặt lại được — nhờ admin đặt mật khẩu mới.',
        ],
      },
    ],
  },
  {
    id: 'faq',
    title: 'Câu hỏi thường gặp',
    summary: 'Những chỗ hay vướng.',
    blocks: [
      {
        type: 'table',
        head: ['Vướng', 'Vì sao / làm gì'],
        rows: [
          ['Không thấy nút Xác nhận', 'Chưa tới 30 phút trước giờ vào, hoặc đã qua giờ kết thúc. Quá giờ thì liên hệ admin'],
          ['Không rời được ca', 'Đã nhận quá 30 phút, hoặc đã điểm danh — chỉ admin rút ra được'],
          ['Không sửa được tên / giờ của ca', 'Ca có người khác — chỉ admin sửa. Ghi chú của ca thì vẫn sửa được'],
          ['Không xoá được ca', 'Ca có người khác, đã có người điểm danh, hoặc bạn nhận quá 30 phút'],
          ['Báo "Bạn không có quyền …"', 'Database chặn thao tác đó với nhân viên. Câu báo nói rõ lý do'],
          ['Không thấy nút Quản lý ca mẫu', 'Chỉ admin quản lý ca mẫu; nhân viên chỉ nhận'],
        ],
      },
    ],
  },
  {
    id: 'admin',
    title: 'Dành cho admin',
    summary: 'Những việc chỉ admin làm được.',
    adminOnly: true,
    blocks: [
      {
        type: 'list',
        items: [
          'Admin được miễn mọi luật trên: điểm danh hộ / trễ, bỏ điểm danh, sửa và gỡ người khác, xoá mọi ca.',
          '**Ca mẫu**: **Tạo ca → Quản lý ca mẫu** để tạo, sửa, bật / tắt, đổi màu, xoá.',
          '**Tài khoản** (nút lưới → Tài khoản): sửa tên hiển thị, **ẩn** người khỏi các bảng xếp ca (ví dụ tài khoản quản lý chỉ vào để xem). Người đang ẩn vẫn hiện nếu có ca.',
          'Phong admin và đổi vai trò làm trong Supabase SQL Editor, không có đường nào trong web.',
        ],
      },
    ],
  },
]

const en: HelpSection[] = [
  {
    id: 'rules',
    pinned: true,
    title: 'Check-in rules',
    summary: 'The deadlines, what you can and cannot do, and why.',
    blocks: [
      {
        type: 'p',
        text: 'Example: at 14:00 today you join a shift **08:00–12:00 tomorrow**.',
      },
      {
        type: 'table',
        head: ['When', 'You can'],
        rows: [
          ['14:00 today', 'Join. You can change your own hours and **leave**'],
          ['14:30 today', '30 minutes are up: you can no longer leave'],
          ['07:30 tomorrow', '**Check-in opens** — 30 minutes before your own start'],
          ['12:00 tomorrow', '**Check-in closes** — no checking in afterwards'],
          ['Checked in', 'Your assignment is **locked**: no un-checking, no hour changes, no leaving'],
        ],
      },
      {
        type: 'table',
        head: ['Action', 'Allowed when'],
        rows: [
          ['Check in', 'Your own assignment, from 30 minutes before your start until your end'],
          ['Un-check', 'Never'],
          ['Change your hours', 'Not checked in yet'],
          ['Leave', 'Within 30 minutes of joining, and not checked in'],
          ['Add / edit / remove others', 'Never — you can only add yourself'],
          ['Change shift title / date / hours', 'Nobody else is on the shift. Moving the date also needs nobody checked in'],
          ['Delete a shift', 'Empty: always. Only you: while you can still leave. Others on it: no'],
          ['Templates', 'Claim only — no creating, editing or deleting'],
        ],
      },
      {
        type: 'list',
        items: [
          '**Why no un-checking?** If you could, you would just un-check and check in again — the no-late-check-in rule would mean nothing.',
          '**Why lock hours after check-in?** So nobody checks in for 08:00–12:00 and then stretches it to 08:00–20:00 to pad the Summary.',
          '**Why does deleting follow the leaving deadline?** Otherwise deleting the whole shift becomes a way to leave after 30 minutes.',
        ],
      },
    ],
  },
  {
    id: 'start',
    title: 'Getting started',
    summary: 'What this site is for, and how to move around.',
    tour: 'basics',
    blocks: [
      {
        type: 'p',
        text: 'Thinkmay Team Board is the team\'s shift schedule. **A shift** (say "Page Support 08:00–18:00") holds **several assignments**: everyone on it has their own hours and their own status — **Pending** or **Confirmed** (checked in).',
      },
      {
        type: 'table',
        head: ['Page', 'What it is for'],
        rows: [
          ['**Schedule**', 'See shifts by day / week / month, claim templates, open a shift'],
          ['**All shifts**', 'Search shifts by text, people and date range'],
          ['**Summary**', 'Assignments and hours worked (checked in and finished)'],
          ['**My shifts**', 'Every shift you are on, upcoming first'],
          ['**Pending**', 'Assignments not checked in yet — **where you check in**'],
          ['**Activity**', 'Who did what, and when'],
        ],
      },
      {
        type: 'list',
        items: [
          'On a computer the pages are in the top bar; the **grid button** on the right holds notifications, theme, language, Status, Help, change password and sign out.',
          'On a phone the four main pages are in the **bottom bar**; everything else is in the sheet behind your **avatar**.',
          'Press **Ctrl + K** (Mac: ⌘K) anywhere to open Quick Search — see Quick Search.',
        ],
      },
    ],
  },
  {
    id: 'schedule',
    title: 'Reading the schedule',
    summary: 'The three views, and how to read the timeline.',
    tour: 'basics',
    blocks: [
      {
        type: 'table',
        head: ['View', 'Shows'],
        rows: [
          ['**Day**', 'An hourly timeline: one row per person, one block per assignment'],
          ['**Week**', 'One row per person × 7 days; the **Total** column is their hours that week'],
          ['**Month**', 'The whole month; shifts you are on get a coloured border. Tap a day number to open that day'],
        ],
      },
      {
        type: 'list',
        items: [
          'You are always on the **top row**, tinted, marked "You".',
          'A **solid border** means checked in. A **dashed border with a clock** means still pending.',
          'The vertical **red line** is the current time (only when viewing today).',
          '‹ › step back / forward; the middle button returns to today. The day you view is in the address bar — share the link and others open the same day.',
          'Busy team? Tick **Only staff with shifts** to hide empty rows.',
        ],
      },
    ],
  },
  {
    id: 'claim',
    title: 'Claiming a shift template',
    summary: 'The quickest way to sign up for a recurring shift.',
    tour: 'claim',
    blocks: [
      {
        type: 'p',
        text: '**Templates** are recurring shifts an admin has set up (say, Page Support 08:00–18:00). Claim one from the **New shift** button, on any page.',
      },
      {
        type: 'steps',
        items: [
          'Press **New shift** (computer: top bar; phone: the round button bottom-right) and choose **Claim a template**.',
          'Press the template you want. Each row shows its hours and the weekdays it repeats on.',
          'Pick one or more days in the calendar (only days the template repeats on can be picked). There are quick picks for the whole week / month.',
          'Press **Claim** at the bottom. The result pops up in the corner.',
        ],
      },
      {
        type: 'note',
        text: 'After claiming you have **30 minutes** to change your mind and leave. After that only an admin can take you off. Only admins can create, edit or delete templates.',
      },
    ],
  },
  {
    id: 'shift',
    title: 'Opening and editing your shift',
    summary: 'Simple / Advanced mode, changing your hours, leaving.',
    tour: 'shift',
    blocks: [
      {
        type: 'p',
        text: 'Tap a block on the schedule (or **Edit** on a shift card in the list pages) to open it. The top of the form has a **Simple | Advanced** switch; the form remembers your choice.',
      },
      {
        type: 'table',
        head: ['Mode', 'Lets you'],
        rows: [
          ['**Simple**', 'Just your part: join, change your own hours and note, check in, leave. Other people are view-only'],
          ['**Advanced**', 'The full form: the shift\'s title, date, hours, note, the roster, delete'],
        ],
      },
      {
        type: 'list',
        items: [
          '**Join this shift** adds you with the shift\'s hours — change them first if needed.',
          '**Whole shift** snaps your hours back to the shift\'s window.',
          'After changing your hours / note press **Save changes** at the bottom.',
          '**Leave** only works within 30 minutes of joining; the button shows the deadline ("until 16:34").',
          'If others are on the shift you cannot change its title / date / hours, or add, edit or remove other people. The **shift\'s own note** stays editable by anyone.',
        ],
      },
    ],
  },
  {
    id: 'checkin',
    title: 'Checking in',
    summary: 'When you can, where to press, and the rules.',
    tour: 'checkin',
    blocks: [
      {
        type: 'p',
        text: '**Checking in = confirming** your own assignment. Go to **Pending** and press **Confirm** on your assignment (or **Check in** in the shift form, Simple mode).',
      },
      {
        type: 'table',
        head: ['Rule', 'Details'],
        rows: [
          ['Only in time', 'From **30 minutes before your start** until **your end time**. Working 08:00–12:00 means 07:30–12:00'],
          ['No late check-in', 'After your end time it is closed — contact an admin to confirm for you'],
          ['Only your own', 'Other people\'s assignments have no Confirm button'],
          ['Checked in means locked', 'No un-checking, no hour changes, no leaving. The note stays editable'],
        ],
      },
      {
        type: 'list',
        items: [
          'Too early: instead of the button you see "Check-in opens 07:30". The button **appears on its own** when it is time — no reload.',
          'Checking in before your start (within the 30 early minutes) asks once more.',
          'Time follows the **server clock** — changing your device clock does nothing.',
          '**Summary** only counts assignments that are checked in **and** past their end time.',
          'Rules on leaving, changing hours and deleting: see **Check-in rules** at the top of this page.',
        ],
      },
    ],
  },
  {
    id: 'create',
    title: 'Creating and deleting shifts',
    summary: 'Making a new shift, and when you can delete one.',
    blocks: [
      {
        type: 'steps',
        items: [
          'Press **New shift** (computer: top bar; phone: the round button bottom-right) and choose **Create manually** — or **Add shift on this day** in Day view. (The other choice, **Claim a template**, is covered under Claiming a shift template.)',
          'Fill in the title, date, hours and note. Press **Add me** if you work it.',
          'Press **Create shift**. Input mistakes (no title, end before start) show right under the field.',
        ],
      },
      {
        type: 'table',
        head: ['Shift', 'Can you delete it?'],
        rows: [
          ['Empty', 'Yes, any time'],
          ['Only you, not checked in, joined under 30 minutes ago', 'Yes'],
          ['Only you but joined over 30 minutes ago, or checked in', 'No — contact an admin'],
          ['Other people on it', 'No — admins only'],
        ],
      },
      {
        type: 'note',
        text: 'You can only add **yourself** to a shift. Ask an admin to roster other people.',
      },
    ],
  },
  {
    id: 'lists',
    title: 'My shifts, Pending, All shifts, Summary',
    summary: 'The list pages and their filters.',
    blocks: [
      {
        type: 'list',
        items: [
          '**My shifts**: every shift you are on, upcoming first.',
          '**Pending**: assignments not checked in yet — this is where you check in. Shows yours by default; untick **Only my shifts** to see the whole team.',
          '**All shifts**: Upcoming / Past / All tabs, search by shift title, note or person. The staff filter is **AND**: pick two people and only shifts with both show.',
          '**Summary**: assignments and hours worked per person, by day / week / month.',
        ],
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    summary: 'Where results show up and how to review them.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          'Every save, claim, check-in… shows its result as a **popup in the corner** (phone: at the top). Errors show the server\'s **exact reason**.',
          'Every notification is kept in the **notification panel** (grid button → Notifications; phone: the bell). The red number is unread.',
          'In the panel: tap to mark as read, the envelope to mark unread again, ✕ to delete, or **Mark all as read** / **Clear all**.',
          'Notifications live on **this device only** — they do not sync to other devices.',
        ],
      },
    ],
  },
  {
    id: 'palette',
    title: 'Quick Search (Ctrl + K)',
    summary: 'Jump to pages, run actions, and do time / date maths.',
    blocks: [
      {
        type: 'p',
        text: 'Press **Ctrl + K** (Mac: ⌘K; phone: avatar → Quick Search). Type to filter, **↑ ↓** to pick, **Enter** to run, **Esc** to close. If your Vietnamese keyboard adds accents while you type English ("dark" becomes "dảk"), it figures out what you meant.',
      },
      {
        type: 'table',
        head: ['Type', 'Get'],
        rows: [
          ['`schedule week`, `summary`, `activity`', 'Go to that page'],
          ['`new shift`, `theme dark`, `sign out`', 'Run that action'],
          ['A name: `mai`', 'All shifts, filtered to that person'],
          ['`08:00 + 4h30m`', '`12:30` — Enter to copy'],
          ['`17:30 - 08:15`', '`9h 15m`'],
          ['`today + 10 days`, `15/10`', 'That day — Enter opens it on the schedule'],
          ['`20/12 - 15/10`', 'Days between the two dates'],
          ['`12*3+4`', 'The result'],
        ],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account and security',
    summary: 'Change password, sign out, theme, language.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          '**Change password**: grid button → Change password (phone: avatar). You need your current password; the new one needs at least 6 characters.',
          '**Sign out**: press **twice** — the first press turns it red, a second press within 4 seconds signs you out.',
          '**Theme**: System / Light / Dark. **Language**: Vietnamese / English. Both are in the grid button (phone: in the avatar sheet).',
          'Forgot your password: there is no self-service reset — ask an admin to set a new one.',
        ],
      },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ',
    summary: 'The usual sticking points.',
    blocks: [
      {
        type: 'table',
        head: ['Problem', 'Why / what to do'],
        rows: [
          ['No Confirm button', 'It is more than 30 minutes before your start, or past your end. After the end, contact an admin'],
          ['Cannot leave a shift', 'You joined over 30 minutes ago, or you are checked in — only an admin can take you off'],
          ['Cannot change the shift\'s title / hours', 'Other people are on it — admins only. The shift note is still editable'],
          ['Cannot delete a shift', 'Others are on it, someone checked in, or you joined over 30 minutes ago'],
          ['"You don\'t have permission …"', 'The database blocks that for staff. The message says why'],
          ['No Manage templates button', 'Only admins manage templates; staff just claim them'],
        ],
      },
    ],
  },
  {
    id: 'admin',
    title: 'For admins',
    summary: 'Things only admins can do.',
    adminOnly: true,
    blocks: [
      {
        type: 'list',
        items: [
          'Admins are exempt from all the rules above: confirm for others or late, un-check, edit and remove anyone, delete any shift.',
          '**Templates**: **New shift → Manage templates** to create, edit, switch on / off, recolour and delete.',
          '**Accounts** (grid button → Accounts): change display names, **hide** people from the schedule boards (say, a manager account that only looks). Hidden people still show where they have shifts.',
          'Making someone admin and changing roles happens in the Supabase SQL Editor — there is no way to do it in the site.',
        ],
      },
    ],
  },
]

export const HELP: Record<Lang, HelpSection[]> = { vi, en }
