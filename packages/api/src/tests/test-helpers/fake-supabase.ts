/**
 * Minimal chainable fake of the subset of the Supabase JS client surface used
 * by the dispatch worker (`.from().select()/.insert()/.update()/.eq()/.in()`
 * and `.rpc()`). Not a full mock — enough to unit-test dispatch control flow
 * (credit integrity, no-phone skip, pause) without a live database.
 */
export type TableName = string;

export interface FakeTableState {
  reminder_rule?: Array<{ offset_kind: string; days: number; enabled: boolean }>;
  installment?: Array<Record<string, unknown>>;
  sms_message_log?: Array<Record<string, unknown>>;
  school?: Array<{ id: string }>;
  student?: Array<Record<string, unknown>>;
}

export interface RpcHandlers {
  subscription_state?: (args: Record<string, unknown>) => { data: unknown; error: unknown };
  installment_running_balance?: (args: Record<string, unknown>) => {
    data: unknown;
    error: unknown;
  };
  consume_sms_credit?: (args: Record<string, unknown>) => { data: unknown; error: unknown };
  student_balance?: (args: Record<string, unknown>) => { data: unknown; error: unknown };
}

class FakeQueryBuilder {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private op: 'select' | 'insert' | 'update' = 'select';
  private payload: Record<string, unknown> | undefined;

  constructor(
    private state: FakeTableState,
    private table: TableName,
    private onWrite: (table: TableName, rows: Array<Record<string, unknown>>) => void,
  ) {}

  select(): this {
    // .select() after .insert()/.update() (returning clause) must not reset
    // the pending write operation — only a bare .select() query is 'select'.
    if (this.op !== 'insert' && this.op !== 'update') {
      this.op = 'select';
    }
    return this;
  }

  insert(payload: Record<string, unknown>): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }

  eq(key: string, value: unknown): this {
    this.filters.push((row) => row[key] === value);
    return this;
  }

  in(key: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }

  private rows(): Array<Record<string, unknown>> {
    const table = (this.state as Record<string, unknown>)[this.table] as
      | Array<Record<string, unknown>>
      | undefined;
    return (table ?? []).filter((row) => this.filters.every((f) => f(row)));
  }

  async single() {
    if (this.op === 'insert') {
      const row = { id: `generated-${Math.random().toString(36).slice(2)}`, ...this.payload };
      this.onWrite(this.table, [row]);
      return { data: row, error: null };
    }
    const rows = this.rows();
    return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'NOT_FOUND' } };
  }

  async maybeSingle() {
    const rows = this.rows();
    return { data: rows[0] ?? null, error: null };
  }

  then(
    resolve: (v: { data: unknown; error: unknown }) => void,
    reject?: (e: unknown) => void,
  ) {
    try {
      if (this.op === 'update') {
        const table = (this.state as Record<string, unknown>)[this.table] as
          | Array<Record<string, unknown>>
          | undefined;
        for (const row of table ?? []) {
          if (this.filters.every((f) => f(row))) Object.assign(row, this.payload);
        }
        resolve({ data: null, error: null });
        return;
      }
      resolve({ data: this.rows(), error: null });
    } catch (e) {
      reject?.(e);
    }
  }
}

export function createFakeSupabase(state: FakeTableState, rpcHandlers: RpcHandlers) {
  const writes: Record<TableName, Array<Record<string, unknown>>> = {};

  const client = {
    from(table: TableName) {
      return new FakeQueryBuilder(state, table, (t, rows) => {
        const target = ((state as Record<string, unknown>)[t] as
          | Array<Record<string, unknown>>
          | undefined) ?? [];
        target.push(...rows);
        (state as Record<string, unknown>)[t] = target;
        writes[t] = (writes[t] ?? []).concat(rows);
      });
    },
    rpc(name: keyof RpcHandlers, args: Record<string, unknown>) {
      const handler = rpcHandlers[name];
      const result = handler ? handler(args) : { data: null, error: null };
      return Promise.resolve(result);
    },
    __writes: writes,
  };

  return client;
}
