/**
 * Ô tích tự vẽ, thay cho checkbox gốc của trình duyệt (mỗi trình duyệt một
 * kiểu, không theo chế độ tối, không có hiệu ứng).
 *
 * Vẫn giữ một `<input type="checkbox">` thật, trong suốt, phủ đúng lên ô vẽ:
 * bấm vào `<label>` bọc ngoài, phím Space, tiêu điểm và trình đọc màn hình đều
 * chạy như checkbox thường mà không phải tự làm lại. Phần nhìn (`.checkbox-box`,
 * nét tích vẽ dần) nằm trong index.css.
 *
 * `className` là cỡ ô, ví dụ `h-4 w-4` — truyền đúng cỡ của chỗ dùng.
 */
export function Checkbox({
  checked,
  onChange,
  disabled = false,
  className = 'h-4 w-4',
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 m-0 h-full w-full opacity-0"
      />
      <span
        aria-hidden="true"
        className="checkbox-box pointer-events-none flex h-full w-full items-center justify-center rounded-[0.3rem] border border-slate-300 bg-white text-white shadow-xs transition peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-hover:border-slate-400 peer-checked:peer-hover:border-indigo-700 peer-checked:peer-hover:bg-indigo-700 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40 peer-focus-visible:ring-offset-1 peer-active:scale-90 peer-disabled:opacity-50"
      >
        <svg viewBox="0 0 16 16" fill="none" className="checkbox-mark h-[80%] w-[80%]">
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.75"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  )
}
