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
    summary: 'Mốc giờ, và việc được hay không được làm.',
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
          ['07:30 ngày mai', '**Mở điểm danh** — 30 phút trước giờ vào của riêng bạn. Từ đây giờ của bạn bị **khoá**'],
          ['12:00 ngày mai', '**Đóng điểm danh** — không thể tự điểm danh (nếu bạn có làm việc vào ca này nhưng quên điểm danh thì nhắn admin xem xét điểm danh bù)'],
          ['Đã điểm danh', 'Lượt bị **khoá**: không bỏ điểm danh, không sửa giờ, không rời ca'],
        ],
      },
      {
        type: 'table',
        head: ['Việc', 'Được khi'],
        rows: [
          ['Điểm danh', 'Lượt của mình, từ 30 phút trước giờ vào tới giờ kết thúc'],
          ['Bỏ điểm danh', 'Không được'],
          ['Sửa giờ của mình', 'Trước giờ mở điểm danh'],
          ['Đổi nơi trực của mình', 'Khi chưa điểm danh (không phụ thuộc giờ). Ca từ ca mẫu: phải giữ ít nhất một nơi'],
          ['Rời ca', 'Trong 30 phút sau khi nhận, và chưa điểm danh'],
          ['Thêm / sửa / gỡ người khác', 'Không được — bạn chỉ thêm được chính mình'],
          ['Sửa tên / ngày / giờ ca', 'Ca không có người khác. Đổi ngày thì còn cần chưa tới giờ mở điểm danh. Ca từ ca mẫu: không sửa giờ'],
          ['Xoá ca', 'Ca trống: luôn được. Chỉ có mình: khi còn rời được. Có người khác: không'],
          ['Ca mẫu', 'Chỉ nhận, không tạo / sửa / xoá'],
          ['Danh sách nơi trực', 'Chỉ chọn, không thêm / sửa / ẩn / xoá'],
        ],
      },
    ],
  },
  {
    id: 'start',
    title: 'Bắt đầu nhanh',
    summary: 'Các trang chính và cách đi lại.',
    tour: 'basics',
    blocks: [
      {
        type: 'p',
        text: '**Một ca** có nhiều người; mỗi người có giờ riêng và trạng thái riêng: **Chờ xác nhận** hoặc **Đã xác nhận** (đã điểm danh).',
      },
      {
        type: 'table',
        head: ['Trang', 'Dùng để'],
        rows: [
          ['**Lịch**', 'Xem ca theo ngày / tuần / tháng'],
          ['**Tất cả ca**', 'Tìm ca theo tên, theo người, theo ngày'],
          ['**Tổng kết**', 'Số giờ đã làm'],
          ['**Ca của tôi**', 'Mọi ca bạn có'],
          ['**Chờ xác nhận**', '**Nơi điểm danh**'],
          ['**Nhật ký**', 'Ai đã làm gì, lúc nào'],
        ],
      },
      {
        type: 'list',
        items: [
          'Máy tính: các trang ở thanh trên; **nút lưới** góc phải có thông báo, giao diện, đổi mật khẩu, đăng xuất.',
          'Điện thoại: trang chính ở **thanh dưới**; còn lại bấm **avatar**.',
        ],
      },
    ],
  },
  {
    id: 'schedule',
    title: 'Xem lịch',
    summary: 'Ngày, tuần, tháng và cách đọc lịch.',
    tour: 'basics',
    blocks: [
      {
        type: 'list',
        items: [
          '**Ngày | Tuần | Tháng** để đổi cách xem; ‹ › để lùi / tới.',
          'Khối **viền liền** = đã điểm danh. **Viền nét đứt** = chưa điểm danh.',
          '**Vạch đỏ** là giờ hiện tại.',
          'Tích **Chỉ nhân viên có ca** để ẩn hàng trống (chế độ Ngày, và Tuần trên điện thoại).',
        ],
      },
      {
        type: 'p',
        text: '**Chế độ Tuần trên máy tính** là lịch như Google Calendar:',
      },
      {
        type: 'list',
        items: [
          '**Mỗi ngày một cột**, giờ chạy dọc bên trái. Mỗi khối là một người, đặt theo **giờ riêng** của người đó.',
          'Trong khối: **tên người**, giờ, nhãn **nơi trực** (thiếu chỗ thì thu gọn thành tên tắt / chấm màu), tên ca nếu khối đủ cao. Rê chuột để xem đủ.',
          '**Màu khối = màu avatar** của người đó. Nhiều người trùng giờ thì các khối **đứng cạnh nhau**.',
          'Bấm **khối** để mở ca; bấm **tiêu đề ngày** để sang chế độ Ngày.',
          '**Bộ chọn khung giờ** dùng được cả ở đây: *Vừa theo tuần* co theo mọi ca trong tuần; *Cả ngày* để thấy ca nằm ngoài khung.',
          'Điện thoại vẫn là bảng **người × ngày** như cũ.',
        ],
      },
      {
        type: 'note',
        text: '**Tổng kết**, chế độ Tuần trên máy tính cũng là lịch như vậy, nhưng chỉ có các lượt đã điểm danh và đã hết giờ; dưới mỗi ngày là tổng giờ ngày đó, dưới lịch là **bảng tổng giờ từng người** trong tuần. Bấm một khối để mở ca đó, như ở Lịch.',
      },
    ],
  },
  {
    id: 'claim',
    title: 'Nhận ca mẫu',
    summary: 'Đăng ký một ca lặp lại có sẵn.',
    tour: 'claim',
    blocks: [
      {
        type: 'steps',
        items: [
          'Bấm **Tạo ca** → **Nhận ca mẫu**.',
          'Chọn mẫu bạn muốn làm (ví dụ **Sáng**, **Chiều**, **Tối**).',
          'Chọn **Nơi trực** — một hoặc nhiều nơi, ví dụ Fanpage và Discord. **Bắt buộc chọn ít nhất một** (kể cả admin); lần sau app nhớ lựa chọn này. Chưa có nơi trực nào để chọn thì chưa nhận ca được — nhờ admin thêm trong **Quản lý nơi trực**.',
          'Chọn ngày trong lịch (có nút chọn cả tuần / cả tháng).',
          'Bấm **Nhận**.',
        ],
      },
      {
        type: 'list',
        items: [
          'Ngày đã nhận mà **chưa điểm danh** vẫn chọn lại được: nhận lại với nơi trực khác thì nơi đó được **thêm vào lượt sẵn có** — vẫn một lượt, giờ không đổi, chỉ thêm nơi trực. Ngày đã điểm danh thì không thêm nơi trực được nữa.',
          'Nơi trực hiện thành **nhãn màu** cạnh tên bạn trong ca, trên lịch và trong danh sách ca.',
        ],
      },
    ],
  },
  {
    id: 'shift',
    title: 'Mở và sửa ca của mình',
    summary: 'Sửa giờ, ghi chú, rời ca.',
    tour: 'shift',
    blocks: [
      {
        type: 'list',
        items: [
          'Bấm vào một khối trên lịch (hoặc nút **Sửa**) để mở ca.',
          '**Đơn giản**: chỉ phần của bạn — nhận ca, sửa giờ, ghi chú, điểm danh, rời ca.',
          '**Nâng cao**: sửa cả ca — tên, ngày, giờ, ghi chú chung.',
          'Mỗi người trong ca có **nơi trực** riêng (nhãn màu cạnh tên). Bạn đổi được nơi trực của mình khi chưa điểm danh; lượt của người khác và lượt đã điểm danh thì bị khoá. Ca nhận từ ca mẫu thì không bỏ được nơi trực cuối cùng — muốn đổi, chọn nơi mới trước rồi bỏ nơi cũ.',
          'Sửa xong bấm **Lưu thay đổi**.',
        ],
      },
    ],
  },
  {
    id: 'checkin',
    title: 'Điểm danh',
    summary: 'Điểm danh ở đâu, khi nào.',
    tour: 'checkin',
    blocks: [
      {
        type: 'steps',
        items: [
          'Vào trang **Chờ xác nhận**.',
          'Bấm **Xác nhận** trên lượt của bạn.',
        ],
      },
      {
        type: 'list',
        items: [
          'Chưa tới giờ thì thấy dòng "Mở điểm danh lúc 07:30"; tới giờ nút tự hiện.',
          '**Tổng kết** chỉ tính lượt đã điểm danh và đã hết giờ.',
        ],
      },
    ],
  },
  {
    id: 'create',
    title: 'Tạo ca',
    summary: 'Tạo một ca mới.',
    blocks: [
      {
        type: 'steps',
        items: [
          'Bấm **Tạo ca** → **Tạo ca thủ công**.',
          'Nhập tên, ngày, giờ. Bấm **Thêm tôi vào ca** nếu bạn làm ca này.',
          'Bấm **Tạo ca**.',
        ],
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Thông báo',
    summary: 'Xem kết quả thao tác.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          'Kết quả mỗi thao tác hiện ở **góc màn hình**; lỗi ghi rõ lý do.',
          'Xem lại ở **nút lưới → Thông báo** (điện thoại: chuông).',
        ],
      },
    ],
  },
  {
    id: 'palette',
    title: 'Quick Search (Ctrl + K)',
    summary: 'Đi nhanh tới trang, chạy thao tác, tính giờ.',
    blocks: [
      {
        type: 'p',
        text: 'Bấm **Ctrl + K** (Mac: ⌘K; điện thoại: avatar → Quick Search), gõ rồi **Enter**.',
      },
      {
        type: 'table',
        head: ['Gõ', 'Được'],
        rows: [
          ['`chờ xác nhận`, `giao diện tối`', 'Tới trang / chạy thao tác đó'],
          ['Tên một người: `mai`', 'Ca của người đó'],
          ['`08:00 + 4h30m`', '`12:30`'],
          ['`17:30 - 08:15`', '`9h 15m`'],
        ],
      },
    ],
  },
  {
    id: 'links',
    title: 'Gửi link màn hình',
    summary: 'Copy đường dẫn là người nhận thấy đúng thứ bạn đang xem.',
    blocks: [
      {
        type: 'p',
        text: 'Đường dẫn trên thanh địa chỉ luôn khớp với màn hình: copy rồi gửi là người nhận mở ra **đúng trang, đúng ngày, đúng bộ lọc**, và cả **form ca đang mở** (đúng ca, đúng người đang tô sáng, đúng Đơn giản / Nâng cao).',
      },
      {
        type: 'list',
        items: [
          'Không thấy thanh địa chỉ (app đã cài ra màn hình chính)? Bấm **Ctrl + Shift + L** (Mac: ⌘⇧L), hoặc nút lưới → **Copy link** (điện thoại: avatar → **Copy link**).',
          'Trên **Lịch** và **Tổng kết** link luôn có ngày cụ thể, kể cả hôm nay — mai mới mở vẫn ra đúng ngày bạn đã xem.',
          'Cũng gửi được: hộp **nhận ca mẫu** (chỉ ca mẫu; ngày và nơi trực người nhận tự chọn), các dòng **Nhật ký** đang mở Chi tiết, một mục của trang **Hướng dẫn** (bấm mục đó trong mục lục rồi copy link), hộp **Quên mật khẩu**.',
          'Người nhận chưa đăng nhập thì đăng nhập xong được đưa thẳng tới đúng màn hình đó.',
          'Đang mở form ca hay hộp nhận ca mẫu thì nút **Back** của trình duyệt (vuốt lùi trên điện thoại) là **đóng hộp đó**, không rời trang.',
          'Link tới ca đã bị xoá: app báo *Không mở được ca* và mở trang như bình thường.',
        ],
      },
    ],
  },
  {
    id: 'account',
    title: 'Tài khoản',
    summary: 'Hồ sơ, mật khẩu và đăng xuất.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          '**Hồ sơ của tôi**: nút lưới (điện thoại: avatar) → Hồ sơ của tôi — tên hiển thị, email, ngày vào, đang làm hay đã nghỉ.',
          'Đã **nghỉ việc** thì vẫn đăng nhập được nhưng chỉ xem được hồ sơ của mình.',
          '**Đổi mật khẩu**: nút lưới (điện thoại: avatar) → Đổi mật khẩu.',
          '**Đăng xuất**: bấm **hai lần**.',
          'Quên mật khẩu: nhờ admin đặt lại.',
        ],
      },
    ],
  },
  {
    id: 'app',
    title: 'Cài ứng dụng và mất mạng',
    summary: 'Mở như app, xem lịch khi offline.',
    blocks: [
      {
        type: 'list',
        items: [
          '**Cài ứng dụng**: nút lưới (điện thoại: avatar) → Cài ứng dụng. iPhone / iPad: mở bằng Safari → nút **Chia sẻ** → **Thêm vào MH chính**.',
          '**Mất mạng** vẫn mở được app và xem những ngày / tuần / tháng **đã mở lúc có mạng trong 2 ngày qua**. Băng vàng dưới header cho biết dữ liệu lưu lúc mấy giờ.',
          'Offline thì **chỉ xem**: tạo, sửa, nhận ca, điểm danh đều phải chờ có mạng. App không gửi bù — có mạng lại thì bấm lại.',
          'Có **phiên bản mới** thì app hỏi trước khi tải lại, không tự nhảy giữa lúc bạn đang điền form.',
        ],
      },
      {
        type: 'note',
        text: 'Đăng xuất là xoá hết dữ liệu đã lưu trên máy — máy dùng chung không giữ lịch của ai.',
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
        head: ['Vướng', 'Làm gì'],
        rows: [
          ['Không thấy nút Xác nhận', 'Chưa tới giờ, hoặc đã qua giờ kết thúc — nhắn admin'],
          ['Không rời được ca', 'Đã quá 30 phút hoặc đã điểm danh — nhắn admin'],
          ['Không sửa / xoá được ca', 'Ca có người khác — nhắn admin'],
          ['Không đổi được nơi trực', 'Đã điểm danh, hoặc là lượt của người khác — nhắn admin'],
          ['Không thấy nơi trực cần chọn', 'Nơi đó đang bị ẩn — nhắn admin'],
          ['Không nhận được ca vì chưa có nơi trực', 'Chưa có nơi trực nào đang hiện — nhờ admin thêm trong Quản lý nơi trực'],
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
          '**Nơi trực**: **Tạo ca → Quản lý nơi trực** (hoặc gõ trong Quick Search) để thêm, đổi tên, đổi màu, sắp thứ tự, ẩn / hiện, xoá. Đổi tên một lần là mọi ca đổi theo.',
          'Nơi trực **đã có trong ca** thì không xoá được — hãy **ẩn**: ca cũ vẫn giữ nhãn, nhưng nhân viên không chọn được nữa. Admin vẫn chọn / đổi nơi trực của bất kỳ ai, kể cả lượt đã điểm danh, và được bỏ trống nơi trực khi sửa hộ. Nhưng tự **nhận ca** thì admin cũng phải chọn ít nhất một nơi trực, và ẩn hết nơi trực là không ai nhận ca được.',
          '**Tài khoản** (nút lưới → Tài khoản): sửa tên hiển thị, **ẩn** người khỏi các bảng xếp ca (ví dụ tài khoản quản lý chỉ vào để xem). Người đang ẩn vẫn hiện nếu có ca.',
          'Cũng ở trang Tài khoản: sửa **Ngày vào**. **Ngày nghỉ** chỉ xem ở đây — đặt trong Supabase SQL Editor, luôn kèm hạ vai trò về `staff` (câu lệnh mẫu trong README). Từ ngày nghỉ người đó chỉ xem được hồ sơ của mình; có ngày nghỉ không tự ẩn họ khỏi bảng — gạt sang **Đang ẩn** nếu muốn.',
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
    summary: 'The deadlines, and what you can and cannot do.',
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
          ['07:30 tomorrow', '**Check-in opens** — 30 minutes before your own start. Your hours are **locked** from here'],
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
          ['Change your hours', 'Before check-in opens'],
          ['Change your locations', 'Until you check in (any time before that). Shifts from a template: keep at least one'],
          ['Leave', 'Within 30 minutes of joining, and not checked in'],
          ['Add / edit / remove others', 'Never — you can only add yourself'],
          ['Change shift title / date / hours', 'Nobody else is on the shift. Moving the date also needs check-in not to have opened yet. Template shifts: hours can’t change'],
          ['Delete a shift', 'Empty: always. Only you: while you can still leave. Others on it: no'],
          ['Templates', 'Claim only — no creating, editing or deleting'],
          ['Location list', 'Pick only — no adding, editing, hiding or deleting'],
        ],
      },
    ],
  },
  {
    id: 'start',
    title: 'Getting started',
    summary: 'The main pages and how to get around.',
    tour: 'basics',
    blocks: [
      {
        type: 'p',
        text: '**A shift** has several people; each has their own hours and status: **Pending** or **Confirmed** (checked in).',
      },
      {
        type: 'table',
        head: ['Page', 'For'],
        rows: [
          ['**Schedule**', 'Shifts by day / week / month'],
          ['**All shifts**', 'Find shifts by name, person or date'],
          ['**Summary**', 'Hours worked'],
          ['**My shifts**', 'Every shift you are on'],
          ['**Pending**', '**Where you check in**'],
          ['**Activity**', 'Who did what, and when'],
        ],
      },
      {
        type: 'list',
        items: [
          'Computer: pages are in the top bar; the **grid button** on the right has notifications, theme, change password, sign out.',
          'Phone: main pages are in the **bottom bar**; the rest is behind your **avatar**.',
        ],
      },
    ],
  },
  {
    id: 'schedule',
    title: 'Reading the schedule',
    summary: 'Day, week, month and how to read it.',
    tour: 'basics',
    blocks: [
      {
        type: 'list',
        items: [
          '**Day | Week | Month** to switch views; ‹ › to go back / forward.',
          'A **solid border** = checked in. A **dashed border** = not checked in yet.',
          'The **red line** is the current time.',
          'Tick **Only staff with shifts** to hide empty rows (Day view, and Week on a phone).',
        ],
      },
      {
        type: 'p',
        text: '**Week view on a computer** is a calendar, like Google Calendar:',
      },
      {
        type: 'list',
        items: [
          '**One column per day**, hours running down the left. Each block is one person, placed at **their own hours**.',
          'Inside a block: the **person’s name**, the hours, **location** chips (shrinking to short names / colour dots when space is tight), and the shift title when the block is tall enough. Hover to see everything.',
          '**Block colour = that person’s avatar colour**. People working at the same time sit **side by side**.',
          'Click a **block** to open the shift; click a **day header** to go to the Day view.',
          'The **hour scale** works here too: *Fit to week* fits every shift in the week; *Full day* shows shifts outside the hours.',
          'Phones keep the **person × day** table as before.',
        ],
      },
      {
        type: 'note',
        text: 'In **Summary**, the Week view on a computer is the same kind of calendar, but with only checked-in, finished assignments; each day’s total hours sit under its header, and a **per-person hours table** for the week is below the calendar. Click a block to open that shift, as on the Schedule.',
      },
    ],
  },
  {
    id: 'claim',
    title: 'Claiming a template',
    summary: 'Sign up for a ready-made recurring shift.',
    tour: 'claim',
    blocks: [
      {
        type: 'steps',
        items: [
          'Press **New shift** → **Claim a template**.',
          'Pick the template you want (say **Sáng**, **Chiều** or **Tối**).',
          'Pick your **Locations** — one or more, e.g. Fanpage and Discord. **At least one is required** (admins too); the app remembers your pick for next time. With no location to pick you cannot claim yet — ask an admin to add one in **Manage locations**.',
          'Pick the days in the calendar (there are quick picks for the week / month).',
          'Press **Claim**.',
        ],
      },
      {
        type: 'list',
        items: [
          'Days you already claimed but **have not checked in** on can be picked again: claiming again with another location **adds it to your existing assignment** — still one assignment, same hours, one more location. Once checked in, a day cannot take new locations.',
          'Locations show as **coloured chips** next to your name in the shift, on the schedule and in shift lists.',
        ],
      },
    ],
  },
  {
    id: 'shift',
    title: 'Opening and editing your shift',
    summary: 'Change your hours, note, or leave.',
    tour: 'shift',
    blocks: [
      {
        type: 'list',
        items: [
          'Tap a block on the schedule (or **Edit**) to open a shift.',
          '**Simple**: just your part — join, change your hours, note, check in, leave.',
          '**Advanced**: the whole shift — title, date, hours, shared note.',
          'Each person on a shift has their own **locations** (coloured chips next to the name). You can change yours until you check in; other people’s assignments and checked-in ones are locked. On a shift claimed from a template you cannot remove the last location — to switch, pick the new one first, then drop the old one.',
          'Press **Save changes** when done.',
        ],
      },
    ],
  },
  {
    id: 'checkin',
    title: 'Checking in',
    summary: 'Where and when to check in.',
    tour: 'checkin',
    blocks: [
      {
        type: 'steps',
        items: [
          'Go to **Pending**.',
          'Press **Confirm** on your assignment.',
        ],
      },
      {
        type: 'list',
        items: [
          'Too early shows "Check-in opens 07:30"; the button appears on its own when it is time.',
          '**Summary** only counts assignments that are checked in and finished.',
        ],
      },
    ],
  },
  {
    id: 'create',
    title: 'Creating a shift',
    summary: 'Make a new shift.',
    blocks: [
      {
        type: 'steps',
        items: [
          'Press **New shift** → **Create manually**.',
          'Fill in the title, date and hours. Press **Add me** if you work it.',
          'Press **Create shift**.',
        ],
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    summary: 'See the result of what you did.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          'The result of each action pops up in the **corner**; errors say why.',
          'Review them under **grid button → Notifications** (phone: the bell).',
        ],
      },
    ],
  },
  {
    id: 'palette',
    title: 'Quick Search (Ctrl + K)',
    summary: 'Jump to pages, run actions, do time maths.',
    blocks: [
      {
        type: 'p',
        text: 'Press **Ctrl + K** (Mac: ⌘K; phone: avatar → Quick Search), type, then **Enter**.',
      },
      {
        type: 'table',
        head: ['Type', 'Get'],
        rows: [
          ['`pending`, `theme dark`', 'Go to that page / run that action'],
          ['A name: `mai`', "That person's shifts"],
          ['`08:00 + 4h30m`', '`12:30`'],
          ['`17:30 - 08:15`', '`9h 15m`'],
        ],
      },
    ],
  },
  {
    id: 'links',
    title: 'Sharing a link',
    summary: 'Copy the address and the other person sees exactly what you see.',
    blocks: [
      {
        type: 'p',
        text: 'The address in the address bar always matches the screen: copy it and send it, and the other person opens **the same page, date and filters** — including the **shift form you have open** (same shift, same highlighted person, same Simple / Advanced).',
      },
      {
        type: 'list',
        items: [
          'No address bar (app installed to the home screen)? Press **Ctrl + Shift + L** (Mac: ⌘⇧L), or the grid button → **Copy link** (phone: avatar → **Copy link**).',
          'On the **Schedule** and **Summary** the link always carries a specific date, today included — opened tomorrow, it still shows the day you were looking at.',
          'You can also share: the **claim a template** dialog (the template only; they pick their own days and locations), the **Activity** rows you have expanded, one section of this **Help** page (click it in the contents, then copy the link), and the **Forgot password** box.',
          'If they are not signed in yet, they land on that exact screen right after signing in.',
          'With a shift form or the claim dialog open, the browser’s **Back** button (swipe back on a phone) **closes it** instead of leaving the page.',
          'A link to a deleted shift shows *Could not open the shift* and opens the page as usual.',
        ],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account',
    summary: 'Profile, password and signing out.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          '**My profile**: grid button (phone: avatar) → My profile — email, name, join date, and whether you are working or have left.',
          'After your **leaving date** you can still sign in, but you only see your own profile.',
          '**Change password**: grid button (phone: avatar) → Change password.',
          '**Sign out**: press **twice**.',
          'Forgot your password: ask an admin to reset it.',
        ],
      },
    ],
  },
  {
    id: 'app',
    title: 'Install the app and going offline',
    summary: 'Open it like an app, read the schedule offline.',
    blocks: [
      {
        type: 'list',
        items: [
          '**Install app**: grid button (phone: avatar) → Install app. iPhone / iPad: open in Safari → **Share** → **Add to Home Screen**.',
          '**Offline**, the app still opens and shows the days / weeks / months **you opened while online in the last 2 days**. The yellow strip under the header says when that data was saved.',
          'Offline is **read-only**: creating, editing, claiming and checking in all wait for a connection. Nothing is sent later on its own — press again once you’re back online.',
          'When a **new version** is out, the app asks before reloading instead of jumping while you’re filling in a form.',
        ],
      },
      {
        type: 'note',
        text: 'Signing out wipes everything saved on this device — a shared computer keeps nobody’s schedule.',
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
        head: ['Problem', 'What to do'],
        rows: [
          ['No Confirm button', 'Too early, or past your end time — message an admin'],
          ['Cannot leave a shift', 'Over 30 minutes since joining, or checked in — message an admin'],
          ['Cannot edit / delete a shift', 'Other people are on it — message an admin'],
          ['Cannot change locations', 'You already checked in, or it is someone else’s assignment — message an admin'],
          ['The location you need is missing', 'It is hidden — message an admin'],
          ['Cannot claim because there is no location', 'No location is shown yet — ask an admin to add one in Manage locations'],
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
          '**Locations**: **New shift → Manage locations** (or type it in Quick Search) to add, rename, recolour, reorder, hide / show and delete. Renaming once updates every shift.',
          'A location **already used on a shift** can’t be deleted — **hide** it instead: old shifts keep the chip, but staff can no longer pick it. Admins can still set anyone’s locations, checked in or not, and may leave them empty when editing for someone. Claiming a shift yourself still needs at least one location, admins included — and with every location hidden nobody can claim.',
          '**Accounts** (grid button → Accounts): change display names, **hide** people from the schedule boards (say, a manager account that only looks). Hidden people still show where they have shifts.',
          'Also on Accounts: edit **Joined**. **Left on** is read-only here — it is set in the Supabase SQL Editor, always together with setting the role back to `staff` (sample statement in the README). From that date the person only sees their own profile; it does not hide them from the boards — switch them to **Hidden** if you want that.',
          'Making someone admin and changing roles happens in the Supabase SQL Editor — there is no way to do it in the site.',
        ],
      },
    ],
  },
]

export const HELP: Record<Lang, HelpSection[]> = { vi, en }
