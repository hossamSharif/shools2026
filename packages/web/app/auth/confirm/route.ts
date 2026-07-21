import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../../../lib/supabase/server.js';

/**
 * Supabase email-link callback: email change and password recovery (also the
 * landing route for signup confirmation if added later). Verifies the OTP
 * token_hash from the link, which sets the session cookie, then bounces to the
 * right destination. `/auth` is already allow-listed in middleware, so this is
 * reachable while signed out (recovery links, old-email confirmations).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');

  if (tokenHash && type) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      // Recovery → set-new-password page; email change/other → account.
      const dest = next ?? (type === 'recovery' ? '/reset-password' : '/account');
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  return NextResponse.redirect(new URL('/login', request.url));
}
