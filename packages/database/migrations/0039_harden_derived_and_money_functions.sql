-- ============================================================================
-- 0039_harden_derived_and_money_functions (spec 002, rpc-contracts §E, T030).
-- MONEY-MIGRATION ⇒ OWNER REVIEW before apply, then the Gauntlet re-run
-- (reconciliation, receipt concurrency, idempotency, write gating). Article XII.
--
-- Every body below is taken verbatim from the LIVE database
-- (pg_get_functiondef, 2026-11-25, i.e. the 0032a versions with their
-- target-school checks), with only these changes:
--   * money RPCs: `perform public.assert_perm('finance.write')` first;
--   * statement / payments / aging / balance helpers: `assert_perm('finance.read')`
--     right after the 0032a school check;
--   * internal calls to the four balance helpers go to `*_unchecked` copies.
--
-- Why the `*_unchecked` copies: student_directory (masked, for student
-- affairs), student_financial_summary / student_installments (guardians) and
-- the dashboard totals subset (principal) serve callers WITHOUT finance.read
-- but compute with installment_running_balance / student_balance /
-- account_balance / sms_credit_balance. Their unchanged bodies are kept under
-- `<name>_unchecked`, executable only by the definer owner and service_role
-- (not by authenticated or anon), and still carry the 0032a school check. The
-- public name decides who may call and what they see:
--   * dashboard_kpis: finance.read → full payload; finance.totals → totals
--     subset (collected_month, collected_year, outstanding, collection_rate,
--     overdue_count), taken from the full computation; else FORBIDDEN_PERMISSION.
--   * student_directory: students.read + stage scope; finance columns NULL
--     without finance.read; fin_status only with finance.read or
--     students.fee_indicator; finance filters refused without them.
--   * student_financial_summary / student_installments: finance.read, or
--     portal.linked for a linked student; else FORBIDDEN_STUDENT.
-- Per-row internal calls also avoid a permission lookup per row (SC-008).
--
-- Signatures, return types and transaction bodies are unchanged, so the
-- callers and the results for school_admin, accountant and viewer are the same
-- (US2). Source mirror: packages/database/functions/finance_permission_checks.sql.
-- ============================================================================

-- ── 1. Internal unchecked balance helpers (bodies copied from the live 0032a versions) ──
-- account_balance_unchecked: internal, unchanged body (callers that may not hold finance.read use it).
CREATE OR REPLACE FUNCTION public.account_balance_unchecked(p_account_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select a.school_id from public.account a where a.id = p_account_id));

  return (
    select coalesce(a.opening_balance, 0)
           + coalesce((
               select sum(
                 case e.event_type
                   when 'fee_payment' then e.amount
                   when 'expense'     then -e.amount
                   when 'refund'      then -e.amount
                   else 0
                 end * case when e.reverses_event_id is null then 1 else -1 end)
               from public.money_event e
              where e.account_id = p_account_id
             ), 0)
           + coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.event_type = 'transfer' and e.to_account_id = p_account_id
             ), 0)
           - coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.event_type = 'transfer' and e.from_account_id = p_account_id
             ), 0)
      from public.account a
      where a.id = p_account_id
  );
end;
$function$;

-- installment_running_balance_unchecked: internal, unchanged body (callers that may not hold finance.read use it).
CREATE OR REPLACE FUNCTION public.installment_running_balance_unchecked(p_installment_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select i.school_id from public.installment i where i.id = p_installment_id));

  return (
    select greatest(
        coalesce((select i.amount_charged from public.installment i where i.id = p_installment_id), 0)
        - coalesce((
            select sum(pa.amount)
              from public.payment_allocation pa
              join public.money_event e on e.id = pa.money_event_id
             where pa.installment_id = p_installment_id
               and e.reverses_event_id is null
               and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
          ), 0)
        - coalesce((
            select sum(d.computed_amount)
              from public.discount d
             where d.installment_id = p_installment_id
          ), 0),
        0)
  );
end;
$function$;

-- student_balance_unchecked: internal, unchanged body (callers that may not hold finance.read use it).
CREATE OR REPLACE FUNCTION public.student_balance_unchecked(p_student_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select s.school_id from public.student s where s.id = p_student_id));

  return (
    select coalesce((
               select sum(i.amount_charged) from public.installment i
                where i.student_id = p_student_id
             ), 0)
           - coalesce((
               select sum(pa.amount)
                 from public.payment_allocation pa
                 join public.installment i on i.id = pa.installment_id
                 join public.money_event e on e.id = pa.money_event_id
                where i.student_id = p_student_id
                  and e.reverses_event_id is null
                  and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
             ), 0)
           - coalesce((
               select sum(d.computed_amount) from public.discount d
                where d.student_id = p_student_id
             ), 0)
           - coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.student_id = p_student_id and e.event_type = 'adjustment'
             ), 0)
           + coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.student_id = p_student_id and e.event_type = 'refund'
             ), 0)
  );
end;
$function$;

-- sms_credit_balance_unchecked: internal, unchanged body (callers that may not hold finance.read use it).
CREATE OR REPLACE FUNCTION public.sms_credit_balance_unchecked(p_school_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school(p_school_id);

  return (
    select coalesce((select sum(amount) from public.sms_credit_topup where school_id = p_school_id), 0)
           - coalesce((select sum(segments) from public.sms_credit_consumption where school_id = p_school_id), 0)
  );
end;
$function$;

-- ── 2. Exposed balance helpers: finance.read after the 0032a school check ──
CREATE OR REPLACE FUNCTION public.account_balance(p_account_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select a.school_id from public.account a where a.id = p_account_id));
  perform public.assert_perm('finance.read');  -- 0039 (rpc-contracts §E)

  return (
    select coalesce(a.opening_balance, 0)
           + coalesce((
               select sum(
                 case e.event_type
                   when 'fee_payment' then e.amount
                   when 'expense'     then -e.amount
                   when 'refund'      then -e.amount
                   else 0
                 end * case when e.reverses_event_id is null then 1 else -1 end)
               from public.money_event e
              where e.account_id = p_account_id
             ), 0)
           + coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.event_type = 'transfer' and e.to_account_id = p_account_id
             ), 0)
           - coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.event_type = 'transfer' and e.from_account_id = p_account_id
             ), 0)
      from public.account a
      where a.id = p_account_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.installment_running_balance(p_installment_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select i.school_id from public.installment i where i.id = p_installment_id));
  perform public.assert_perm('finance.read');  -- 0039 (rpc-contracts §E)

  return (
    select greatest(
        coalesce((select i.amount_charged from public.installment i where i.id = p_installment_id), 0)
        - coalesce((
            select sum(pa.amount)
              from public.payment_allocation pa
              join public.money_event e on e.id = pa.money_event_id
             where pa.installment_id = p_installment_id
               and e.reverses_event_id is null
               and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
          ), 0)
        - coalesce((
            select sum(d.computed_amount)
              from public.discount d
             where d.installment_id = p_installment_id
          ), 0),
        0)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.student_balance(p_student_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select s.school_id from public.student s where s.id = p_student_id));
  perform public.assert_perm('finance.read');  -- 0039 (rpc-contracts §E)

  return (
    select coalesce((
               select sum(i.amount_charged) from public.installment i
                where i.student_id = p_student_id
             ), 0)
           - coalesce((
               select sum(pa.amount)
                 from public.payment_allocation pa
                 join public.installment i on i.id = pa.installment_id
                 join public.money_event e on e.id = pa.money_event_id
                where i.student_id = p_student_id
                  and e.reverses_event_id is null
                  and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
             ), 0)
           - coalesce((
               select sum(d.computed_amount) from public.discount d
                where d.student_id = p_student_id
             ), 0)
           - coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.student_id = p_student_id and e.event_type = 'adjustment'
             ), 0)
           + coalesce((
               select sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
                 from public.money_event e
                where e.student_id = p_student_id and e.event_type = 'refund'
             ), 0)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.sms_credit_balance(p_school_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school(p_school_id);
  perform public.assert_perm('finance.read');  -- 0039 (rpc-contracts §E)

  return (
    select coalesce((select sum(amount) from public.sms_credit_topup where school_id = p_school_id), 0)
           - coalesce((select sum(segments) from public.sms_credit_consumption where school_id = p_school_id), 0)
  );
end;
$function$;

-- ── 3. Statement, payments, aging: finance.read ──
CREATE OR REPLACE FUNCTION public.student_statement(p_student_id uuid)
 RETURNS TABLE(entry_date timestamp with time zone, entry_type text, description text, charge numeric, credit numeric, running_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school((select s.school_id from public.student s where s.id = p_student_id));
  perform public.assert_perm('finance.read');  -- 0039 (rpc-contracts §E)

  return query
  with entries as (
      -- Installment charges (what the student was billed).
      select i.due_date::timestamptz as entry_date,
             'charge'::text as entry_type,
             coalesce('قسط رقم ' || i.sequence, 'قسط') as description,
             i.amount_charged as charge,
             0::numeric(14,2) as credit
        from public.installment i
       where i.student_id = p_student_id

      union all

      -- Payments allocated to this student's installments (money in, reduces owed).
      select e.occurred_at,
             'payment',
             'دفعة - إيصال رقم ' || coalesce(e.receipt_no::text, ''),
             0::numeric(14,2),
             pa.amount
        from public.payment_allocation pa
        join public.installment i on i.id = pa.installment_id
        join public.money_event e on e.id = pa.money_event_id
       where i.student_id = p_student_id
         and e.reverses_event_id is null
         and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)

      union all

      -- Discounts (non-cash reduction of what's owed).
      select d.created_at,
             'discount',
             coalesce(d.reason, 'خصم'),
             0::numeric(14,2),
             d.computed_amount
        from public.discount d
       where d.student_id = p_student_id

      union all

      -- Adjustments / write-offs (reduce owed; reversal flips the sign).
      select e.occurred_at,
             'adjustment',
             coalesce(e.notes, 'تسوية'),
             case when e.reverses_event_id is null then 0::numeric(14,2) else e.amount end,
             case when e.reverses_event_id is null then e.amount else 0::numeric(14,2) end
        from public.money_event e
       where e.student_id = p_student_id and e.event_type = 'adjustment'

      union all

      -- Refunds (money back to guardian; increases what's owed; reversal flips it).
      select e.occurred_at,
             'refund',
             coalesce(e.notes, 'استرداد'),
             case when e.reverses_event_id is null then e.amount else 0::numeric(14,2) end,
             case when e.reverses_event_id is null then 0::numeric(14,2) else e.amount end
        from public.money_event e
       where e.student_id = p_student_id and e.event_type = 'refund'
    )
    select entry_date, entry_type, description, charge, credit,
           sum(charge - credit) over (order by entry_date, entry_type
                                       rows between unbounded preceding and current row)
             as running_balance
      from entries
     order by entry_date, entry_type;
end;
$function$;

CREATE OR REPLACE FUNCTION public.student_payments(p_student_id uuid)
 RETURNS TABLE(money_event_id uuid, receipt_no integer, occurred_at timestamp with time zone, amount numeric, account_name text, is_reversal boolean, is_reversed boolean, notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_perm('finance.read');  -- 0039 (rpc-contracts §E)
  if not exists (
    select 1 from public.student s
     where s.id = p_student_id and s.school_id = public.current_school_id()
  ) then
    raise exception 'FORBIDDEN_STUDENT' using hint = 'الطالب لا ينتمي لمدرستك.';
  end if;

  return query
  select e.id,
         e.receipt_no,
         e.occurred_at,
         sum(pa.amount)::numeric(14,2),
         acc.name,
         e.reverses_event_id is not null,
         exists (select 1 from public.money_event r where r.reverses_event_id = e.id),
         e.notes
    from public.payment_allocation pa
    join public.installment i  on i.id = pa.installment_id
    join public.money_event e  on e.id = pa.money_event_id
    left join public.account acc on acc.id = e.account_id
   where i.student_id = p_student_id
   group by e.id, e.receipt_no, e.occurred_at, acc.name, e.reverses_event_id, e.notes
   order by e.occurred_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.receivables_aging(p_school_id uuid, p_stage_id uuid DEFAULT NULL::uuid, p_grade_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(student_id uuid, student_name text, status text, grade_id uuid, grade_label text, section_id uuid, section_name text, current_amount numeric, bucket_1_30 numeric, bucket_31_60 numeric, bucket_61_90 numeric, bucket_90_plus numeric, total_owed numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Africa/Khartoum')::date;
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school(p_school_id);
  perform public.assert_perm('finance.read');  -- 0039 (rpc-contracts §E)

  return query
  with latest_enrollment as (
    select distinct on (en.student_id)
           en.student_id, en.grade_id, en.section_id
      from public.enrollment en
     where en.school_id = p_school_id
     order by en.student_id, en.created_at desc
  ),
  outstanding as (
    select i.student_id,
           i.due_date,
           public.installment_running_balance_unchecked(i.id) as owed
      from public.installment i
     where i.school_id = p_school_id
  ),
  bucketed as (
    select o.student_id,
           case when o.due_date >= v_today then o.owed else 0 end as current_amount,
           case when o.due_date < v_today and (v_today - o.due_date) between 1 and 30
                then o.owed else 0 end as bucket_1_30,
           case when o.due_date < v_today and (v_today - o.due_date) between 31 and 60
                then o.owed else 0 end as bucket_31_60,
           case when o.due_date < v_today and (v_today - o.due_date) between 61 and 90
                then o.owed else 0 end as bucket_61_90,
           case when o.due_date < v_today and (v_today - o.due_date) > 90
                then o.owed else 0 end as bucket_90_plus
      from outstanding o
     where o.owed > 0
  ),
  agg as (
    select b.student_id,
           sum(b.current_amount)  as current_amount,
           sum(b.bucket_1_30)     as bucket_1_30,
           sum(b.bucket_31_60)    as bucket_31_60,
           sum(b.bucket_61_90)    as bucket_61_90,
           sum(b.bucket_90_plus)  as bucket_90_plus
      from bucketed b
     group by b.student_id
    having sum(b.current_amount + b.bucket_1_30 + b.bucket_31_60 + b.bucket_61_90 + b.bucket_90_plus) > 0
  )
  select s.id, s.name, s.status::text,
         g.id, g.label_ar,
         sec.id, sec.name,
         a.current_amount, a.bucket_1_30, a.bucket_31_60, a.bucket_61_90, a.bucket_90_plus,
         (a.current_amount + a.bucket_1_30 + a.bucket_31_60 + a.bucket_61_90 + a.bucket_90_plus)
           as total_owed
    from agg a
    join public.student s on s.id = a.student_id
    left join latest_enrollment le on le.student_id = s.id
    left join public.grade g on g.id = le.grade_id
    left join public.section sec on sec.id = le.section_id
   where s.school_id = p_school_id
     and (p_grade_id is null or g.id = p_grade_id)
     and (p_section_id is null or sec.id = p_section_id)
     and (p_stage_id is null or g.stage_id = p_stage_id)
   order by total_owed desc, s.name;
end;
$function$;

-- ── 4. Money RPCs: finance.write first (transaction bodies unchanged) ──
CREATE OR REPLACE FUNCTION public.apply_fee_payment(p_student_id uuid, p_account_id uuid, p_amount numeric, p_occurred_at timestamp with time zone, p_idempotency_key uuid, p_allocations jsonb DEFAULT NULL::jsonb, p_attachment_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_school_id   uuid;
  v_event_id    uuid;
  v_receipt_no  int;
  v_remaining   numeric;
  v_alloc_total numeric := 0;
  v_rec         record;
  v_running     numeric;
  v_take        numeric;
  v_result      jsonb;
  v_allocs_out  jsonb := '[]'::jsonb;
begin
  perform public.assert_perm('finance.write');  -- 0039 (rpc-contracts §E)
  select school_id into v_school_id from public.student where id = p_student_id;
  if v_school_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_school_id <> public.current_school_id() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.account where id = p_account_id and school_id = v_school_id) then
    raise exception 'INSUFFICIENT_ALLOCATION_TARGET' using errcode = 'P0001';
  end if;

  perform public.assert_writes_allowed(v_school_id);

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  select id, receipt_no into v_event_id, v_receipt_no
    from public.money_event
   where school_id = v_school_id and idempotency_key = p_idempotency_key;
  if v_event_id is not null then
    select jsonb_agg(jsonb_build_object(
             'installment_id', pa.installment_id,
             'running_balance_after', public.installment_running_balance_unchecked(pa.installment_id)::text))
      into v_allocs_out
      from public.payment_allocation pa where pa.money_event_id = v_event_id;
    return jsonb_build_object(
      'money_event_id', v_event_id,
      'receipt_no', v_receipt_no,
      'account_balance_after', public.account_balance_unchecked(p_account_id)::text,
      'student_balance_after', public.student_balance_unchecked(p_student_id)::text,
      'allocations', coalesce(v_allocs_out, '[]'::jsonb),
      'idempotent_replay', true);
  end if;

  insert into public.receipt_counter (school_id) values (v_school_id)
    on conflict (school_id) do nothing;
  select next_value into v_receipt_no
    from public.receipt_counter where school_id = v_school_id for update;
  update public.receipt_counter set next_value = next_value + 1 where school_id = v_school_id;

  insert into public.money_event
    (school_id, event_type, amount, account_id, actor_user_id, occurred_at,
     idempotency_key, attachment_path, receipt_no)
  values
    (v_school_id, 'fee_payment', p_amount, p_account_id, auth.uid(),
     coalesce(p_occurred_at, now()), p_idempotency_key, p_attachment_path, v_receipt_no)
  returning id into v_event_id;

  v_remaining := p_amount;

  if p_allocations is not null then
    for v_rec in
      select (x->>'installment_id')::uuid as installment_id,
             (x->>'amount')::numeric      as amount
        from jsonb_array_elements(p_allocations) x
    loop
      v_running := public.installment_running_balance_unchecked(v_rec.installment_id);
      if not exists (select 1 from public.installment
                      where id = v_rec.installment_id and student_id = p_student_id) then
        raise exception 'INSUFFICIENT_ALLOCATION_TARGET' using errcode = 'P0001';
      end if;
      if v_rec.amount > v_running then
        raise exception 'OVERPAYMENT_BLOCKED' using errcode = 'P0001';
      end if;
      insert into public.payment_allocation (school_id, money_event_id, installment_id, amount)
      values (v_school_id, v_event_id, v_rec.installment_id, v_rec.amount);
      v_alloc_total := v_alloc_total + v_rec.amount;
    end loop;
    if v_alloc_total <> p_amount then
      raise exception 'INSUFFICIENT_ALLOCATION_TARGET' using errcode = 'P0001';
    end if;
  else
    for v_rec in
      select i.id as installment_id
        from public.installment i
       where i.student_id = p_student_id
       order by i.due_date asc, i.sequence asc
    loop
      exit when v_remaining <= 0;
      v_running := public.installment_running_balance_unchecked(v_rec.installment_id);
      if v_running <= 0 then continue; end if;
      v_take := least(v_remaining, v_running);
      insert into public.payment_allocation (school_id, money_event_id, installment_id, amount)
      values (v_school_id, v_event_id, v_rec.installment_id, v_take);
      v_remaining := v_remaining - v_take;
    end loop;
    if v_remaining > 0 then
      raise exception 'OVERPAYMENT_BLOCKED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.audit_entry (school_id, money_event_id, actor_user_id, action)
  values (v_school_id, v_event_id, auth.uid(), 'apply_fee_payment');

  if auth.uid() is not null then
    perform public.emit_notification(
      v_school_id, auth.uid(), 'payment_recorded',
      jsonb_build_object(
        'money_event_id', v_event_id,
        'receipt_no', v_receipt_no,
        'amount', p_amount,
        'student_id', p_student_id));
  end if;

  select jsonb_agg(jsonb_build_object(
           'installment_id', pa.installment_id,
           'running_balance_after', public.installment_running_balance_unchecked(pa.installment_id)::text))
    into v_allocs_out
    from public.payment_allocation pa where pa.money_event_id = v_event_id;

  v_result := jsonb_build_object(
    'money_event_id', v_event_id,
    'receipt_no', v_receipt_no,
    'account_balance_after', public.account_balance_unchecked(p_account_id)::text,
    'student_balance_after', public.student_balance_unchecked(p_student_id)::text,
    'allocations', coalesce(v_allocs_out, '[]'::jsonb),
    'idempotent_replay', false);

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_expense(p_account_id uuid, p_amount numeric, p_category text, p_occurred_at timestamp with time zone, p_idempotency_key uuid, p_vendor text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_attachment_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_school_id uuid; v_event_id uuid;
begin
  perform public.assert_perm('finance.write');  -- 0039 (rpc-contracts §E)
  select school_id into v_school_id from public.account where id = p_account_id;
  if v_school_id is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode='P0001'; end if;
  if v_school_id <> public.current_school_id() then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  perform public.assert_writes_allowed(v_school_id);
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode='P0001'; end if;
  if p_category is null or length(trim(p_category))=0 then raise exception 'INVALID_CATEGORY' using errcode='P0001'; end if;
  select id into v_event_id from public.money_event where school_id=v_school_id and idempotency_key=p_idempotency_key;
  if v_event_id is null then
    insert into public.money_event (school_id,event_type,amount,account_id,actor_user_id,occurred_at,idempotency_key,attachment_path,category,vendor,description)
    values (v_school_id,'expense',p_amount,p_account_id,auth.uid(),coalesce(p_occurred_at,now()),p_idempotency_key,p_attachment_path,p_category,p_vendor,p_description)
    returning id into v_event_id;
    insert into public.audit_entry (school_id,money_event_id,actor_user_id,action) values (v_school_id,v_event_id,auth.uid(),'record_expense');
  end if;
  return jsonb_build_object('money_event_id',v_event_id,'account_balance_after',public.account_balance_unchecked(p_account_id)::text);
end; $function$;

CREATE OR REPLACE FUNCTION public.record_transfer(p_from_account_id uuid, p_to_account_id uuid, p_amount numeric, p_occurred_at timestamp with time zone, p_idempotency_key uuid, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_school_id uuid; v_to_school uuid; v_event_id uuid;
begin
  perform public.assert_perm('finance.write');  -- 0039 (rpc-contracts §E)
  if p_from_account_id = p_to_account_id then raise exception 'INVALID_TRANSFER' using errcode='P0001'; end if;
  select school_id into v_school_id from public.account where id=p_from_account_id;
  select school_id into v_to_school from public.account where id=p_to_account_id;
  if v_school_id is null or v_to_school is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode='P0001'; end if;
  if v_school_id <> public.current_school_id() or v_to_school <> v_school_id then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  perform public.assert_writes_allowed(v_school_id);
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode='P0001'; end if;
  select id into v_event_id from public.money_event where school_id=v_school_id and idempotency_key=p_idempotency_key;
  if v_event_id is null then
    insert into public.money_event (school_id,event_type,amount,actor_user_id,occurred_at,idempotency_key,from_account_id,to_account_id,description)
    values (v_school_id,'transfer',p_amount,auth.uid(),coalesce(p_occurred_at,now()),p_idempotency_key,p_from_account_id,p_to_account_id,p_description)
    returning id into v_event_id;
    insert into public.audit_entry (school_id,money_event_id,actor_user_id,action) values (v_school_id,v_event_id,auth.uid(),'record_transfer');
  end if;
  return jsonb_build_object('money_event_id',v_event_id,'from_balance_after',public.account_balance_unchecked(p_from_account_id)::text,'to_balance_after',public.account_balance_unchecked(p_to_account_id)::text);
end; $function$;

CREATE OR REPLACE FUNCTION public.record_refund(p_student_id uuid, p_account_id uuid, p_amount numeric, p_occurred_at timestamp with time zone, p_idempotency_key uuid, p_description text DEFAULT NULL::text, p_attachment_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_school_id uuid; v_acc_school uuid; v_event_id uuid;
begin
  perform public.assert_perm('finance.write');  -- 0039 (rpc-contracts §E)
  select school_id into v_school_id from public.student where id=p_student_id;
  if v_school_id is null then raise exception 'STUDENT_NOT_FOUND' using errcode='P0001'; end if;
  select school_id into v_acc_school from public.account where id=p_account_id;
  if v_acc_school is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode='P0001'; end if;
  if v_school_id <> public.current_school_id() or v_acc_school <> v_school_id then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  perform public.assert_writes_allowed(v_school_id);
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode='P0001'; end if;
  select id into v_event_id from public.money_event where school_id=v_school_id and idempotency_key=p_idempotency_key;
  if v_event_id is null then
    insert into public.money_event (school_id,event_type,amount,account_id,student_id,actor_user_id,occurred_at,idempotency_key,attachment_path,description)
    values (v_school_id,'refund',p_amount,p_account_id,p_student_id,auth.uid(),coalesce(p_occurred_at,now()),p_idempotency_key,p_attachment_path,p_description)
    returning id into v_event_id;
    insert into public.audit_entry (school_id,money_event_id,actor_user_id,action) values (v_school_id,v_event_id,auth.uid(),'record_refund');
  end if;
  return jsonb_build_object('money_event_id',v_event_id,'account_balance_after',public.account_balance_unchecked(p_account_id)::text,'student_balance_after',public.student_balance_unchecked(p_student_id)::text);
end; $function$;

CREATE OR REPLACE FUNCTION public.record_adjustment(p_student_id uuid, p_amount numeric, p_reason text, p_occurred_at timestamp with time zone, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_school_id uuid; v_event_id uuid;
begin
  perform public.assert_perm('finance.write');  -- 0039 (rpc-contracts §E)
  select school_id into v_school_id from public.student where id=p_student_id;
  if v_school_id is null then raise exception 'STUDENT_NOT_FOUND' using errcode='P0001'; end if;
  if v_school_id <> public.current_school_id() then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  perform public.assert_writes_allowed(v_school_id);
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode='P0001'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'INVALID_REASON' using errcode='P0001'; end if;
  select id into v_event_id from public.money_event where school_id=v_school_id and idempotency_key=p_idempotency_key;
  if v_event_id is null then
    insert into public.money_event (school_id,event_type,amount,student_id,actor_user_id,occurred_at,idempotency_key,notes)
    values (v_school_id,'adjustment',p_amount,p_student_id,auth.uid(),coalesce(p_occurred_at,now()),p_idempotency_key,p_reason)
    returning id into v_event_id;
    insert into public.audit_entry (school_id,money_event_id,actor_user_id,action) values (v_school_id,v_event_id,auth.uid(),'record_adjustment');
  end if;
  return jsonb_build_object('money_event_id',v_event_id,'student_balance_after',public.student_balance_unchecked(p_student_id)::text);
end; $function$;

CREATE OR REPLACE FUNCTION public.apply_discount(p_student_id uuid, p_kind discount_kind, p_value numeric, p_idempotency_key uuid, p_installment_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_school_id uuid; v_discount_id uuid; v_computed numeric; v_base numeric;
begin
  perform public.assert_perm('finance.write');  -- 0039 (rpc-contracts §E)
  select school_id into v_school_id from public.student where id=p_student_id;
  if v_school_id is null then raise exception 'STUDENT_NOT_FOUND' using errcode='P0001'; end if;
  if v_school_id <> public.current_school_id() then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  perform public.assert_writes_allowed(v_school_id);
  if p_value is null or p_value < 0 then raise exception 'INVALID_AMOUNT' using errcode='P0001'; end if;
  if p_installment_id is not null and not exists (select 1 from public.installment where id=p_installment_id and student_id=p_student_id) then
    raise exception 'INSUFFICIENT_ALLOCATION_TARGET' using errcode='P0001'; end if;
  select id, computed_amount into v_discount_id, v_computed from public.discount where school_id=v_school_id and idempotency_key=p_idempotency_key;
  if v_discount_id is not null then
    return jsonb_build_object('discount_id',v_discount_id,'computed_amount',v_computed::text,'student_balance_after',public.student_balance_unchecked(p_student_id)::text);
  end if;
  if p_kind = 'percentage' then
    if p_installment_id is not null then select amount_charged into v_base from public.installment where id=p_installment_id;
    else select coalesce(sum(amount_charged),0) into v_base from public.installment where student_id=p_student_id; end if;
    v_computed := round(v_base * p_value / 100, 2);
  else v_computed := p_value; end if;
  insert into public.discount (school_id,student_id,installment_id,kind,value,computed_amount,reason,actor_user_id,idempotency_key)
  values (v_school_id,p_student_id,p_installment_id,p_kind,p_value,v_computed,p_reason,auth.uid(),p_idempotency_key)
  returning id into v_discount_id;
  return jsonb_build_object('discount_id',v_discount_id,'computed_amount',v_computed::text,'student_balance_after',public.student_balance_unchecked(p_student_id)::text);
end; $function$;

CREATE OR REPLACE FUNCTION public.reverse_event(p_money_event_id uuid, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_orig public.money_event%rowtype; v_event_id uuid;
begin
  perform public.assert_perm('finance.write');  -- 0039 (rpc-contracts §E)
  select * into v_orig from public.money_event where id=p_money_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode='P0001'; end if;
  if v_orig.school_id <> public.current_school_id() then raise exception 'FORBIDDEN' using errcode='P0001'; end if;
  if v_orig.reverses_event_id is not null then raise exception 'CANNOT_REVERSE_A_REVERSAL' using errcode='P0001'; end if;
  perform public.assert_writes_allowed(v_orig.school_id);
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'INVALID_REASON' using errcode='P0001'; end if;
  select id into v_event_id from public.money_event where school_id=v_orig.school_id and idempotency_key=p_idempotency_key;
  if v_event_id is not null then
    return jsonb_build_object('reversing_event_id',v_event_id,'reverses_event_id',p_money_event_id);
  end if;
  if exists (select 1 from public.money_event where reverses_event_id=p_money_event_id) then
    raise exception 'ALREADY_REVERSED' using errcode='P0001'; end if;
  insert into public.money_event (school_id,event_type,amount,account_id,from_account_id,to_account_id,student_id,actor_user_id,occurred_at,idempotency_key,reverses_event_id,notes)
  values (v_orig.school_id,v_orig.event_type,v_orig.amount,v_orig.account_id,v_orig.from_account_id,v_orig.to_account_id,v_orig.student_id,auth.uid(),now(),p_idempotency_key,p_money_event_id,p_reason)
  returning id into v_event_id;
  insert into public.audit_entry (school_id,money_event_id,actor_user_id,action) values (v_orig.school_id,v_event_id,auth.uid(),'reverse_event');
  return jsonb_build_object('reversing_event_id',v_event_id,'reverses_event_id',p_money_event_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.record_opening_balance(p_student_id uuid, p_amount numeric, p_due_date date DEFAULT ((now() AT TIME ZONE 'Africa/Khartoum'::text))::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_school_id      uuid;
  v_installment_id uuid;
begin
  perform public.assert_perm('finance.write');  -- 0039 (rpc-contracts §E)
  select school_id into v_school_id from public.student where id = p_student_id;
  if v_school_id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_school_id <> public.current_school_id() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  perform public.assert_writes_allowed(v_school_id);

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  select id into v_installment_id
    from public.installment
   where student_id = p_student_id and is_carried_in and sequence = 0;
  if v_installment_id is not null then
    return v_installment_id;
  end if;

  insert into public.installment
    (school_id, student_id, enrollment_id, sequence, due_date, amount_charged, is_carried_in)
  values (v_school_id, p_student_id, null, 0, p_due_date, p_amount, true)
  returning id into v_installment_id;

  return v_installment_id;
end;
$function$;

-- ── 5. Split functions: unchanged bodies become internal; the exposed name decides ──
-- dashboard_kpis_unchecked: internal, unchanged body (callers that may not hold finance.read use it).
CREATE OR REPLACE FUNCTION public.dashboard_kpis_unchecked(p_school_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today       date := (now() at time zone 'Africa/Khartoum')::date;
  v_month_start date := date_trunc('month', v_today)::date;
  v_year_start  date := date_trunc('year', v_today)::date;
  v_accounts    jsonb;
  v_combined_balance     numeric(14,2);
  v_collected_month      numeric(14,2);
  v_collected_year       numeric(14,2);
  v_billed_month         numeric(14,2);
  v_outstanding          numeric(14,2);
  v_collection_rate      numeric(6,2);
  v_expenses_month       numeric(14,2);
  v_net_cash_flow_month  numeric(14,2);
  v_overdue_count        int;
  v_sms_credit_remaining int;
begin
  -- 0032a: refuse ids of another school (rpc-contracts §E0).
  perform public.assert_target_school(p_school_id);

  -- Per-account + combined balance.
  select coalesce(jsonb_agg(jsonb_build_object(
           'account_id', a.id,
           'name', a.name,
           'type', a.type,
           'balance', public.account_balance_unchecked(a.id)
         ) order by a.name), '[]'::jsonb),
         coalesce(sum(public.account_balance_unchecked(a.id)), 0)
    into v_accounts, v_combined_balance
    from public.account a
   where a.school_id = p_school_id;

  -- Collected (fee_payment money-in), month-to-date and year-to-date.
  select coalesce(sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
           filter (where e.occurred_at::date >= v_month_start), 0),
         coalesce(sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end)
           filter (where e.occurred_at::date >= v_year_start), 0)
    into v_collected_month, v_collected_year
    from public.money_event e
   where e.school_id = p_school_id and e.event_type = 'fee_payment';

  -- Billed this month (installments due in the current month) — collection-rate denominator.
  select coalesce(sum(i.amount_charged), 0)
    into v_billed_month
    from public.installment i
   where i.school_id = p_school_id
     and i.due_date >= v_month_start
     and i.due_date < (v_month_start + interval '1 month');

  v_collection_rate := case when v_billed_month > 0
    then round(least(v_collected_month / v_billed_month, 1) * 100, 2)
    else 0 end;

  -- Outstanding receivables: sum of positive installment running balances.
  select coalesce(sum(public.installment_running_balance_unchecked(i.id)), 0)
    into v_outstanding
    from public.installment i
   where i.school_id = p_school_id;

  -- Monthly expenses.
  select coalesce(sum(e.amount * case when e.reverses_event_id is null then 1 else -1 end), 0)
    into v_expenses_month
    from public.money_event e
   where e.school_id = p_school_id
     and e.event_type = 'expense'
     and e.occurred_at::date >= v_month_start;

  v_net_cash_flow_month := v_collected_month - v_expenses_month;

  -- Overdue-student count (distinct students with an overdue outstanding balance).
  select count(distinct i.student_id)
    into v_overdue_count
    from public.installment i
   where i.school_id = p_school_id
     and i.due_date < v_today
     and public.installment_running_balance_unchecked(i.id) > 0;

  -- SMS credit remaining (already derived elsewhere; reused here).
  v_sms_credit_remaining := public.sms_credit_balance_unchecked(p_school_id);

  return jsonb_build_object(
    'accounts', v_accounts,
    'combined_balance', v_combined_balance,
    'collected_month', v_collected_month,
    'collected_year', v_collected_year,
    'outstanding', v_outstanding,
    'collection_rate', v_collection_rate,
    'expenses_month', v_expenses_month,
    'net_cash_flow_month', v_net_cash_flow_month,
    'overdue_count', v_overdue_count,
    'sms_credit_remaining', v_sms_credit_remaining
  );
end;
$function$;

-- student_directory_unchecked: internal, unchanged body (callers that may not hold finance.read use it).
CREATE OR REPLACE FUNCTION public.student_directory_unchecked(p_school_id uuid, p_q text DEFAULT NULL::text, p_stage_id uuid DEFAULT NULL::uuid, p_grade_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_academic_year_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_fin_status text DEFAULT NULL::text, p_due_within_days integer DEFAULT NULL::integer, p_unenrolled boolean DEFAULT false, p_missing_phone boolean DEFAULT false, p_sort text DEFAULT 'name'::text)
 RETURNS TABLE(student_id uuid, name text, guardian_name text, guardian_phone text, status text, grade_id uuid, grade_label text, section_id uuid, section_name text, academic_year_id uuid, total_charged numeric, total_paid numeric, total_discount numeric, total_owed numeric, overdue_amount numeric, days_overdue integer, next_due_date date, next_due_amount numeric, installments_total integer, installments_settled integer, fin_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today  date := (now() at time zone 'Africa/Khartoum')::date;
  v_tokens text[];
  v_qdigits text;
begin
  if p_school_id is distinct from public.current_school_id() then
    raise exception 'FORBIDDEN_SCHOOL' using hint = 'لا تملك صلاحية الوصول لبيانات هذه المدرسة.';
  end if;

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
           public.installment_running_balance_unchecked(i.id) as remaining
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
  bal as (
    select s.id as student_id, public.student_balance_unchecked(s.id)::numeric(14,2) as owed
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
           case
             when coalesce(a.installments_total, 0) = 0 then null::text
             when b.owed <= 0                           then 'paid'
             when a.oldest_overdue is not null          then 'overdue'
             when coalesce(p.total_paid, 0) > 0         then 'partial'
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
           (select bool_and(
                     public.ar_normalize(s.name || ' ' || coalesce(s.guardian_name, ''))
                       like '%' || tok || '%')
              from unnest(v_tokens) as tok)
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
$function$;

-- student_financial_summary_unchecked: internal, unchanged body (callers that may not hold finance.read use it).
CREATE OR REPLACE FUNCTION public.student_financial_summary_unchecked(p_student_id uuid)
 RETURNS TABLE(total_charged numeric, total_discount numeric, total_paid numeric, total_refunded numeric, total_adjusted numeric, total_owed numeric, collection_rate numeric, installments_total integer, installments_settled integer, next_due_date date, next_due_amount numeric, overdue_amount numeric, days_overdue integer, oldest_overdue_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Africa/Khartoum')::date;
begin
  if not exists (
    select 1 from public.student s
     where s.id = p_student_id and s.school_id = public.current_school_id()
  ) then
    raise exception 'FORBIDDEN_STUDENT' using hint = 'الطالب لا ينتمي لمدرستك.';
  end if;

  return query
  with inst as (
    select i.due_date,
           i.amount_charged,
           public.installment_running_balance_unchecked(i.id) as remaining
      from public.installment i
     where i.student_id = p_student_id
  ),
  agg as (
    select coalesce(sum(x.amount_charged), 0)::numeric(14,2)               as charged,
           count(*)::int                                                   as n_total,
           count(*) filter (where x.remaining = 0)::int                    as n_settled,
           coalesce(sum(x.remaining) filter (where x.due_date < v_today), 0)::numeric(14,2) as overdue,
           min(x.due_date) filter (where x.remaining > 0 and x.due_date < v_today) as oldest_overdue,
           min(x.due_date) filter (where x.remaining > 0)                  as next_due
      from inst x
  ),
  nxt as (
    select coalesce(sum(x.remaining), 0)::numeric(14,2) as next_amount
      from inst x, agg
     where x.due_date = agg.next_due and x.remaining > 0
  ),
  pay as (
    select coalesce(sum(pa.amount), 0)::numeric(14,2) as paid
      from public.payment_allocation pa
      join public.installment i on i.id = pa.installment_id
      join public.money_event e on e.id = pa.money_event_id
     where i.student_id = p_student_id
       and e.reverses_event_id is null
       and not exists (select 1 from public.money_event r where r.reverses_event_id = e.id)
  ),
  d as (
    select coalesce(sum(dd.computed_amount), 0)::numeric(14,2) as discount
      from public.discount dd
     where dd.student_id = p_student_id
  ),
  ev as (
    select coalesce(sum(case when e.event_type = 'refund'
                             then case when e.reverses_event_id is null then e.amount else -e.amount end
                        end), 0)::numeric(14,2) as refunded,
           coalesce(sum(case when e.event_type = 'adjustment'
                             then case when e.reverses_event_id is null then e.amount else -e.amount end
                        end), 0)::numeric(14,2) as adjusted
      from public.money_event e
     where e.student_id = p_student_id
       and e.event_type in ('refund', 'adjustment')
  )
  select agg.charged,
         d.discount,
         pay.paid,
         ev.refunded,
         ev.adjusted,
         public.student_balance_unchecked(p_student_id)::numeric(14,2),
         case when agg.charged > 0
              then round((pay.paid / agg.charged) * 100, 2)::numeric(5,2)
              else 0::numeric(5,2) end,
         agg.n_total,
         agg.n_settled,
         agg.next_due,
         nxt.next_amount,
         agg.overdue,
         coalesce((v_today - agg.oldest_overdue), 0)::int,
         agg.oldest_overdue
    from agg, nxt, pay, d, ev;
end;
$function$;

-- student_installments_unchecked: internal, unchanged body (callers that may not hold finance.read use it).
CREATE OR REPLACE FUNCTION public.student_installments_unchecked(p_student_id uuid)
 RETURNS TABLE(installment_id uuid, sequence integer, due_date date, amount_charged numeric, amount_paid numeric, amount_discount numeric, remaining numeric, is_carried_in boolean, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Africa/Khartoum')::date;
begin
  if not exists (
    select 1 from public.student s
     where s.id = p_student_id and s.school_id = public.current_school_id()
  ) then
    raise exception 'FORBIDDEN_STUDENT' using hint = 'الطالب لا ينتمي لمدرستك.';
  end if;

  return query
  with rows_out as (
    select i.id                                              as installment_id,
           i.sequence                                        as sequence,
           i.due_date                                        as due_date,
           i.amount_charged                                  as amount_charged,
           coalesce((
             select sum(pa.amount)
               from public.payment_allocation pa
               join public.money_event e on e.id = pa.money_event_id
              where pa.installment_id = i.id
                and e.reverses_event_id is null
                and not exists (select 1 from public.money_event r
                                 where r.reverses_event_id = e.id)
           ), 0)::numeric(14,2)                              as amount_paid,
           coalesce((
             select sum(dd.computed_amount) from public.discount dd
              where dd.installment_id = i.id
           ), 0)::numeric(14,2)                              as amount_discount,
           public.installment_running_balance_unchecked(i.id)::numeric(14,2) as remaining,
           i.is_carried_in                                   as is_carried_in
      from public.installment i
     where i.student_id = p_student_id
  )
  select r.installment_id, r.sequence, r.due_date, r.amount_charged,
         r.amount_paid, r.amount_discount, r.remaining, r.is_carried_in,
         case
           when r.remaining = 0        then 'paid'
           when r.due_date < v_today   then 'overdue'
           when r.amount_paid > 0 or r.amount_discount > 0 then 'partial'
           else 'upcoming'
         end
    from rows_out r
   order by r.due_date, r.sequence;
end;
$function$;

CREATE OR REPLACE FUNCTION public.student_financial_summary(p_student_id uuid)
 RETURNS TABLE(total_charged numeric, total_discount numeric, total_paid numeric, total_refunded numeric, total_adjusted numeric, total_owed numeric, collection_rate numeric, installments_total integer, installments_settled integer, next_due_date date, next_due_amount numeric, overdue_amount numeric, days_overdue integer, oldest_overdue_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.has_perm('finance.read')
          or (public.has_perm('portal.linked') and p_student_id = any(public.portal_student_ids()))) then
    raise exception 'FORBIDDEN_STUDENT' using
      errcode = 'P0001',
      hint = 'الطالب لا ينتمي لمدرستك.';
  end if;
  return query select * from public.student_financial_summary_unchecked(p_student_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.student_installments(p_student_id uuid)
 RETURNS TABLE(installment_id uuid, sequence integer, due_date date, amount_charged numeric, amount_paid numeric, amount_discount numeric, remaining numeric, is_carried_in boolean, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.has_perm('finance.read')
          or (public.has_perm('portal.linked') and p_student_id = any(public.portal_student_ids()))) then
    raise exception 'FORBIDDEN_STUDENT' using
      errcode = 'P0001',
      hint = 'الطالب لا ينتمي لمدرستك.';
  end if;
  return query select * from public.student_installments_unchecked(p_student_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpis(p_school_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if public.has_perm('finance.read') then
    return public.dashboard_kpis_unchecked(p_school_id);
  end if;
  if public.has_perm('finance.totals') then
    v := public.dashboard_kpis_unchecked(p_school_id);
    -- Totals subset (access-matrix §3): school-level aggregates only, same keys
    -- as the full payload; no per-account, expense, cash-flow or SMS figures.
    return jsonb_build_object(
      'collected_month', v -> 'collected_month',
      'collected_year',  v -> 'collected_year',
      'outstanding',     v -> 'outstanding',
      'collection_rate', v -> 'collection_rate',
      'overdue_count',   v -> 'overdue_count');
  end if;
  raise exception 'FORBIDDEN_PERMISSION' using
    errcode = 'P0001',
    hint = 'لا تملك صلاحية تنفيذ هذا الإجراء.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.student_directory(p_school_id uuid, p_q text DEFAULT NULL::text, p_stage_id uuid DEFAULT NULL::uuid, p_grade_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_academic_year_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_fin_status text DEFAULT NULL::text, p_due_within_days integer DEFAULT NULL::integer, p_unenrolled boolean DEFAULT false, p_missing_phone boolean DEFAULT false, p_sort text DEFAULT 'name'::text)
 RETURNS TABLE(student_id uuid, name text, guardian_name text, guardian_phone text, status text, grade_id uuid, grade_label text, section_id uuid, section_name text, academic_year_id uuid, total_charged numeric, total_paid numeric, total_discount numeric, total_owed numeric, overdue_amount numeric, days_overdue integer, next_due_date date, next_due_amount numeric, installments_total integer, installments_settled integer, fin_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fin   boolean := public.has_perm('finance.read');
  v_ind   boolean := v_fin or public.has_perm('students.fee_indicator');
  v_scope uuid[];
begin
  perform public.assert_perm('students.read');
  if not v_ind and (p_fin_status is not null or p_due_within_days is not null) then
    raise exception 'FORBIDDEN_PERMISSION' using
      errcode = 'P0001',
      hint = 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  end if;
  v_scope := public.perm_scope('students.read');

  return query
  select d.student_id,
         d.name,
         d.guardian_name,
         d.guardian_phone,
         d.status,
         d.grade_id,
         d.grade_label,
         d.section_id,
         d.section_name,
         d.academic_year_id,
         case when v_fin then d.total_charged end,
         case when v_fin then d.total_paid end,
         case when v_fin then d.total_discount end,
         case when v_fin then d.total_owed end,
         case when v_fin then d.overdue_amount end,
         case when v_fin then d.days_overdue end,
         case when v_fin then d.next_due_date end,
         case when v_fin then d.next_due_amount end,
         case when v_fin then d.installments_total end,
         case when v_fin then d.installments_settled end,
         case when v_ind then d.fin_status end
    from public.student_directory_unchecked(p_school_id, p_q, p_stage_id, p_grade_id, p_section_id, p_academic_year_id, p_status, p_fin_status, p_due_within_days, p_unenrolled, p_missing_phone, p_sort) with ordinality as d
   where v_scope is null or public.student_stage_id(d.student_id) = any(v_scope)
   order by d.ordinality;
end;
$function$;

-- ── 6. Grants ──
revoke execute on function public.account_balance_unchecked(uuid) from public, anon, authenticated;
grant execute on function public.account_balance_unchecked(uuid) to service_role;
revoke execute on function public.installment_running_balance_unchecked(uuid) from public, anon, authenticated;
grant execute on function public.installment_running_balance_unchecked(uuid) to service_role;
revoke execute on function public.student_balance_unchecked(uuid) from public, anon, authenticated;
grant execute on function public.student_balance_unchecked(uuid) to service_role;
revoke execute on function public.sms_credit_balance_unchecked(uuid) from public, anon, authenticated;
grant execute on function public.sms_credit_balance_unchecked(uuid) to service_role;
revoke execute on function public.account_balance(uuid) from public, anon;
grant execute on function public.account_balance(uuid) to authenticated, service_role;
revoke execute on function public.installment_running_balance(uuid) from public, anon;
grant execute on function public.installment_running_balance(uuid) to authenticated, service_role;
revoke execute on function public.student_balance(uuid) from public, anon;
grant execute on function public.student_balance(uuid) to authenticated, service_role;
revoke execute on function public.sms_credit_balance(uuid) from public, anon;
grant execute on function public.sms_credit_balance(uuid) to authenticated, service_role;
revoke execute on function public.student_statement(uuid) from public, anon;
grant execute on function public.student_statement(uuid) to authenticated, service_role;
revoke execute on function public.student_payments(uuid) from public, anon;
grant execute on function public.student_payments(uuid) to authenticated, service_role;
revoke execute on function public.receivables_aging(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.receivables_aging(uuid, uuid, uuid, uuid) to authenticated, service_role;
revoke execute on function public.apply_fee_payment(uuid, uuid, numeric, timestamp with time zone, uuid, jsonb, text) from public, anon;
grant execute on function public.apply_fee_payment(uuid, uuid, numeric, timestamp with time zone, uuid, jsonb, text) to authenticated, service_role;
revoke execute on function public.record_expense(uuid, numeric, text, timestamp with time zone, uuid, text, text, text) from public, anon;
grant execute on function public.record_expense(uuid, numeric, text, timestamp with time zone, uuid, text, text, text) to authenticated, service_role;
revoke execute on function public.record_transfer(uuid, uuid, numeric, timestamp with time zone, uuid, text) from public, anon;
grant execute on function public.record_transfer(uuid, uuid, numeric, timestamp with time zone, uuid, text) to authenticated, service_role;
revoke execute on function public.record_refund(uuid, uuid, numeric, timestamp with time zone, uuid, text, text) from public, anon;
grant execute on function public.record_refund(uuid, uuid, numeric, timestamp with time zone, uuid, text, text) to authenticated, service_role;
revoke execute on function public.record_adjustment(uuid, numeric, text, timestamp with time zone, uuid) from public, anon;
grant execute on function public.record_adjustment(uuid, numeric, text, timestamp with time zone, uuid) to authenticated, service_role;
revoke execute on function public.apply_discount(uuid, discount_kind, numeric, uuid, uuid, text) from public, anon;
grant execute on function public.apply_discount(uuid, discount_kind, numeric, uuid, uuid, text) to authenticated, service_role;
revoke execute on function public.reverse_event(uuid, text, uuid) from public, anon;
grant execute on function public.reverse_event(uuid, text, uuid) to authenticated, service_role;
revoke execute on function public.record_opening_balance(uuid, numeric, date) from public, anon;
grant execute on function public.record_opening_balance(uuid, numeric, date) to authenticated, service_role;
revoke execute on function public.dashboard_kpis_unchecked(uuid) from public, anon, authenticated;
grant execute on function public.dashboard_kpis_unchecked(uuid) to service_role;
revoke execute on function public.student_directory_unchecked(uuid, text, uuid, uuid, uuid, uuid, text, text, integer, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.student_directory_unchecked(uuid, text, uuid, uuid, uuid, uuid, text, text, integer, boolean, boolean, text) to service_role;
revoke execute on function public.student_financial_summary_unchecked(uuid) from public, anon, authenticated;
grant execute on function public.student_financial_summary_unchecked(uuid) to service_role;
revoke execute on function public.student_installments_unchecked(uuid) from public, anon, authenticated;
grant execute on function public.student_installments_unchecked(uuid) to service_role;
revoke execute on function public.student_financial_summary(uuid) from public, anon;
grant execute on function public.student_financial_summary(uuid) to authenticated, service_role;
revoke execute on function public.student_installments(uuid) from public, anon;
grant execute on function public.student_installments(uuid) to authenticated, service_role;
revoke execute on function public.dashboard_kpis(uuid) from public, anon;
grant execute on function public.dashboard_kpis(uuid) to authenticated, service_role;
revoke execute on function public.student_directory(uuid, text, uuid, uuid, uuid, uuid, text, text, integer, boolean, boolean, text) from public, anon;
grant execute on function public.student_directory(uuid, text, uuid, uuid, uuid, uuid, text, text, integer, boolean, boolean, text) to authenticated, service_role;
