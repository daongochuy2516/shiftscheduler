-- =====================================================================
-- Shift Scheduler — migration 013: gộp ca mẫu page / discord thành
-- Sáng / Chiều / Tối, nơi trực chuyển vào từng lượt
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 012_locations.sql trước. Chạy lại vẫn an toàn: khi ca mẫu cũ đã
-- hết thì file chỉ báo NOTICE và không làm gì.
--
-- Chuyển dữ liệu MỘT LẦN, riêng cho dữ liệu đang có (Thinkmay): 6 ca mẫu
-- "<Khung> - Trực page" / "<Khung> - Trực discord" thực chất là 3 khung giờ
-- × 2 nơi trực, nên mỗi ngày mỗi khung có hai ca song song và rất nhiều
-- người đứng cả hai ca cùng giờ. File này:
--
--   1. Tạo nơi trực Fanpage (indigo) và Discord (teal) nếu chưa có.
--   2. Tạo 3 ca mẫu Sáng / Chiều / Tối (giữ giờ, màu lấy từ bản "page" cũ);
--      đã có ca mẫu cùng tên cùng giờ thì dùng lại.
--   3. Mỗi (ngày, khung): giữ ca tạo sớm nhất, đổi tên thành tên khung, trỏ
--      sang ca mẫu mới, gộp ghi chú ca (các ghi chú khác nhau nối bằng xuống
--      dòng). Mỗi người trong khung đó còn đúng MỘT lượt, mang nơi trực của
--      mọi ca cũ họ có mặt; bên nào đã điểm danh thì lượt gộp là đã điểm
--      danh, giờ điểm danh lấy mốc sớm nhất.
--   4. Xoá 6 ca mẫu cũ.
--
-- Chỉ đụng ca mẫu có tên ĐÚNG dạng trên; ca mẫu khác và ca tự tạo giữ nguyên.
--
-- Trigger người dùng trên shifts / shift_assignments / shift_templates /
-- locations bị TẮT trong lúc chuyển rồi BẬT lại trước khi commit:
--   - không sinh vài trăm dòng nhật ký cho một lần chuyển đổi hệ thống
--     (nhật ký cũ giữ nguyên, không sửa audit);
--   - không bị luật chấm công chặn (lượt đã điểm danh vẫn phải gộp được);
--   - không đụng updated_at.
-- Vì trigger chuẩn hoá location_ids cũng tắt, file tự ghi mảng đã chuẩn hoá
-- bằng normalize_location_ids (012).
--
-- Cả file là một transaction: lỗi ở bất kỳ đâu thì mọi thứ (kể cả việc tắt
-- trigger) được rollback, dữ liệu như chưa chạy. Trong lúc chạy, các bảng bị
-- khoá ghi — người đang dùng app chỉ phải chờ vài giây.
--
-- Sau khi chạy: deploy bản web mới (bản cũ vẫn đọc được, nhưng nhận ca mẫu
-- cũ sẽ lỗi vì ca mẫu đã bị xoá).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. KIỂM TRA 012 ĐÃ CHẠY
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('public.locations') is null
     or to_regprocedure('public.normalize_location_ids(uuid[])') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'shift_assignments'
         and column_name = 'location_ids'
     ) then
    raise exception 'Chạy 012_locations.sql trước migration này.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. TẮT TRIGGER NGƯỜI DÙNG
-- ---------------------------------------------------------------------
-- `user` chỉ tắt trigger tự viết; trigger nội bộ của khoá ngoại (cascade,
-- set null) vẫn chạy.

alter table public.shifts            disable trigger user;
alter table public.shift_assignments disable trigger user;
alter table public.shift_templates   disable trigger user;
alter table public.locations         disable trigger user;

-- ---------------------------------------------------------------------
-- 3. CHUYỂN DỮ LIỆU
-- ---------------------------------------------------------------------

do $$
declare
  -- Tên ca mẫu cũ. normalize(NFC) để chữ có dấu gõ kiểu tổ hợp vẫn khớp.
  c_pattern constant text := '^(Sáng|Chiều|Tối) - [Tt]rực ([Pp]age|[Dd]iscord)$';

  v_old_count     integer;
  v_creator       uuid;
  v_fanpage       uuid;
  v_discord       uuid;
  v_tpl           uuid;
  r               record;

  v_tpl_created   integer := 0;
  v_tpl_deleted   integer;
  v_asg_merged    integer;
  v_asg_kept      integer;
  v_shift_deleted integer;
  v_shift_kept    integer;
  v_time_diff     integer;
begin
  -- a. Ca mẫu cũ, kèm khung và nơi trực suy ra từ tên.
  create temp table _m013_old_tpl on commit drop as
  select
    t.id,
    split_part(normalize(t.title, NFC), ' - ', 1)                        as slot,
    case when normalize(t.title, NFC) ~* 'page$' then 'Fanpage'
         else 'Discord' end                                               as loc_name,
    null::uuid                                                            as loc_id,
    t.start_time, t.end_time, t.color, t.weekdays, t.note, t.is_active,
    t.created_by, t.created_at
  from public.shift_templates t
  where normalize(t.title, NFC) ~ c_pattern;

  select count(*) into v_old_count from _m013_old_tpl;
  if v_old_count = 0 then
    raise notice '013: không còn ca mẫu dạng "<Khung> - Trực page/discord" — không có gì để chuyển.';
    return;
  end if;

  -- Gộp hai ca mẫu khác giờ vào một khung là sai: dừng để người dùng xem lại.
  if exists (
    select 1 from _m013_old_tpl
    group by slot
    having count(distinct start_time) > 1 or count(distinct end_time) > 1
  ) then
    raise exception '013: hai ca mẫu cũ cùng khung nhưng khác giờ — kiểm tra lại shift_templates trước khi gộp.';
  end if;

  -- Người tạo nơi trực / ca mẫu mới: người đã tạo ca mẫu cũ (admin). Chạy
  -- trong SQL Editor thì auth.uid() là null.
  select o.created_by into v_creator
  from _m013_old_tpl o
  where o.created_by is not null
  order by o.created_at, o.id
  limit 1;

  -- b. Nơi trực.
  select l.id into v_fanpage from public.locations l where lower(l.name) = 'fanpage';
  if v_fanpage is null then
    insert into public.locations (name, color, sort_order, created_by)
    values ('Fanpage', 'indigo', 1, v_creator)
    returning id into v_fanpage;
  end if;

  select l.id into v_discord from public.locations l where lower(l.name) = 'discord';
  if v_discord is null then
    insert into public.locations (name, color, sort_order, created_by)
    values ('Discord', 'teal', 2, v_creator)
    returning id into v_discord;
  end if;

  -- Bảng tạm, cập nhật mọi dòng; `where` chỉ để SQL Editor không cảnh báo
  -- "UPDATE không có WHERE" (lúc này loc_id của mọi dòng đều đang null).
  update _m013_old_tpl
  set loc_id = case loc_name when 'Fanpage' then v_fanpage else v_discord end
  where loc_id is null;

  -- c. Ca mẫu mới, mỗi khung một. Thuộc tính lấy từ bản "page"; khung còn
  -- bật nếu một trong hai bản cũ đang bật.
  create temp table _m013_slot (
    slot       text primary key,
    start_time time not null,
    end_time   time not null,
    new_tpl    uuid not null
  ) on commit drop;

  for r in
    select distinct on (o.slot)
      o.slot, o.start_time, o.end_time, o.color, o.weekdays, o.note, o.created_by,
      bool_or(o.is_active) over (partition by o.slot) as any_active
    from _m013_old_tpl o
    order by o.slot, (o.loc_name = 'Fanpage') desc, o.created_at, o.id
  loop
    v_tpl := null;
    select t.id into v_tpl
    from public.shift_templates t
    where normalize(t.title, NFC) = r.slot
      and t.start_time = r.start_time
      and t.end_time   = r.end_time
      and t.id not in (select o.id from _m013_old_tpl o)
    order by t.created_at, t.id
    limit 1;

    if v_tpl is null then
      insert into public.shift_templates
        (title, start_time, end_time, note, weekdays, is_active, color, created_by)
      values
        (r.slot, r.start_time, r.end_time, r.note, r.weekdays, r.any_active, r.color,
         coalesce(r.created_by, v_creator))
      returning id into v_tpl;
      v_tpl_created := v_tpl_created + 1;
    end if;

    insert into _m013_slot values (r.slot, r.start_time, r.end_time, v_tpl);
  end loop;

  -- d. Ca thuộc phạm vi gộp: ca của ca mẫu cũ, cộng ca đã có của ca mẫu mới
  -- (nếu ca mẫu mới được dùng lại và đã có người nhận) — không thì ca đó sẽ
  -- đụng chỉ mục (template_id, date) khi ca giữ lại trỏ sang ca mẫu mới.
  -- Ca giữ lại = tạo sớm nhất trong (ngày, khung), hoà thì theo id.
  create temp table _m013_shift on commit drop as
  with scope as (
    select s.id, s.date, s.created_at, s.note, o.slot, o.loc_id
    from public.shifts s
    join _m013_old_tpl o on o.id = s.template_id
    union all
    select s.id, s.date, s.created_at, s.note, sl.slot, null::uuid
    from public.shifts s
    join _m013_slot sl on sl.new_tpl = s.template_id
  )
  select
    sc.*,
    first_value(sc.id) over w                       as keeper,
    row_number()       over w                       as rn,
    count(*)           over (partition by sc.date, sc.slot) as n
  from scope sc
  window w as (partition by sc.date, sc.slot order by sc.created_at, sc.id);

  -- e. Lượt trong phạm vi. Mỗi (ca giữ lại, người) giữ đúng một lượt: ưu
  -- tiên lượt đã điểm danh (giờ của nó là giờ thật đã trực), rồi lượt đang
  -- ở ca giữ lại, rồi lượt nhận sớm nhất.
  create temp table _m013_asg on commit drop as
  select
    a.id, a.shift_id, a.user_id, a.status, a.confirmed_at, a.created_at,
    a.start_time, a.end_time, a.note, a.location_ids,
    m.keeper, m.loc_id,
    first_value(a.id) over w as keep_asg,
    row_number()      over w as rn
  from public.shift_assignments a
  join _m013_shift m on m.id = a.shift_id
  window w as (
    partition by m.keeper, a.user_id
    order by (a.status = 'confirmed') desc, (a.shift_id = m.keeper) desc,
             a.created_at, a.id
  );

  create temp table _m013_merge on commit drop as
  select
    g.keep_asg,
    g.keeper,
    count(*) as n,
    -- Nơi trực của mọi ca cũ người đó có mặt + nơi trực lượt đã có sẵn.
    public.normalize_location_ids(
      array_agg(g.loc_id)
      || coalesce((
           select array_agg(x)
           from _m013_asg g2, unnest(g2.location_ids) as u(x)
           where g2.keep_asg = g.keep_asg
         ), '{}')
    ) as location_ids,
    bool_or(g.status = 'confirmed')                              as confirmed,
    min(g.confirmed_at) filter (where g.status = 'confirmed')    as confirmed_at,
    min(g.created_at)                                            as created_at,
    -- Ghi chú khác nhau của các lượt trùng: nối lại, của lượt giữ lại trước.
    (
      select string_agg(x.note, E'\n' order by x.rn)
      from (
        select btrim(g3.note) as note, min(g3.rn) as rn
        from _m013_asg g3
        where g3.keep_asg = g.keep_asg
          and nullif(btrim(g3.note), '') is not null
        group by btrim(g3.note)
      ) x
    ) as note,
    count(distinct g.start_time) > 1
      or count(distinct g.end_time) > 1                          as time_diff
  from _m013_asg g
  group by g.keep_asg, g.keeper;

  select count(*) into v_time_diff from _m013_merge where time_diff;
  if v_time_diff > 0 then
    raise notice '013: % người có hai lượt trùng khung nhưng khác giờ — giữ giờ của lượt đã điểm danh / lượt ở ca giữ lại.', v_time_diff;
  end if;

  -- f. Xoá lượt thừa TRƯỚC khi chuyển lượt giữ lại sang ca giữ lại, để chỉ
  -- mục (shift_id, user_id) không bao giờ thấy hai dòng cùng người.
  delete from public.shift_assignments a
  using _m013_asg g
  where g.id = a.id and g.id <> g.keep_asg;
  get diagnostics v_asg_merged = row_count;

  update public.shift_assignments a
  set shift_id     = m.keeper,
      location_ids = m.location_ids,
      status       = case when m.confirmed then 'confirmed' else a.status end,
      confirmed_at = case when m.confirmed then m.confirmed_at else null end,
      -- Mốc nhận ca sớm nhất: luật rời ca 30 phút tính theo lần nhận đầu.
      created_at   = m.created_at,
      note         = case when m.n > 1 then m.note else a.note end
  from _m013_merge m
  where m.keep_asg = a.id;
  get diagnostics v_asg_kept = row_count;

  -- g. Ghi chú ca gộp: tính trước khi xoá ca thừa.
  create temp table _m013_shift_note on commit drop as
  select
    m.keeper,
    max(m.n) as n,
    (
      select string_agg(x.note, E'\n' order by x.rn)
      from (
        select btrim(m2.note) as note, min(m2.rn) as rn
        from _m013_shift m2
        where m2.keeper = m.keeper
          and nullif(btrim(m2.note), '') is not null
        group by btrim(m2.note)
      ) x
    ) as note
  from _m013_shift m
  group by m.keeper;

  -- Ca thừa giờ đã trống (mọi lượt đã xoá hoặc chuyển đi).
  delete from public.shifts s
  using _m013_shift m
  where m.id = s.id and m.id <> m.keeper;
  get diagnostics v_shift_deleted = row_count;

  update public.shifts s
  set title       = sl.slot,
      template_id = sl.new_tpl,
      start_time  = sl.start_time,
      end_time    = sl.end_time,
      note        = case when sn.n > 1 then sn.note else s.note end
  from _m013_shift m
  join _m013_slot sl       on sl.slot = m.slot
  join _m013_shift_note sn on sn.keeper = m.keeper
  where m.id = s.id and m.id = m.keeper;
  get diagnostics v_shift_kept = row_count;

  -- h. Không còn ca nào trỏ ca mẫu cũ — nếu còn, xoá ca mẫu sẽ lặng lẽ đặt
  -- template_id = null (on delete set null) thay vì báo lỗi.
  assert not exists (
    select 1 from public.shifts s
    join _m013_old_tpl o on o.id = s.template_id
  ), '013: vẫn còn ca trỏ ca mẫu cũ';

  delete from public.shift_templates t
  using _m013_old_tpl o
  where o.id = t.id;
  get diagnostics v_tpl_deleted = row_count;

  raise notice '013: xoá % ca mẫu cũ, tạo % ca mẫu mới; giữ % ca, xoá % ca thừa; giữ % lượt, gộp % lượt trùng.',
    v_tpl_deleted, v_tpl_created, v_shift_kept, v_shift_deleted, v_asg_kept, v_asg_merged;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. BẬT LẠI TRIGGER
-- ---------------------------------------------------------------------

alter table public.shifts            enable trigger user;
alter table public.shift_assignments enable trigger user;
alter table public.shift_templates   enable trigger user;
alter table public.locations         enable trigger user;

-- ---------------------------------------------------------------------
-- 5. TỰ KIỂM TRA + SỐ ĐẾM
-- ---------------------------------------------------------------------
-- Sai bất kỳ điều nào thì cả file rollback. Số đếm chỉ in ra, không assert:
-- dữ liệu có thể đổi giữa lúc viết file và lúc chạy.

do $$
declare
  v_shifts    bigint;
  v_asg       bigint;
  v_templates bigint;
  v_locations bigint;
begin
  assert not exists (
    select 1 from public.shift_templates t
    where normalize(t.title, NFC) ~ '^(Sáng|Chiều|Tối) - [Tt]rực ([Pp]age|[Dd]iscord)$'
  ), '013: vẫn còn ca mẫu cũ';

  assert not exists (
    select 1 from public.shifts
    where template_id is not null
    group by template_id, date
    having count(*) > 1
  ), '013: trùng (template_id, date)';

  assert not exists (
    select 1 from public.shift_assignments
    group by shift_id, user_id
    having count(*) > 1
  ), '013: trùng (shift_id, user_id)';

  assert not exists (
    select 1 from public.shift_assignments
    where location_ids is distinct from public.normalize_location_ids(location_ids)
  ), '013: location_ids chưa chuẩn hoá';

  assert not exists (
    select 1
    from public.shift_assignments a, unnest(a.location_ids) as u(x)
    where not exists (select 1 from public.locations l where l.id = u.x)
  ), '013: location_ids trỏ tới nơi trực không tồn tại';

  assert not exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('shifts', 'shift_assignments', 'shift_templates', 'locations')
      and not tg.tgisinternal
      and tg.tgenabled = 'D'
  ), '013: còn trigger chưa bật lại';

  select count(*) into v_shifts    from public.shifts;
  select count(*) into v_asg       from public.shift_assignments;
  select count(*) into v_templates from public.shift_templates;
  select count(*) into v_locations from public.locations;
  raise notice '013: hiện có % ca, % lượt, % ca mẫu, % nơi trực.',
    v_shifts, v_asg, v_templates, v_locations;
end;
$$;

commit;
