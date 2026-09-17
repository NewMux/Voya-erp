import { z } from 'zod';
import { fieldErrorsFrom } from '@/lib/validation';

/**
 * Shared shape for server action results.
 *
 * Actions either redirect on success or return this, so forms can render
 * validation messages inline without client-side schema duplication.
 */
export type ActionState = {
  ok: boolean;
  /** Form-level message, e.g. a capacity clash or a permission failure. */
  error?: string;
  /** Per-field messages, keyed by input name. */
  fieldErrors?: Record<string, string>;
  /** Success message, when the action stays on the page. */
  message?: string;
};

export const idleState: ActionState = { ok: false };

/** Validate FormData, returning either parsed data or a renderable error state. */
export function parseForm<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData,
): { success: true; data: z.infer<T> } | { success: false; state: ActionState } {
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(raw);

  if (!parsed.success) {
    return {
      success: false,
      state: {
        ok: false,
        error: 'Please correct the highlighted fields.',
        fieldErrors: fieldErrorsFrom(parsed.error),
      },
    };
  }

  return { success: true, data: parsed.data };
}

/**
 * Turn a thrown error into a form-level message.
 *
 * Domain errors (capacity, permissions, validation) carry messages written for
 * staff, so they are shown as-is. Anything else is logged and replaced with a
 * generic message rather than leaking internals into the UI.
 */
export function toActionState(error: unknown): ActionState {
  const domainErrors = ['CapacityError', 'ValidationError'];

  if (error instanceof Error) {
    if (domainErrors.includes(error.name) || error.message.startsWith('You ')) {
      return { ok: false, error: error.message };
    }

    // Unique constraint violations are worth explaining precisely.
    if ('code' in error && (error as { code?: string }).code === 'P2002') {
      return { ok: false, error: 'That value is already in use.' };
    }
  }

  console.error('Unhandled action error:', error);
  return { ok: false, error: 'Something went wrong. Please try again.' };
}
