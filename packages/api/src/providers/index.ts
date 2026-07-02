import type { SmsProvider } from '@erp/shared';
import { GenericHttpSmsProvider } from './generic-http.js';

let cached: SmsProvider | undefined;

/** Resolves the single configured SmsProvider adapter (Article VI). */
export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  cached = new GenericHttpSmsProvider({
    url: process.env.SMS_PROVIDER_URL ?? '',
    apiKey: process.env.SMS_PROVIDER_API_KEY ?? '',
  });
  return cached;
}

/** Test/DI helper to override the cached provider instance. */
export function setSmsProvider(provider: SmsProvider): void {
  cached = provider;
}
