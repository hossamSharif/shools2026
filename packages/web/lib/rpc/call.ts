import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';

/**
 * Maps known DB error-code strings (raised as the exception MESSAGE by the money
 * functions) to a typed application error. The RPC contract uses the message as
 * the code (Article I contracts).
 */
export const RPC_ERROR_CODES = [
  'WRITES_GATED',
  'DISPATCH_PAUSED',
  'OVERPAYMENT_BLOCKED',
  'INSUFFICIENT_ALLOCATION_TARGET',
  'INSUFFICIENT_CREDIT',
  'IDEMPOTENT_REPLAY',
  'FORBIDDEN',
] as const;

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

export class RpcError extends Error {
  constructor(
    public readonly code: RpcErrorCode | 'UNKNOWN',
    message: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

function classify(message: string | undefined): RpcErrorCode | 'UNKNOWN' {
  if (!message) return 'UNKNOWN';
  const match = RPC_ERROR_CODES.find((c) => message.includes(c));
  return match ?? 'UNKNOWN';
}

/**
 * Calls a Supabase Postgres function (RPC) with Zod validation on BOTH sides
 * (Article XI): input is parsed before the wire call, output on return. DB
 * errors are normalized to a typed RpcError.
 */
export async function callRpc<TInput, TOutput>(
  supabase: SupabaseClient,
  fn: string,
  args: TInput,
  input: z.ZodType<TInput>,
  output: z.ZodType<TOutput>,
): Promise<TOutput> {
  const parsedArgs = input.parse(args);

  const { data, error } = await supabase.rpc(fn, parsedArgs as Record<string, unknown>);

  if (error) {
    throw new RpcError(classify(error.message), error.message);
  }

  return output.parse(data);
}
