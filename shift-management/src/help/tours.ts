import type { Lang } from '../i18n/translations'

/**
 * Kịch bản các bài hướng dẫn từng bước (wizard). Mỗi bước chỉ vào một phần tử
 * có `data-tour="<id>"` trên trang; TourProvider làm tối phần còn lại và hiện
 * thẻ giải thích cạnh nó.
 *
 * Nội dung dài nên không đi qua từ điển `t()`: mỗi bước mang sẵn chữ của cả
 * hai ngôn ngữ — `Record<Lang, …>` nên thiếu một ngôn ngữ là lỗi biên dịch.
 *
 * Đổi / xoá một `data-tour` trong component thì sửa kịch bản ở đây cùng lúc.
 */
export type TourId = 'basics' | 'claim' | 'shift' | 'checkin' | 'menu'

interface StepText {
  title: string
  body: string
  /** Hiện thay cho `body` khi không tìm thấy phần tử (ví dụ hôm nay chưa có ca). */
  missing?: string
}

export interface TourStep {
  /** Các `data-tour` thay thế nhau — lấy cái đầu tiên đang hiện trên trang. */
  targets?: string[]
  /** Chuyển tới trang này trước khi tìm phần tử. */
  route?: string
  /**
   * Chưa thấy phần tử thì bấm hộ những thứ này để mở nó ra (menu, form ca,
   * chế độ Đơn giản…). Mỗi lần bấm cái "sâu" nhất đang có trên trang, nên đã
   * mở sẵn thì không bấm lại.
   */
  ensure?: string[]
  /** Chỉ có ở PC (≥ 640px) hoặc chỉ ở điện thoại. Bỏ trống = cả hai. */
  screen?: 'desktop' | 'mobile'
  text: Record<Lang, StepText>
}

export interface Tour {
  id: TourId
  title: Record<Lang, string>
  steps: TourStep[]
}

const SHIFT_OPEN = ['timeline-block', 'mode-simple']
/**
 * Đường mở form nhận ca mẫu: nút Tạo ca (PC) hoặc nút tròn (điện thoại) →
 * Nhận ca mẫu → mẫu đầu tiên trong danh sách. Hai nút đầu chỉ một cái hiện
 * trên mỗi cỡ màn, nên để chung một danh sách.
 */
const CLAIM_OPEN = ['new-shift', 'fab', 'new-shift-from-template', 'new-shift-template-item']

export const TOURS: Record<TourId, Tour> = {
  basics: {
    id: 'basics',
    title: { vi: 'Làm quen giao diện', en: 'Getting around' },
    steps: [
      {
        route: '/',
        targets: ['nav'],
        screen: 'desktop',
        text: {
          vi: {
            title: 'Thanh điều hướng',
            body: 'Các trang chính: Lịch, Tất cả ca, Tổng kết, Ca của tôi, Chờ xác nhận, Nhật ký. Số vàng cạnh "Chờ xác nhận" là số lượt của bạn chưa điểm danh.',
          },
          en: {
            title: 'Navigation',
            body: 'The main pages: Schedule, All shifts, Summary, My shifts, Pending, Activity. The yellow number next to "Pending" counts your own assignments not checked in yet.',
          },
        },
      },
      {
        route: '/',
        targets: ['bottom-nav'],
        screen: 'mobile',
        text: {
          vi: {
            title: 'Thanh điều hướng',
            body: 'Bốn trang dùng nhiều nhất nằm ở đáy màn hình: Lịch, Tất cả ca, Ca của tôi, Chờ xác nhận. Các trang khác nằm trong bảng tài khoản (bấm avatar).',
          },
          en: {
            title: 'Navigation',
            body: 'The four pages you use most sit at the bottom: Schedule, All shifts, My shifts, Pending. The rest live in the account sheet (tap your avatar).',
          },
        },
      },
      {
        route: '/',
        targets: ['date-nav'],
        text: {
          vi: {
            title: 'Chọn ngày',
            body: 'Bấm ‹ › để lùi hay tới một ngày (tuần, tháng). Nút ở giữa đưa bạn về hôm nay.',
          },
          en: {
            title: 'Pick a day',
            body: 'Use ‹ › to step back or forward a day (week, month). The middle button jumps back to today.',
          },
        },
      },
      {
        route: '/',
        targets: ['view-switch'],
        text: {
          vi: {
            title: 'Ngày · Tuần · Tháng',
            body: 'Ngày: lịch chi tiết theo giờ. Tuần: mỗi người một hàng, cột Tổng là số giờ trong tuần. Tháng: nhìn cả tháng, bấm một ngày để xem chi tiết.',
          },
          en: {
            title: 'Day · Week · Month',
            body: 'Day: an hour-by-hour timeline. Week: one row per person, the Total column is their hours that week. Month: the whole month — tap a day to zoom in.',
          },
        },
      },
      {
        route: '/',
        targets: ['timeline'],
        text: {
          vi: {
            title: 'Đọc lịch',
            body: 'Mỗi hàng là một người — bạn luôn ở hàng đầu. Mỗi khối là một lượt: viền liền là đã điểm danh, viền nét đứt có đồng hồ là còn chờ. Vạch đỏ là giờ hiện tại. Bấm vào một khối để mở ca đó.',
          },
          en: {
            title: 'Reading the schedule',
            body: 'Each row is a person — you are always on top. Each block is one assignment: a solid border means checked in, a dashed border with a clock means still pending. The red line is the current time. Tap a block to open that shift.',
          },
        },
      },
      {
        targets: ['new-shift'],
        screen: 'desktop',
        text: {
          vi: {
            title: 'Tạo ca',
            body: 'Bấm để chọn: Nhận ca mẫu (chọn một ca lặp lại có sẵn rồi chọn ngày) hoặc Tạo ca thủ công. Bạn chỉ thêm được chính mình vào ca.',
          },
          en: {
            title: 'New shift',
            body: 'Press to choose: Claim a template (pick a recurring shift, then the days) or Create manually. You can only add yourself to a shift.',
          },
        },
      },
      {
        targets: ['fab'],
        screen: 'mobile',
        text: {
          vi: {
            title: 'Tạo ca',
            body: 'Nút tròn này mở hai lựa chọn: Nhận ca mẫu, hoặc Tạo ca thủ công vào đúng ngày đang xem.',
          },
          en: {
            title: 'New shift',
            body: 'This round button offers two choices: Claim a template, or Create manually on the day you are viewing.',
          },
        },
      },
      {
        targets: ['menu'],
        screen: 'desktop',
        text: {
          vi: {
            title: 'Menu',
            body: 'Thông báo, giao diện sáng / tối, Trạng thái, Hướng dẫn, đổi mật khẩu và đăng xuất đều nằm trong nút lưới này.',
          },
          en: {
            title: 'Menu',
            body: 'Notifications, light / dark theme, Status, Help, change password and sign out all live behind this grid button.',
          },
        },
      },
      {
        targets: ['account-mobile'],
        screen: 'mobile',
        text: {
          vi: {
            title: 'Tài khoản',
            body: 'Bấm avatar để mở: Tổng kết, Nhật ký, Hướng dẫn, đổi mật khẩu, ngôn ngữ, giao diện và đăng xuất.',
          },
          en: {
            title: 'Your account',
            body: 'Tap your avatar for Summary, Activity, Help, change password, language, theme and sign out.',
          },
        },
      },
      {
        screen: 'desktop',
        text: {
          vi: {
            title: 'Tìm nhanh — Ctrl + K',
            body: 'Bấm Ctrl + K ở bất cứ đâu để đi tới trang, chạy thao tác hay tính nhanh, ví dụ "08:00 + 4h30m" hay "hôm nay + 7 ngày". Xong rồi! Xem lại bất cứ lúc nào ở Menu → Hướng dẫn.',
          },
          en: {
            title: 'Quick search — Ctrl + K',
            body: 'Press Ctrl + K anywhere to jump to a page, run an action or do quick maths like "08:00 + 4h30m" or "today + 7 days". That\'s it! Find this again under Menu → Help.',
          },
        },
      },
    ],
  },

  claim: {
    id: 'claim',
    title: { vi: 'Nhận ca mẫu', en: 'Claiming a shift template' },
    steps: [
      {
        targets: ['new-shift'],
        screen: 'desktop',
        text: {
          vi: {
            title: 'Bấm "Tạo ca"',
            body: 'Ca mẫu nằm trong nút Tạo ca. Ca mẫu là những ca lặp lại admin đã tạo sẵn, ví dụ Trực trang 08:00–18:00.',
          },
          en: {
            title: 'Press "New shift"',
            body: 'Templates live behind the New shift button. A template is a recurring shift an admin set up, like Page Support 08:00–18:00.',
          },
        },
      },
      {
        targets: ['fab'],
        screen: 'mobile',
        text: {
          vi: {
            title: 'Bấm nút tròn',
            body: 'Ca mẫu nằm trong nút tạo ca. Ca mẫu là những ca lặp lại admin đã tạo sẵn, ví dụ Trực trang 08:00–18:00.',
          },
          en: {
            title: 'Press the round button',
            body: 'Templates live behind the new-shift button. A template is a recurring shift an admin set up, like Page Support 08:00–18:00.',
          },
        },
      },
      {
        targets: ['new-shift-from-template'],
        ensure: CLAIM_OPEN.slice(0, 2),
        text: {
          vi: {
            title: 'Chọn "Nhận ca mẫu"',
            body: 'Lựa chọn còn lại là Tạo ca thủ công — tự nhập tên, ngày, giờ.',
          },
          en: {
            title: 'Choose "Claim a template"',
            body: 'The other choice is Create manually — type the title, date and hours yourself.',
          },
        },
      },
      {
        targets: ['new-shift-templates'],
        ensure: CLAIM_OPEN.slice(0, 3),
        text: {
          vi: {
            title: 'Chọn một ca mẫu',
            body: 'Mỗi dòng là một mẫu, kèm giờ và các thứ nó lặp vào. Bấm vào mẫu bạn muốn làm.',
            missing: 'Chưa có ca mẫu nào — admin cần tạo trước (Tạo ca → Quản lý ca mẫu).',
          },
          en: {
            title: 'Pick a template',
            body: 'Each row is a template with its hours and the weekdays it repeats on. Press the one you want.',
            missing: 'There are no templates yet — an admin has to create them first (New shift → Manage templates).',
          },
        },
      },
      {
        targets: ['claim-days'],
        ensure: CLAIM_OPEN,
        text: {
          vi: {
            title: 'Chọn ngày',
            body: 'Chọn một hoặc nhiều ngày muốn nhận. Chỉ những ngày mẫu lặp vào mới chọn được; ngày bạn đã nhận rồi có dấu riêng.',
          },
          en: {
            title: 'Pick the days',
            body: 'Pick one or more days. Only days the template repeats on can be picked; days you already claimed are marked.',
          },
        },
      },
      {
        targets: ['claim-submit'],
        ensure: CLAIM_OPEN,
        text: {
          vi: {
            title: 'Nhận ca',
            body: 'Bấm nút này để nhận. Kết quả — thành công, hay lý do bị từ chối — hiện ở thông báo góc phải. Nhận xong bạn có 30 phút để đổi ý và rời ca.',
          },
          en: {
            title: 'Claim it',
            body: 'Press this to claim. The result — success, or why it was refused — pops up in the corner. After claiming you have 30 minutes to change your mind and leave.',
          },
        },
      },
    ],
  },

  shift: {
    id: 'shift',
    title: { vi: 'Mở và sửa ca của mình', en: 'Opening and editing your shift' },
    steps: [
      {
        route: '/',
        targets: ['timeline-block'],
        text: {
          vi: {
            title: 'Mở một ca',
            body: 'Bấm vào một khối trên lịch để mở ca đó.',
            missing: 'Ngày đang xem chưa có ca nào. Chuyển sang ngày có ca rồi chạy lại hướng dẫn.',
          },
          en: {
            title: 'Open a shift',
            body: 'Tap a block on the schedule to open that shift.',
            missing: 'There are no shifts on this day. Switch to a day with shifts and run this guide again.',
          },
        },
      },
      {
        route: '/',
        targets: ['mode-toggle'],
        ensure: ['timeline-block'],
        text: {
          vi: {
            title: 'Đơn giản · Nâng cao',
            body: 'Đơn giản chỉ hiện phần của bạn — đủ cho hầu hết việc hằng ngày. Nâng cao là form đầy đủ của cả ca. Form nhớ chế độ bạn chọn lần trước.',
          },
          en: {
            title: 'Simple · Advanced',
            body: 'Simple shows only your part — enough for most day-to-day things. Advanced is the full form for the whole shift. The form remembers your last choice.',
          },
        },
      },
      {
        route: '/',
        targets: ['simple-mine'],
        ensure: SHIFT_OPEN,
        text: {
          vi: {
            title: 'Phần của bạn',
            body: 'Sửa giờ và ghi chú của bạn ở đây ("Cả ca" đưa về khung giờ của ca), rồi bấm Lưu thay đổi ở chân form. Chưa có trong ca thì bấm Nhận ca này.',
          },
          en: {
            title: 'Your part',
            body: 'Edit your hours and note here ("Whole shift" snaps back to the shift\'s window), then press Save changes at the bottom. Not on the shift yet? Press Join this shift.',
          },
        },
      },
      {
        route: '/',
        targets: ['simple-actions'],
        ensure: SHIFT_OPEN,
        text: {
          vi: {
            title: 'Điểm danh · Rời ca',
            body: 'Điểm danh mở từ 30 phút trước giờ vào đến khi hết giờ của bạn. Rời ca chỉ được trong 30 phút đầu sau khi nhận — nút ghi rõ hạn.',
            missing: 'Lượt này đã điểm danh nên đã khoá: chỉ còn sửa được ghi chú.',
          },
          en: {
            title: 'Check in · Leave',
            body: 'Check-in opens 30 minutes before your start and closes at your end time. You can only leave within 30 minutes of joining — the button shows the deadline.',
            missing: 'This assignment is already checked in, so it is locked: only the note can change.',
          },
        },
      },
      {
        route: '/',
        targets: ['simple-others'],
        ensure: SHIFT_OPEN,
        text: {
          vi: {
            title: 'Người khác trong ca',
            body: 'Phần của người khác chỉ để xem — chỉ admin sửa hay gỡ được. Ghi chú chung của ca thì ai cũng sửa được (ở chế độ Nâng cao).',
          },
          en: {
            title: 'Others on the shift',
            body: 'Other people\'s parts are view-only — only an admin can change or remove them. The shift\'s own note is editable by anyone (in Advanced).',
          },
        },
      },
    ],
  },

  checkin: {
    id: 'checkin',
    title: { vi: 'Điểm danh', en: 'Checking in' },
    steps: [
      {
        route: '/pending',
        targets: ['nav-/pending'],
        screen: 'desktop',
        text: {
          vi: {
            title: 'Chờ xác nhận',
            body: 'Điểm danh ở trang này: nó liệt kê các lượt chưa điểm danh. Số vàng cạnh mục là số lượt của bạn đang chờ.',
          },
          en: {
            title: 'Pending',
            body: 'Check in from this page: it lists assignments not checked in yet. The yellow number next to it counts your own.',
          },
        },
      },
      {
        route: '/pending',
        targets: ['bottom-/pending'],
        screen: 'mobile',
        text: {
          vi: {
            title: 'Chờ xác nhận',
            body: 'Điểm danh ở trang này: nó liệt kê các lượt chưa điểm danh. Số vàng trên biểu tượng là số lượt của bạn đang chờ.',
          },
          en: {
            title: 'Pending',
            body: 'Check in from this page: it lists assignments not checked in yet. The yellow number on the icon counts your own.',
          },
        },
      },
      {
        route: '/pending',
        targets: ['pending-only-mine'],
        text: {
          vi: {
            title: 'Chỉ ca của tôi',
            body: 'Mặc định chỉ hiện lượt của bạn. Bỏ tích để xem cả nhóm còn ai chưa điểm danh.',
          },
          en: {
            title: 'Only my shifts',
            body: 'By default only your own assignments show. Untick it to see who on the team has not checked in yet.',
          },
        },
      },
      {
        route: '/pending',
        targets: ['shift-card'],
        text: {
          vi: {
            title: 'Một thẻ là một ca',
            body: 'Mỗi thẻ là một ca còn lượt chờ: tên ca, giờ của bạn và trạng thái.',
            missing: 'Không còn lượt nào chờ điểm danh — bạn đã xong hết.',
          },
          en: {
            title: 'One card per shift',
            body: 'Each card is a shift with something still pending: the shift, your hours and your status.',
            missing: 'Nothing is waiting for check-in — you are all done.',
          },
        },
      },
      {
        route: '/pending',
        targets: ['confirm'],
        text: {
          vi: {
            title: 'Bấm "Xác nhận" để điểm danh',
            body: 'Nút chỉ hiện từ 30 phút trước giờ vào đến khi hết giờ của bạn. Bấm trước giờ bắt đầu thì sẽ được hỏi lại một lần.',
            missing: 'Hiện không có lượt nào trong giờ điểm danh — thay cho nút là dòng "Mở điểm danh lúc …". Nút Xác nhận sẽ tự hiện khi tới giờ, không cần tải lại trang.',
          },
          en: {
            title: 'Press "Confirm" to check in',
            body: 'The button only appears from 30 minutes before your start until your end time. Pressing it before you start asks once more.',
            missing: 'None of your assignments is in its check-in window right now — instead of the button you see "Check-in opens …". Confirm appears on its own when it is time, no reload needed.',
          },
        },
      },
      {
        text: {
          vi: {
            title: 'Nhớ nhé',
            body: 'Quá giờ kết thúc thì không điểm danh trễ được — liên hệ admin. Điểm danh xong thì lượt bị khoá: không sửa giờ, không rời ca. Tổng kết chỉ tính lượt đã điểm danh và đã hết giờ.',
          },
          en: {
            title: 'Keep in mind',
            body: 'After your end time you cannot check in late — contact an admin. Once checked in, the assignment is locked: no hour changes, no leaving. Summary only counts assignments that are checked in and finished.',
          },
        },
      },
    ],
  },

  menu: {
    id: 'menu',
    title: { vi: 'Menu và thông báo', en: 'Menu and notifications' },
    steps: [
      {
        targets: ['menu'],
        screen: 'desktop',
        text: {
          vi: { title: 'Nút lưới', body: 'Mọi thứ về tài khoản và thông báo nằm sau nút này. Số đỏ trên nút là số thông báo chưa đọc.' },
          en: { title: 'The grid button', body: 'Everything about your account and notifications is behind this button. The red number is your unread notifications.' },
        },
      },
      {
        targets: ['menu-notifications'],
        ensure: ['menu'],
        screen: 'desktop',
        text: {
          vi: { title: 'Thông báo', body: 'Kết quả mọi thao tác — lưu ca, nhận ca, điểm danh, kể cả lỗi — được giữ ở đây: xem lại, đánh dấu đã đọc, xoá.' },
          en: { title: 'Notifications', body: 'The result of everything you do — saving, claiming, checking in, errors too — is kept here to review, mark as read or delete.' },
        },
      },
      {
        targets: ['menu-theme'],
        ensure: ['menu'],
        screen: 'desktop',
        text: {
          vi: { title: 'Giao diện', body: 'Bấm để đổi lần lượt Hệ thống → Sáng → Tối.' },
          en: { title: 'Theme', body: 'Press to cycle System → Light → Dark.' },
        },
      },
      {
        targets: ['menu-help'],
        ensure: ['menu'],
        screen: 'desktop',
        text: {
          vi: { title: 'Hướng dẫn', body: 'Mở lại trang hướng dẫn và các bài từng bước bất cứ lúc nào.' },
          en: { title: 'Help', body: 'Come back to the guide and the step-by-step tours any time.' },
        },
      },
      {
        targets: ['menu-signout'],
        ensure: ['menu'],
        screen: 'desktop',
        text: {
          vi: { title: 'Đăng xuất', body: 'Phải bấm hai lần: lần đầu ô chuyển đỏ, bấm tiếp trong 4 giây mới đăng xuất — để không lỡ tay.' },
          en: { title: 'Sign out', body: 'Press twice: the first press turns the tile red, a second press within 4 seconds signs you out — so it never happens by accident.' },
        },
      },
      {
        targets: ['bell-mobile'],
        screen: 'mobile',
        text: {
          vi: { title: 'Thông báo', body: 'Kết quả mọi thao tác được giữ ở chuông này: xem lại, đánh dấu đã đọc, xoá.' },
          en: { title: 'Notifications', body: 'The result of everything you do is kept behind this bell to review, mark as read or delete.' },
        },
      },
      {
        targets: ['account-mobile'],
        screen: 'mobile',
        text: {
          vi: { title: 'Tài khoản', body: 'Giao diện, ngôn ngữ, đổi mật khẩu, Hướng dẫn và đăng xuất (bấm hai lần) nằm trong bảng mở ra khi bấm avatar.' },
          en: { title: 'Your account', body: 'Theme, language, change password, Help and sign out (press twice) are in the sheet behind your avatar.' },
        },
      },
    ],
  },
}

export const TOUR_ORDER: TourId[] = ['basics', 'claim', 'shift', 'checkin', 'menu']

/** Các bước sẽ chạy trên màn hình hiện tại (bỏ bước dành cho cỡ màn khác). */
export function stepsFor(id: TourId): TourStep[] {
  const desktop = window.matchMedia('(min-width: 640px)').matches
  return TOURS[id].steps.filter(
    (s) => !s.screen || (s.screen === 'desktop') === desktop,
  )
}
