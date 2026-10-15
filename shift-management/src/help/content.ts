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
          ['07:30 ngày mai', '**Mở điểm danh** — 30 phút trước giờ vào của riêng bạn'],
          ['12:00 ngày mai', '**Đóng điểm danh** — không thể tự điểm danhp (nếu bạn có làm việc vào ca này nhưng quên điểm danh thì nhắn admin xem xét điểm danh bù)'],
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
          'Tích **Chỉ nhân viên có ca** để ẩn hàng trống.',
        ],
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
          'Chọn mẫu bạn muốn làm.',
          'Chọn ngày trong lịch (có nút chọn cả tuần / cả tháng).',
          'Bấm **Nhận**.',
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
    id: 'account',
    title: 'Tài khoản',
    summary: 'Mật khẩu và đăng xuất.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          '**Đổi mật khẩu**: nút lưới (điện thoại: avatar) → Đổi mật khẩu.',
          '**Đăng xuất**: bấm **hai lần**.',
          'Quên mật khẩu: nhờ admin đặt lại.',
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
        head: ['Vướng', 'Làm gì'],
        rows: [
          ['Không thấy nút Xác nhận', 'Chưa tới giờ, hoặc đã qua giờ kết thúc — nhắn admin'],
          ['Không rời được ca', 'Đã quá 30 phút hoặc đã điểm danh — nhắn admin'],
          ['Không sửa / xoá được ca', 'Ca có người khác — nhắn admin'],
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
          'Tick **Only staff with shifts** to hide empty rows.',
        ],
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
          'Pick the template you want.',
          'Pick the days in the calendar (there are quick picks for the week / month).',
          'Press **Claim**.',
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
    id: 'account',
    title: 'Account',
    summary: 'Password and signing out.',
    tour: 'menu',
    blocks: [
      {
        type: 'list',
        items: [
          '**Change password**: grid button (phone: avatar) → Change password.',
          '**Sign out**: press **twice**.',
          'Forgot your password: ask an admin to reset it.',
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
        head: ['Problem', 'What to do'],
        rows: [
          ['No Confirm button', 'Too early, or past your end time — message an admin'],
          ['Cannot leave a shift', 'Over 30 minutes since joining, or checked in — message an admin'],
          ['Cannot edit / delete a shift', 'Other people are on it — message an admin'],
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
