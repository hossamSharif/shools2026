import { expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DataSet,
  DataSetOrFn,
  Expectation,
  FixtureStudent,
  FixtureUser,
} from '@erp/shared/access';
import { DATA_SETS, FIXTURE_PROFILES } from '@erp/shared/access';
import type { AccessFixture } from './fixture.js';

/**
 * Generic direct-query matrix runner (feature 002, FR-034, tasks T021).
 *
 * Every probe runs with the fixture user's OWN session (anon key + user JWT),
 * so RLS and the definer functions decide, exactly as for a hostile client
 * calling PostgREST directly. The service client is used only to read the
 * trusted baseline that an `all` / `own` expectation is compared against.
 */

export interface ProbeError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export interface ProbeResult {
  /** Ids (or keys) of the rows the caller got back; for functions, see below. */
  rowIds: string[];
  rows: Record<string, unknown>[];
  error: ProbeError | null;
  /**
   * Per-student functions: the letters whose call succeeded, and the error
   * for each letter that failed.
   */
  okLetters?: FixtureStudent[];
  errors?: Partial<Record<FixtureStudent, ProbeError>>;
  /** Writes: rows affected (an RLS-hidden update affects 0 rows, no error). */
  affected?: number;
  /** Single-result functions: the returned payload. */
  payload?: unknown;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ProbeContext {
  fx: AccessFixture;
  user: FixtureUser;
  service: SupabaseClient;
}

function callerSchool(ctx: ProbeContext): string {
  return FIXTURE_PROFILES[ctx.user].school === 'B' ? ctx.fx.schoolB : ctx.fx.schoolA;
}

/** Students a caller's probes are aimed at: its own school's fixture rows. */
function targetLetters(ctx: ProbeContext): FixtureStudent[] {
  return FIXTURE_PROFILES[ctx.user].school === 'B' ? ['B'] : ['X', 'Y', 'Z'];
}

export function letterOfStudent(fx: AccessFixture, studentId: string): FixtureStudent | null {
  for (const l of ['X', 'Y', 'Z', 'B'] as const) if (fx.students[l] === studentId) return l;
  return null;
}

function letterOfSection(fx: AccessFixture, sectionId: string): FixtureStudent | null {
  if (sectionId === fx.sections.primary) return 'X';
  if (sectionId === fx.sections.middle) return 'Y';
  return null;
}

// ---------------------------------------------------------------------------
// Table metadata
// ---------------------------------------------------------------------------

type Table = Exclude<DataSet, `storage:${string}`>;

interface TableMeta {
  /** Columns selected and joined into a row key. */
  key: string[];
  /** Column holding the school (absent for reference tables). */
  school?: string;
  /** Column holding the owner for `own` checks. */
  owner?: string;
  /** Column mapping a row to a fixture student letter. */
  student?: string;
}

const TABLES: Record<Table, TableMeta> = {
  school: { key: ['id'], school: 'id' },
  subscription: { key: ['id'], school: 'school_id' },
  academic_year: { key: ['id'], school: 'school_id' },
  section: { key: ['id'], school: 'school_id' },
  student: { key: ['id'], school: 'school_id', student: 'id' },
  enrollment: { key: ['id'], school: 'school_id', student: 'student_id' },
  account: { key: ['id'], school: 'school_id' },
  fee_structure: { key: ['id'], school: 'school_id' },
  fee_item: { key: ['id'], school: 'school_id' },
  installment_schedule: { key: ['id'], school: 'school_id' },
  reminder_rule: { key: ['id'], school: 'school_id' },
  installment: { key: ['id'], school: 'school_id', student: 'student_id' },
  money_event: { key: ['id'], school: 'school_id' },
  payment_allocation: { key: ['id'], school: 'school_id' },
  receipt_counter: { key: ['school_id'], school: 'school_id' },
  discount: { key: ['id'], school: 'school_id' },
  audit_entry: { key: ['id'], school: 'school_id' },
  sms_message_log: { key: ['id'], school: 'school_id' },
  sms_credit_topup: { key: ['id'], school: 'school_id' },
  sms_credit_consumption: { key: ['id'], school: 'school_id' },
  notification: { key: ['id'], school: 'school_id', owner: 'user_id' },
  user: { key: ['id'], school: 'school_id', owner: 'id' },
  role_assignment: { key: ['id'], school: 'school_id', owner: 'user_id' },
  role_assignment_stage: { key: ['assignment_id', 'stage_id'], school: 'school_id' },
  portal_link: { key: ['id'], school: 'school_id', owner: 'user_id' },
  school_role_permission: { key: ['school_id', 'role', 'permission_key'], school: 'school_id' },
  stage: { key: ['id'] },
  grade: { key: ['id'] },
};

const rowKey = (meta: TableMeta, row: Record<string, unknown>) =>
  meta.key.map((k) => String(row[k])).join('|');

function toError(e: unknown): ProbeError | null {
  if (!e) return null;
  const x = e as ProbeError;
  return { code: x.code, message: x.message ?? String(e), details: x.details, hint: x.hint };
}

const isStorage = (t: DataSetOrFn): t is `storage:${string}` & DataSet => t.startsWith('storage:');
const isTable = (t: DataSetOrFn): t is Table =>
  (DATA_SETS as readonly string[]).includes(t) && !isStorage(t);

// ---------------------------------------------------------------------------
// probeRead
// ---------------------------------------------------------------------------

const PER_STUDENT_FNS = new Set([
  'student_statement',
  'student_payments',
  'student_balance',
  'student_financial_summary',
  'student_installments',
]);

function singleFnArgs(fn: string, ctx: ProbeContext): Record<string, unknown> {
  const { fx } = ctx;
  const school = callerSchool(ctx);
  const inB = school === fx.schoolB;
  switch (fn) {
    case 'receivables_aging':
    case 'dashboard_kpis':
    case 'sms_credit_balance':
      return { p_school_id: school };
    case 'student_directory':
      return { p_school_id: school };
    case 'account_balance':
      return { p_account_id: inB ? fx.accounts.B : fx.accounts.A };
    case 'installment_running_balance':
      return { p_installment_id: inB ? fx.installments.B[0] : fx.installments.X[0] };
    case 'consume_sms_credit':
      return {
        p_school_id: school,
        p_sms_message_id: fx.smsLogId,
        p_segments: 1,
        p_idempotency_key: crypto.randomUUID(),
      };
    case 'check_low_sms_credit':
      return { p_school_id: school };
    case 'generate_installments':
      return { p_enrollment_id: fx.enrollments.X };
    default:
      throw new Error(`run-matrix: no read args for ${fn}`);
  }
}

/** Reads a data set or calls a read function with the user's own session. */
export async function probeRead(
  client: SupabaseClient,
  target: DataSetOrFn,
  ctx: ProbeContext,
): Promise<ProbeResult> {
  if (isTable(target)) {
    const meta = TABLES[target];
    const cols = [...new Set([...meta.key, meta.school, meta.owner, meta.student].filter(Boolean))];
    if (target === 'notification') cols.push('type');
    const { data, error } = await client.from(target).select(cols.join(','));
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    return { rowIds: rows.map((r) => rowKey(meta, r)), rows, error: toError(error) };
  }

  if (isStorage(target)) {
    const bucket = target.slice('storage:'.length);
    const { data, error } = await client.storage.from(bucket).list(callerSchool(ctx));
    const rows = (data ?? []).filter((o) => o.id) as unknown as Record<string, unknown>[];
    return { rowIds: rows.map((r) => String(r.name)), rows, error: toError(error) };
  }

  if (PER_STUDENT_FNS.has(target)) {
    const okLetters: FixtureStudent[] = [];
    const errors: Partial<Record<FixtureStudent, ProbeError>> = {};
    const all =
      FIXTURE_PROFILES[ctx.user].school === 'B' ? (['B'] as const) : (['X', 'Y'] as const);
    for (const l of all) {
      const { error } = await client.rpc(target, { p_student_id: ctx.fx.students[l] });
      if (error) errors[l] = toError(error)!;
      else okLetters.push(l);
    }
    return { rowIds: okLetters, rows: [], error: null, okLetters, errors };
  }

  const { data, error } = await client.rpc(target, singleFnArgs(target, ctx));
  if (target === 'student_directory') {
    const rows = (data ?? []) as Record<string, unknown>[];
    return {
      rowIds: rows.map((r) => String(r.student_id)),
      rows,
      error: toError(error),
    };
  }
  return { rowIds: error ? [] : ['ok'], rows: [], error: toError(error), payload: data };
}

// ---------------------------------------------------------------------------
// probeWrite
// ---------------------------------------------------------------------------

export type WriteSample =
  | { kind: 'insert'; table: string; row: Record<string, unknown> }
  | { kind: 'touch'; table: string; match: Record<string, unknown>; column: string }
  | { kind: 'rpc'; fn: string; args: Record<string, unknown>; before?: WriteSample }
  | { kind: 'upload'; bucket: string; path: string };

const today = () => new Date().toISOString();

async function firstId(
  service: SupabaseClient,
  table: string,
  col: string,
  value: string,
): Promise<string | null> {
  const { data } = await service.from(table).select('id').eq(col, value).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

/**
 * A representative write against the caller's own school. Returns null when
 * the fixture has no suitable row for that school (the matrix test then skips
 * the write probe for that cell).
 */
export async function defaultWriteSample(
  target: DataSetOrFn,
  ctx: ProbeContext,
  expectAllowed: boolean,
): Promise<WriteSample | null> {
  const { fx, service } = ctx;
  const school = callerSchool(ctx);
  const inB = school === fx.schoolB;
  const studentId = inB ? fx.students.B : fx.students.X;
  const accountId = inB ? fx.accounts.B : fx.accounts.A;
  const uniq = () => `probe-${crypto.randomUUID().slice(0, 8)}`;
  const touch = (
    table: string,
    id: string | null,
    column: string,
    matchCol = 'id',
  ): WriteSample | null =>
    id ? { kind: 'touch', table, match: { [matchCol]: id }, column } : null;

  switch (target) {
    case 'school':
      // The super-admin probes School A (it has no school of its own).
      return touch('school', school, 'name');
    case 'subscription':
      return touch('subscription', school, 'grace_days', 'school_id');
    case 'academic_year':
      return inB ? null : touch('academic_year', fx.yearA, 'label');
    case 'section':
      return inB ? null : touch('section', fx.sections.primary, 'name');
    case 'student':
      return { kind: 'insert', table: 'student', row: { school_id: school, name: uniq() } };
    case 'account':
      return touch('account', accountId, 'name');
    case 'fee_structure':
      return inB ? null : touch('fee_structure', fx.feeStructures.primary, 'grade_id');
    case 'fee_item':
      return inB
        ? null
        : touch(
            'fee_item',
            await firstId(service, 'fee_item', 'fee_structure_id', fx.feeStructures.primary),
            'name',
          );
    case 'installment_schedule':
      return inB
        ? null
        : touch(
            'installment_schedule',
            await firstId(
              service,
              'installment_schedule',
              'fee_structure_id',
              fx.feeStructures.primary,
            ),
            'amount',
          );
    case 'reminder_rule':
      return {
        kind: 'insert',
        table: 'reminder_rule',
        row: { school_id: school, offset_kind: 'before', days: 3 },
      };
    case 'installment':
      return touch(
        'installment',
        inB ? fx.installments.B[0]! : fx.installments.X[0]!,
        'amount_charged',
      );
    case 'money_event':
      return touch(
        'money_event',
        inB ? fx.payments.B.moneyEventId : fx.payments.X.moneyEventId,
        'occurred_at',
      );
    case 'payment_allocation':
      return touch(
        'payment_allocation',
        await firstId(
          service,
          'payment_allocation',
          'money_event_id',
          inB ? fx.payments.B.moneyEventId : fx.payments.X.moneyEventId,
        ),
        'amount',
      );
    case 'receipt_counter':
      return touch('receipt_counter', school, 'next_value', 'school_id');
    case 'audit_entry':
      return touch(
        'audit_entry',
        await firstId(service, 'audit_entry', 'school_id', school),
        'action',
      );
    case 'sms_message_log':
      return inB ? null : touch('sms_message_log', fx.smsLogId, 'status');
    case 'storage:money-attachments':
    case 'storage:school-logos':
      return {
        kind: 'upload',
        bucket: target.slice('storage:'.length),
        path: `${school}/${uniq()}.png`,
      };

    case 'apply_fee_payment':
      return {
        kind: 'rpc',
        fn: 'apply_fee_payment',
        args: {
          p_student_id: studentId,
          p_account_id: accountId,
          p_amount: 1,
          p_occurred_at: today(),
          p_idempotency_key: crypto.randomUUID(),
        },
      };
    case 'record_expense':
      return {
        kind: 'rpc',
        fn: 'record_expense',
        args: {
          p_account_id: accountId,
          p_amount: 1,
          p_category: 'other',
          p_occurred_at: today(),
          p_idempotency_key: crypto.randomUUID(),
        },
      };
    case 'record_transfer':
      return inB
        ? null
        : {
            kind: 'rpc',
            fn: 'record_transfer',
            args: {
              p_from_account_id: fx.accounts.A,
              p_to_account_id: fx.accounts.A2,
              p_amount: 1,
              p_occurred_at: today(),
              p_idempotency_key: crypto.randomUUID(),
            },
          };
    case 'record_refund':
      return {
        kind: 'rpc',
        fn: 'record_refund',
        args: {
          p_student_id: studentId,
          p_account_id: accountId,
          p_amount: 1,
          p_occurred_at: today(),
          p_idempotency_key: crypto.randomUUID(),
        },
      };
    case 'record_adjustment':
      return {
        kind: 'rpc',
        fn: 'record_adjustment',
        args: {
          p_student_id: studentId,
          p_amount: 1,
          p_reason: 'matrix probe',
          p_occurred_at: today(),
          p_idempotency_key: crypto.randomUUID(),
        },
      };
    case 'apply_discount':
      return {
        kind: 'rpc',
        fn: 'apply_discount',
        args: {
          p_student_id: studentId,
          p_kind: 'fixed',
          p_value: 1,
          p_idempotency_key: crypto.randomUUID(),
          p_reason: 'matrix probe',
        },
      };
    case 'reverse_event': {
      // An allowed caller reverses a payment it just made, so repeated probes
      // never try to reverse the same event twice.
      const pay = (await defaultWriteSample('apply_fee_payment', ctx, true)) as Extract<
        WriteSample,
        { kind: 'rpc' }
      >;
      return expectAllowed
        ? {
            kind: 'rpc',
            fn: 'reverse_event',
            args: { p_reason: 'matrix probe', p_idempotency_key: crypto.randomUUID() },
            before: pay,
          }
        : {
            kind: 'rpc',
            fn: 'reverse_event',
            args: {
              p_money_event_id: inB ? fx.payments.B.moneyEventId : fx.payments.X.moneyEventId,
              p_reason: 'matrix probe',
              p_idempotency_key: crypto.randomUUID(),
            },
          };
    }
    case 'record_opening_balance':
      return {
        kind: 'rpc',
        fn: 'record_opening_balance',
        args: { p_student_id: inB ? fx.students.B : fx.students.Z, p_amount: 1 },
      };
    case 'topup_sms_credit':
      return {
        kind: 'rpc',
        fn: 'topup_sms_credit',
        args: { p_school_id: school, p_amount: 1, p_idempotency_key: crypto.randomUUID() },
      };
    default:
      return null;
  }
}

/** 1×1 transparent PNG. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
);

/** Attempts a representative write with the user's own session. */
export async function probeWrite(
  client: SupabaseClient,
  _target: DataSetOrFn,
  sample: WriteSample,
  service: SupabaseClient,
): Promise<ProbeResult> {
  switch (sample.kind) {
    case 'insert': {
      const { data, error } = await client.from(sample.table).insert(sample.row).select();
      return { rowIds: [], rows: [], error: toError(error), affected: data?.length ?? 0 };
    }
    case 'touch': {
      // Re-write a column with its current value: a real UPDATE that changes nothing.
      const { data: current } = await service
        .from(sample.table)
        .select(sample.column)
        .match(sample.match)
        .limit(1);
      const value = (current?.[0] as Record<string, unknown> | undefined)?.[sample.column];
      const { data, error } = await client
        .from(sample.table)
        .update({ [sample.column]: value })
        .match(sample.match)
        .select();
      return { rowIds: [], rows: [], error: toError(error), affected: data?.length ?? 0 };
    }
    case 'rpc': {
      let args = sample.args;
      if (sample.before && sample.before.kind === 'rpc') {
        const { data, error } = await client.rpc(sample.before.fn, sample.before.args);
        if (error) return { rowIds: [], rows: [], error: toError(error), affected: 0 };
        args = { ...args, p_money_event_id: (data as { money_event_id: string }).money_event_id };
      }
      const { error } = await client.rpc(sample.fn, args);
      return { rowIds: [], rows: [], error: toError(error), affected: error ? 0 : 1 };
    }
    case 'upload': {
      const { data, error } = await client.storage
        .from(sample.bucket)
        .upload(sample.path, PNG, { contentType: 'image/png' });
      if (data) await service.storage.from(sample.bucket).remove([sample.path]);
      return { rowIds: [], rows: [], error: toError(error), affected: data ? 1 : 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// Baselines (service role) and assertions
// ---------------------------------------------------------------------------

/** Trusted rows a data set holds for the caller's scope (service role). */
export async function baselineIds(
  target: DataSetOrFn,
  ctx: ProbeContext,
  mode: 'all' | 'own',
): Promise<string[]> {
  const { service, fx, user } = ctx;
  if (isStorage(target)) {
    const { data } = await service.storage
      .from(target.slice('storage:'.length))
      .list(callerSchool(ctx));
    return (data ?? []).filter((o) => o.id).map((o) => o.name);
  }
  if (!isTable(target)) return [];
  const meta = TABLES[target];
  let q = service.from(target).select(meta.key.join(','));
  const isSuper = FIXTURE_PROFILES[user].school === null;
  const userId = fx.users[user].userId;
  if (mode === 'own') {
    if (target === 'school') q = q.eq('id', callerSchool(ctx));
    else if (target === 'role_assignment_stage') {
      const { data: mine } = await service
        .from('role_assignment')
        .select('id')
        .eq('user_id', userId);
      q = q.in(
        'assignment_id',
        (mine ?? []).map((r) => r.id as string),
      );
    } else if (meta.owner) q = q.eq(meta.owner, userId);
  } else if (meta.school && !isSuper) {
    q = q.eq(meta.school, callerSchool(ctx));
  } else if (meta.school && isSuper) {
    // The super-admin's "all" is every school it manages; restrict to the two
    // fixture schools so concurrent suites do not interfere.
    q = q.in(meta.school, [fx.schoolA, fx.schoolB]);
  }
  const { data, error } = await q;
  if (error) throw Object.assign(new Error(`baseline ${target} failed`), { cause: error });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => rowKey(meta, r));
}

const DASHBOARD_TOTALS_KEYS = [
  'collected_month',
  'collected_year',
  'outstanding',
  'collection_rate',
  'overdue_count',
] as const;

const DIRECTORY_FINANCE_COLUMNS = [
  'total_charged',
  'total_paid',
  'total_discount',
  'total_owed',
  'overdue_amount',
  'days_overdue',
  'next_due_date',
  'next_due_amount',
  'installments_total',
  'installments_settled',
] as const;

export function isRefusal(e: ProbeError | null | undefined): boolean {
  if (!e) return false;
  return (
    e.code === '42501' ||
    /^FORBIDDEN/.test(e.message ?? '') ||
    /permission denied|row-level security/i.test(e.message ?? '')
  );
}

/** The error of a `none` read must not reveal the table or any fixture row. */
function assertNoLeak(e: ProbeError | null, target: string, fx: AccessFixture): void {
  if (!e) return;
  const text = `${e.message} ${e.details ?? ''} ${e.hint ?? ''}`;
  expect(text, `error for ${target} names the table`).not.toContain(target);
  for (const id of Object.values(fx.students))
    expect(text, `error for ${target} leaks a row id`).not.toContain(id);
}

/** Asserts one probe result against its expectation. */
export async function assertExpectation(
  result: ProbeResult,
  expectation: Expectation,
  ctx: ProbeContext,
  target: DataSetOrFn,
): Promise<void> {
  const label = `${ctx.user} → ${target}`;
  const { fx } = ctx;

  // Per-student functions.
  if (result.okLetters) {
    const reachable = FIXTURE_PROFILES[ctx.user].school === 'B' ? ['B'] : ['X', 'Y'];
    const want =
      expectation.read === 'all'
        ? reachable
        : expectation.read === 'scoped'
          ? (expectation.rowsOf ?? []).filter((l) => reachable.includes(l))
          : [];
    expect([...result.okLetters].sort(), label).toEqual([...want].sort());
    for (const [l, e] of Object.entries(result.errors ?? {})) {
      expect(
        isRefusal(e),
        `${label} (${l}) should be a refusal, got ${e?.code} ${e?.message}`,
      ).toBe(true);
    }
    return;
  }

  switch (expectation.read) {
    case 'refused':
      expect(
        isRefusal(result.error),
        `${label} should be refused, got ${JSON.stringify(result.error)}`,
      ).toBe(true);
      return;
    case 'none':
      expect(result.rows.length, `${label} should return 0 rows`).toBe(0);
      assertNoLeak(result.error, target, fx);
      return;
    case 'totals': {
      expect(result.error, label).toBeNull();
      const keys = Object.keys((result.payload ?? {}) as object).sort();
      expect(keys, `${label} totals subset`).toEqual([...DASHBOARD_TOTALS_KEYS].sort());
      return;
    }
    case 'masked':
    case 'scoped':
    case 'all':
    case 'own':
      break;
  }

  expect(result.error, `${label} unexpected error`).toBeNull();

  if (target === 'student_directory') {
    const letters = result.rowIds.map((id) => letterOfStudent(fx, id)).filter((l) => l !== null);
    expect(letters.sort(), `${label} rows`).toEqual([...(expectation.rowsOf ?? [])].sort());
    // Only fixture students may appear.
    expect(letters.length, `${label} returned non-fixture rows`).toBe(result.rowIds.length);
    if (expectation.read === 'masked') {
      for (const row of result.rows) {
        for (const col of DIRECTORY_FINANCE_COLUMNS)
          expect(row[col], `${label} ${col} masked`).toBeNull();
        expect(row.fin_status ?? null, `${label} fin_status masked`).toBeNull();
      }
    }
    return;
  }

  if (!isTable(target) && !isStorage(target)) {
    // Single-result function: success is all that `all` asks.
    return;
  }

  if (expectation.read === 'scoped') {
    const meta = isTable(target) ? TABLES[target] : undefined;
    const letters = result.rows.map((r) => {
      if (target === 'section') return letterOfSection(fx, String(r.id));
      return meta?.student ? letterOfStudent(fx, String(r[meta.student])) : null;
    });
    expect(letters.includes(null), `${label} returned rows outside the fixture scope`).toBe(false);
    expect([...new Set(letters)].sort(), `${label} rows`).toEqual(
      [...(expectation.rowsOf ?? [])].sort(),
    );
    return;
  }

  const baseline = await baselineIds(target, ctx, expectation.read === 'own' ? 'own' : 'all');
  if (expectation.read === 'own' && target === 'notification') {
    const types = [...new Set(result.rows.map((r) => String(r.type)))].sort();
    expect(types, `${label} notification types`).toEqual([...(expectation.types ?? [])].sort());
    const userId = fx.users[ctx.user].userId;
    for (const r of result.rows) expect(r.user_id, `${label} foreign notification`).toBe(userId);
    return;
  }
  // Reference tables and the super-admin (every school) may hold more rows
  // than the fixture made; everything else must match the baseline exactly.
  const got = [...new Set(result.rowIds)].sort();
  if (target === 'stage' || target === 'grade' || FIXTURE_PROFILES[ctx.user].school === null) {
    for (const id of baseline) expect(got, `${label} missing ${id}`).toContain(id);
    return;
  }
  expect(got, `${label} rows`).toEqual([...new Set(baseline)].sort());
}

/** Asserts a write probe: allowed = no error and ≥1 row; refused = refusal or 0 rows. */
export function assertWrite(result: ProbeResult, want: 'allowed' | 'refused', label: string): void {
  if (want === 'allowed') {
    expect(result.error, `${label} write should succeed`).toBeNull();
    expect(result.affected ?? 0, `${label} write affected no row`).toBeGreaterThan(0);
  } else {
    const refused = isRefusal(result.error) || (!result.error && (result.affected ?? 0) === 0);
    expect(
      refused,
      `${label} write should be refused, got ${JSON.stringify(result.error)} / ${result.affected}`,
    ).toBe(true);
  }
}

/** Fixture letters of the caller's school (exported for named cases). */
export { targetLetters };
