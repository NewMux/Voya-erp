import type { OutboundMessage, SendResult, WhatsAppProvider } from './types';

/**
 * Manual dispatch.
 *
 * Sends nothing. Messages stay in the outbox for staff to send from the
 * Notifications screen via a prefilled wa.me link, which is the fallback the
 * client can use before the Cloud API is approved.
 *
 * It returns MANUAL rather than FAILED so that nothing is ever retried into
 * oblivion, and the dashboard's "queued" count is honest.
 */
export class ManualWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'manual';

  async send(_message: OutboundMessage): Promise<SendResult> {
    return { status: 'MANUAL', provider: this.name };
  }
}
