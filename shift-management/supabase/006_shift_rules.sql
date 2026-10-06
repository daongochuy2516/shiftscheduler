-- =====================================================================
-- Shift Scheduler — migration 006: nhân viên chỉ thao tác phần của mình
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 005_attendance.sql trước. Chạy lại nhiều lần vẫn an toàn.
--
-- Thay luật 4 của 005 ("không xoá ca đã tạo quá 30 phút") bằng:
--
-- LUẬT CHO NHÂN VIÊN (role = 'staff')
--   A. Tự rời ca: chỉ trong 30 phút đầu kể từ lúc nhận ca (created_at của
--      lượt phân công). Quá 30 phút thì chỉ admin rút ra được.
--   B. Gỡ người khác khỏi ca: chỉ admin — kể cả khi họ chưa điểm danh.
--   C. Thêm người khác vào ca: chỉ admin — cả khi tạo ca, thêm dòng, hay
--      đổi người trên dòng của mình. Nhân viên chỉ thêm chính mình (nhận ca).
--   D. Lượt của người khác: chỉ admin sửa được (giờ, ghi chú, trạng thái,
--      người, ca).
--   E. Ca có người khác: chỉ admin sửa được tên, ngày, giờ của ca và xoá
--      ca. Ghi chú của ca thì ai cũng sửa được — nó là chỗ nhắn nhau.
--   F. Xoá ca: ca trống thì lúc nào cũng được. Ca chỉ có mình thì được khi
--      mình còn rời được (chưa điểm danh, chưa quá 30 phút) — không thì xoá
--      ca thành đường lách luật A.
--
-- Các luật khác của 005 giữ nguyên: lượt đã điểm danh bị khoá, ca đã có
-- người điểm danh không xoá / đổi ngày được, cửa sổ điểm danh.
--
-- Ghi đè hai hàm trigger của 005 (cùng tên), trigger không đổi.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Chạy 005_attendance.sql trước migration này.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. AI ĐƯỢC GỠ MỘT LƯỢT RA KHỎI CA
-- ---------------------------------------------------------------------
-- Dùng chung cho xoá lượt và chuyển lượt sang ca khác. Admin không gọi tới.

create or replace function public.assert_can_remove_assignment(
  p public.shift_assignments
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p.status = 'confirmed' then
    raise exception 'Bạn không có quyền gỡ lượt đã điểm danh.'
      using errcode = '42501';
  end if;
  if p.user_id is distinct from auth.uid() then
    raise exception 'Bạn không có quyền gỡ người khác khỏi ca.'
      using errcode = '42501';
  end if;
  if p.created_at < now() - interval '30 minutes' then
    raise exception 'Bạn không có quyền rời ca sau 30 phút kể từ lúc nhận.'
      using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. LUẬT TRÊN PHÂN CÔNG (thay bản của 005)
-- ---------------------------------------------------------------------

create or replace function public.enforce_attendance_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_me    uuid    := auth.uid();
  v_date  date;
begin
  if TG_OP = 'DELETE' then
    if v_admin then
      return OLD;
    end if;
    -- Ca cha đã biến mất: dòng này bị cascade xoá theo khi xoá cả ca, và
    -- luật xoá ca (mục 3) đã quyết định cho phép rồi. Cascade chạy sau khi
    -- dòng ca đã xoá nên ở đây không còn thấy nó.
    if not exists (select 1 from public.shifts s where s.id = OLD.shift_id) then
      return OLD;
    end if;
    perform public.assert_can_remove_assignment(OLD);
    return OLD;
  end if;

  if not v_admin then
    -- D. Lượt của người khác. So từng cột chứ không chặn mọi UPDATE: lưu form
    -- ghi lại cả những dòng không đổi, và những lần đó phải đi qua được.
    if TG_OP = 'UPDATE' and OLD.user_id is distinct from v_me and (
         NEW.user_id    is distinct from OLD.user_id
      or NEW.shift_id   is distinct from OLD.shift_id
      or NEW.start_time is distinct from OLD.start_time
      or NEW.end_time   is distinct from OLD.end_time
      or NEW.status     is distinct from OLD.status
      or NEW.note       is distinct from OLD.note
    ) then
      raise exception 'Bạn không có quyền sửa lượt của người khác.'
        using errcode = '42501';
    end if;

    -- C. Thêm người khác: dòng mới mang tên người khác, hoặc đổi dòng của
    -- mình sang tên người khác.
    if NEW.user_id is distinct from v_me
       and (TG_OP = 'INSERT' or NEW.user_id is distinct from OLD.user_id) then
      raise exception 'Bạn không có quyền thêm người khác vào ca.'
        using errcode = '42501';
    end if;

    -- Chuyển lượt của mình sang ca khác = rời ca này (luật A).
    if TG_OP = 'UPDATE' and NEW.shift_id is distinct from OLD.shift_id then
      perform public.assert_can_remove_assignment(OLD);
    end if;
  end if;

  if TG_OP = 'UPDATE' and OLD.status = 'confirmed' then
    if NEW.status = 'confirmed' then
      if not v_admin and (
           NEW.start_time <> OLD.start_time
        or NEW.end_time   <> OLD.end_time
        or NEW.user_id    <> OLD.user_id
        or NEW.shift_id   <> OLD.shift_id
      ) then
        raise exception 'Bạn không có quyền sửa giờ của lượt đã điểm danh.'
          using errcode = '42501';
      end if;
      NEW.confirmed_at := OLD.confirmed_at;
    else
      if not v_admin then
        raise exception 'Bạn không có quyền bỏ điểm danh.'
          using errcode = '42501';
      end if;
      NEW.confirmed_at := null;
    end if;
    return NEW;
  end if;

  -- Từ đây: dòng mới, hoặc dòng đang chờ xác nhận.
  if NEW.status <> 'confirmed' then
    NEW.confirmed_at := null;
    return NEW;
  end if;

  if not v_admin then
    if NEW.user_id is distinct from v_me then
      raise exception 'Bạn không có quyền điểm danh cho người khác.'
        using errcode = '42501';
    end if;

    select s.date into v_date from public.shifts s where s.id = NEW.shift_id;
    if not public.attendance_window_open(v_date, NEW.start_time, NEW.end_time) then
      raise exception
        'Bạn không có quyền điểm danh ngoài giờ: chỉ từ 30 phút trước giờ bắt đầu đến giờ kết thúc của bạn.'
        using errcode = '42501';
    end if;
  end if;

  NEW.confirmed_at := now();
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. LUẬT TRÊN CA (thay bản của 005)
-- ---------------------------------------------------------------------
-- Bỏ hạn "tạo quá 30 phút". Thay bằng luật E và F.

create or replace function public.enforce_shift_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_confirmed boolean;
  v_others    boolean;
  v_late      boolean;
begin
  if public.is_admin() then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  select
    coalesce(bool_or(a.status = 'confirmed'), false),
    coalesce(bool_or(a.user_id is distinct from v_me), false),
    coalesce(bool_or(a.user_id = v_me
                     and a.created_at < now() - interval '30 minutes'), false)
  into v_confirmed, v_others, v_late
  from public.shift_assignments a
  where a.shift_id = OLD.id;

  if TG_OP = 'DELETE' then
    if v_others then
      raise exception 'Bạn không có quyền xoá ca có người khác.'
        using errcode = '42501';
    end if;
    if v_confirmed then
      raise exception 'Bạn không có quyền xoá ca đã có người điểm danh.'
        using errcode = '42501';
    end if;
    -- F. Không rời được thì cũng không xoá được.
    if v_late then
      raise exception 'Bạn không có quyền xoá ca sau 30 phút kể từ lúc nhận.'
        using errcode = '42501';
    end if;
    return OLD;
  end if;

  -- E. Ca có người khác: tên / ngày / giờ thuộc về cả nhóm trong ca.
  -- Cố ý không xét `note`: ghi chú của ca luôn sửa được.
  if v_others and (
       NEW.title       is distinct from OLD.title
    or NEW.date        is distinct from OLD.date
    or NEW.start_time  is distinct from OLD.start_time
    or NEW.end_time    is distinct from OLD.end_time
    or NEW.template_id is distinct from OLD.template_id
  ) then
    raise exception 'Bạn không có quyền sửa tên, ngày và giờ của ca có người khác.'
      using errcode = '42501';
  end if;

  if NEW.date <> OLD.date and v_confirmed then
    raise exception 'Bạn không có quyền đổi ngày của ca đã có người điểm danh.'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;
