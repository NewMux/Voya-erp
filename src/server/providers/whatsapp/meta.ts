import { env } from '@/lib/env';
import type { OutboundMessage, SendResult, WhatsAppProvider } from './types';

/**
 * WhatsApp Cloud API.
 *
 * Business-initiated messages outside the 24-hour customer service window must
 * use a pre-approved template, which is what every notification here is, so
 * this always sends `type: "template"` rather than free-form text.
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta';

  async send(message: OutboundMessage): Promise<SendResult> {
    const config = env();

    if (!message.metaTemplateName) {
      // A template that has not been mapped cannot be sent, and retrying will
      // not change that — it needs a person to approve and record the name.
      return {
        status: 'FAILED',
        provider: this.name,
        error: 'No approved WhatsApp template is mapped for this notification.',
        retryable: false,
      };
    }

    const url =
      `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/` +
      `${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.toPhone,
      type: 'template',
      template: {
        name: message.metaTemplateName,
        language: { code: message.metaLanguageCode },
        components:
          message.templateParameters.length > 0
            ? [
                {
                  type: 'body',
                  parameters: message.templateParameters.map((text) => ({
                    type: 'text',
                    text,
                  })),
                },
              ]
            : [],
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        // Without a timeout a hung request would stall the whole cron run.
        signal: AbortSignal.timeout(15_000),
      });

      const text = await response.text();

      if (!response.ok) {
        return {
          status: 'FAILED',
          provider: this.name,
          error: `Cloud API ${response.status}: ${text.slice(0, 500)}`,
          // 4xx is a bad request or a rejected template — retrying sends the
          // same thing again. 429 and 5xx are worth another attempt.
          retryable: response.status === 429 || response.status >= 500,
        };
      }

      const body = JSON.parse(text) as { messages?: Array<{ id?: string }> };
      return {
        status: 'SENT',
        provider: this.name,
        providerMessageId: body.messages?.[0]?.id ?? null,
      };
    } catch (error) {
      // Network failure or timeout: the message may or may not have gone out,
      // but the dedupe key means a retry cannot duplicate it.
      return {
        status: 'FAILED',
        provider: this.name,
        error: error instanceof Error ? error.message : 'Network error',
        retryable: true,
      };
    }
  }
}
