/**
 * WhatsApp provider interface.
 *
 * Two implementations ship: the Meta Cloud API, and a manual mode that queues
 * messages for staff to send via a wa.me link. Manual mode is what makes
 * Section 6 usable on day one, before Meta business verification and template
 * approval are in place — the outbox, scheduling, deduplication and the message
 * bodies all work identically either way.
 */

export type OutboundMessage = {
  /** E.164 digits, no plus. */
  toPhone: string;
  /** The rendered body. Used verbatim in manual mode. */
  body: string;
  /** Approved Cloud API template name, when the provider needs one. */
  metaTemplateName: string | null;
  metaLanguageCode: string;
  /** Ordered parameter values for the template's {{1}}, {{2}}, … */
  templateParameters: string[];
};

export type SendResult =
  | { status: 'SENT'; providerMessageId: string | null; provider: string }
  /** Queued for a human to send; not a failure. */
  | { status: 'MANUAL'; provider: string }
  | { status: 'FAILED'; error: string; provider: string; retryable: boolean };

export interface WhatsAppProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<SendResult>;
}
