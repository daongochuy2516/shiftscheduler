-- =====================================================================
-- Shift Scheduler — migration 004: màu cho ca mẫu
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 002_shift_templates.sql trước. Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================
--
-- Khoá màu trong bảng màu của frontend (src/lib/colors.ts), ví dụ 'teal'.
-- NULL = chưa chọn: frontend tự hash theo id ca mẫu, nên mọi ca tạo từ cùng
-- một ca mẫu vẫn cùng màu.
--
-- Không cần sửa trigger nhật ký: nó so sánh cả dòng dạng JSON nên đổi màu
-- tự được ghi thành 'template.updated'.

alter table public.shift_templates
  add column if not exists color text;

alter table public.shift_templates
  drop constraint if exists shift_templates_color_format;
alter table public.shift_templates
  add constraint shift_templates_color_format
  check (color is null or color ~ '^[a-z]{1,20}$');
