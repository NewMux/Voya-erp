import { env } from '@/lib/env';
import { ManualWhatsAppProvider } from './manual';
import { MetaWhatsAppProvider } from './meta';
import type { WhatsAppProvider } from './types';

export * from './types';
export { ManualWhatsAppProvider } from './manual';
export { MetaWhatsAppProvider } from './meta';

let cached: WhatsAppProvider | null = null;

/** The provider selected by WHATSAPP_PROVIDER. */
export function whatsappProvider(): WhatsAppProvider {
  cached ??= env().WHATSAPP_PROVIDER === 'meta'
    ? new MetaWhatsAppProvider()
    : new ManualWhatsAppProvider();
  return cached;
}

/** Test-only: drop the cached provider so a test can vary the environment. */
export function resetWhatsAppProvider(): void {
  cached = null;
}
