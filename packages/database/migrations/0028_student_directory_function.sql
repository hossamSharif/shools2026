-- ============================================================================
-- 0028_student_directory (students section enhancement)
-- One read function backing the students list: smart Arabic search, class /
-- status / financial filters, sorting, and the per-student financial rollup.
-- Fully DERIVED (Article II) over installment + payment_allocation + discount —
-- no stored balances, no money math in JS (Article VI).
-- "Today" is evaluated in Africa/Khartoum (Article VIII).
-- MONEY-ADJACENT (reads money data) ⇒ OWNER REVIEW (Article XII).
-- ============================================================================

-- Installed into `public` deliberately: the trigram index below uses
-- `gin_trgm_ops`, and every function here pins `search_path = public`. Putting
-- the extension in Supabase's usual `extensions` schema would leave that
-- operator class unresolvable from that pinned path.
create extension if not exists pg_trgm with schema public;

-- ── Arabic search normaliser ────────────────────────────────────────────────
-- Folds the orthographic variants Sudanese admins type interchangeably so that
-- "احمد" finds "أحمد", "فاطمه" finds "فاطمة", and "٠٩١٢" finds "0912".
-- IMMUTABLE so it can back an expression index.
create or replace function public.ar_normalize(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    btrim(
      regexp_replace(
        translate(
          -- strip tashkeel (U+064B–U+0652) and tatweel (U+0640) first
          regexp_replace(lower(coalesce(p_text, '')), '[ً-ْـ]', '', 'g'),
          -- alef/ya/ta-marbuta/hamza variants + Arabic-Indic & Persian digits
          'أإآٱىؤئة٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          'اااايويه01234567890123456789'
        ),
        '\s+', ' ', 'g'
      ),
      ' '
    ),
    ''
  );
$$;

comment on function public.ar_normalize(text) is
  'Arabic search normaliser: strips tashkeel/tatweel, folds alef/ya/ta-marbuta/hamza variants, maps Arabic-Indic digits to ASCII, collapses whitespace.';

-- Digits-only form of a phone number, for prefix-insensitive matching
-- (0912345678 / +249912345678 / 912 345 678 all reduce to a common suffix).
create or replace function public.digits_only(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(public.ar_normalize(coalesce(p_text, '')), '\D', '', 'g');
$$;

comment on function public.digits_only(text) is
  'Digits-only projection of a (possibly Arabic-Indic) string, used for phone matching.';

-- ── Search indexes ──────────────────────────────────────────────────────────
create index if not exists student_search_trgm_idx
  on public.student
  using gin ((public.ar_normalize(name || ' ' || coalesce(guardian_name, ''))) gin_trgm_ops);

create index if not exists student_phone_digits_idx
  on public.student ((public.digits_only(guardian_phone)));

-- ── The directory function ──────────────────────────────────────────────────
create or replace function public.student_directory(
  p_school_id        uuid,
  p_q                text    default null,
  p_stage_id         uuid    default null,
  p_grade_id         uuid    default null,
  p_section_id       uuid    default null,
  p_academic_year_id uuid    default null,
  p_status           text    default null,
  p_fin_status       text    default null,
  p_due_within_days  int     default null,
  p_unenrolled       boolean default false,
  p_missing_phone    boolean default false,
  p_sort             text    default 'name'
)
returns table (
  student_id           uuid,
  name                 text,
  guardian_name        text,
  guardian_phone       text,
  status               text,
  grade_id             uuid,
  grade_label          text,
  section_id           uuid,
  section_name         text,
  academic_year_id     uuid,
  total_charged        numeric(14,2),
  total_paid           numeric(14,2),
  total_discount       numeric(14,2),
  total_owed           numeric(14,2),
  overdue_amount       numeric(14,2),
  days_overdue         int,
  next_due_date        date,
  next_due_amount      numeric(14,2),
  installments_total   int,
  installments_settled int,
  fin_status           text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today  date := (now() at time zone 'Africa/Khartoum')::date;
  v_tokens text[];
  v_qdigits text;
begin
  -- SECURITY DEFINER bypasses RLS, so the tenant boundary is re-asserted here
  -- explicitly against the caller's resolved school (Article IV).
  if p_school_id is distinct from public.current_school_id() then
    raise exception 'FORBIDDEN_SCHOOL' using hint = 'لا تملك صلاحية الوصول لبيانات هذه المدرسة.';
  end if;

  -- AND-of-tokens search: every whitespace-separated token must match, so word
  -- order does not matter ("أحمد محمد" finds "محمد أحمد الطيب").
  -- `%`/`_`/`\` typed by the operator are literal characters to search for, not
  -- LIKE wildcards — escape them before they reach the pattern.
  v_tokens  := case
                 when public.ar_normalize(p_q) is null then null
                 else regexp_split_to_array(
                        regexp_replace(public.ar_normalize(p_q), '([\\%_])', '\\\1', 'g'),
                        '\s+')
               end;
  v_qdigits := nullif(public.digits_only(p_q), '');

  return query
  with latest_enrollment as (
    select distinct on (en.student_id)
           en.student_id, en.grade_id, en.section_id, en.academic_year_id
      from public.enrollment en
     where en.school_id = p_school_id
       and (p_academic_year_id is null or en.academic_year_id = p_academic_year_id)
     order by en.student_id, en.created_at desc
  ),
  inst as (
    select i.student_id,
           i.due_date,
           i.amount_charged,
           public.installment_running_balance(i.id) as remaining
      from public.installment i
     where i.school_id = p_school_id
  ),
  inst_agg as (
    select x.student_id,
           sum(x.amount_charged)::numeric(14,2)                         as total_charged,
           count(*)::int                                                as installments_total,
           count(*) filter (where x.remaining = 0)::int                 as installments_settled,
           sum(x.remaining) filter (where x.due_date < v_today)::numeric(14,2) as overdue_amount,
           min(x.due_date) filter (where x.remaining > 0 and x.due_date < v_today) as oldest_overdue,
           min(x.due_date) filter (where x.remaining > 0)               as next_due_date
      from inst x
     group by x.student_id
  ),
  -- Cash actually received. NOT `charged - remaining`: installment_running_balance
  -- already nets out discounts, which are a non-cash reduction (Article III) and
  -- are reported on their own line.
  pay as (
    select i.student_id, sum(pa.amount)::numeric(14,2) as total_paid
      from public.payment_allocation pa
      join public.installment i on i.id = pa.installment_id
      join public.money_event e on e.id = pa.money_event_id
     where i.school_id = p_school_id
       and e.reverses_event_id is null
       and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
     group by i.student_id
  ),
  next_amt as (
    select x.student_id, sum(x.remaining)::numeric(14,2) as next_due_amount
      from inst x
      join inst_agg a on a.student_id = x.student_id
     where x.due_date = a.next_due_date and x.remaining > 0
     group by x.student_id
  ),
  disc as (
    select d.student_id, sum(d.computed_amount)::numeric(14,2) as total_discount
      from public.discount d
     where d.school_id = p_school_id
     group by d.student_id
  ),
  -- The canonical whole-ledger balance (charges − payments − discounts
  -- − adjustments + refunds), reused rather than re-derived (Article II).
  -- Materialised once per student: it is referenced by both the output column
  -- and the fin_status CASE, and it is the most expensive expression here.
  bal as (
    select s.id as student_id, public.student_balance(s.id)::numeric(14,2) as owed
      from public.student s
     where s.school_id = p_school_id
  ),
  rows_out as (
    select s.id                                              as student_id,
           s.name                                            as name,
           s.guardian_name                                   as guardian_name,
           s.guardian_phone                                  as guardian_phone,
           s.status::text                                    as status,
           g.id                                              as grade_id,
           g.label_ar                                        as grade_label,
           sec.id                                            as section_id,
           sec.name                                          as section_name,
           le.academic_year_id                               as academic_year_id,
           coalesce(a.total_charged, 0)::numeric(14,2)       as total_charged,
           coalesce(p.total_paid, 0)::numeric(14,2)          as total_paid,
           coalesce(dc.total_discount, 0)::numeric(14,2)     as total_discount,
           b.owed                                            as total_owed,
           coalesce(a.overdue_amount, 0)::numeric(14,2)      as overdue_amount,
           coalesce((v_today - a.oldest_overdue), 0)::int    as days_overdue,
           a.next_due_date                                   as next_due_date,
           coalesce(na.next_due_amount, 0)::numeric(14,2)    as next_due_amount,
           coalesce(a.installments_total, 0)::int            as installments_total,
           coalesce(a.installments_settled, 0)::int          as installments_settled,
           -- Single source of truth for the badge, the filter and the KPI counts.
           case
             when coalesce(a.installments_total, 0) = 0 then null::text
             when a.oldest_overdue is not null           then 'overdue'
             when b.owed <= 0                            then 'paid'
             when coalesce(p.total_paid, 0) > 0          then 'partial'
             else 'unpaid'
           end                                               as fin_status,
           le.student_id is not null                         as is_enrolled
      from public.student s
      left join latest_enrollment le on le.student_id = s.id
      left join public.grade g       on g.id = le.grade_id
      left join public.section sec   on sec.id = le.section_id
      join bal b                     on b.student_id = s.id
      left join inst_agg a           on a.student_id = s.id
      left join pay p                on p.student_id = s.id
      left join next_amt na          on na.student_id = s.id
      left join disc dc              on dc.student_id = s.id
     where s.school_id = p_school_id
       and (p_status is null   or s.status::text = p_status)
       and (p_stage_id is null or g.stage_id = p_stage_id)
       and (p_grade_id is null or g.id = p_grade_id)
       and (p_section_id is null or sec.id = p_section_id)
       and (not p_missing_phone or public.digits_only(s.guardian_phone) is null
            or public.digits_only(s.guardian_phone) = '')
       and (
         v_tokens is null
         or (
           -- every token matches the name/guardian blob …
           (select bool_and(
                     public.ar_normalize(s.name || ' ' || coalesce(s.guardian_name, ''))
                       like '%' || tok || '%')
              from unnest(v_tokens) as tok)
           -- … or the whole query is a phone fragment matching the guardian phone
           or (v_qdigits is not null
               and length(v_qdigits) >= 3
               and public.digits_only(s.guardian_phone) like '%' || v_qdigits)
         )
       )
  )
  select r.student_id, r.name, r.guardian_name, r.guardian_phone, r.status,
         r.grade_id, r.grade_label, r.section_id, r.section_name, r.academic_year_id,
         r.total_charged, r.total_paid, r.total_discount, r.total_owed,
         r.overdue_amount, r.days_overdue,
         r.next_due_date, r.next_due_amount,
         r.installments_total, r.installments_settled, r.fin_status
    from rows_out r
   where (p_fin_status is null or r.fin_status = p_fin_status)
     and (not p_unenrolled or not r.is_enrolled)
     and (p_due_within_days is null
          or (r.next_due_date is not null
              and r.next_due_date <= v_today + p_due_within_days))
   order by
     case when p_sort = 'owed_desc'      then r.total_owed end desc nulls last,
     case when p_sort = 'oldest_overdue' then r.days_overdue end desc nulls last,
     r.name;
end;
$$;

comment on function public.student_directory(uuid, text, uuid, uuid, uuid, uuid, text, text, int, boolean, boolean, text) is
  'Students directory: Arabic-normalised multi-token search over name/guardian/phone, class + status + financial filters, and the derived per-student financial rollup (charged/paid/discount/owed/overdue/next-due).';

revoke execute on function public.ar_normalize(text) from public, anon;
revoke execute on function public.digits_only(text) from public, anon;
revoke execute on function public.student_directory(uuid, text, uuid, uuid, uuid, uuid, text, text, int, boolean, boolean, text) from public, anon;

grant execute on function public.ar_normalize(text) to authenticated;
grant execute on function public.digits_only(text) to authenticated;
grant execute on function public.student_directory(uuid, text, uuid, uuid, uuid, uuid, text, text, int, boolean, boolean, text) to authenticated;
