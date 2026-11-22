/**
 * Copy chữ vào clipboard, trả về có copy được không.
 *
 * `navigator.clipboard` chỉ có trong secure context (https, localhost) và có
 * trình duyệt từ chối khi trang không có focus — lúc đó lùi về cách cũ
 * (`execCommand('copy')` trên một ô ẩn), vẫn chạy được trong lượt bấm.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Rơi xuống cách cũ bên dưới.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    // Ngoài màn hình, không để bàn phím ảo bật lên hay trang nhảy cuộn.
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
