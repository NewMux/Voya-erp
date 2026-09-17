'use client';

import { useFormStatus } from 'react-dom';
import type { ComponentProps, ReactNode } from 'react';
import { Alert, Button } from './ui';
import type { ActionState } from '@/server/actions/types';

/**
 * Form primitives.
 *
 * Thin client wrappers over the shared kit: the only reason these need to be
 * client components is `useFormStatus`, which gives every submit button a
 * pending state without any per-form state wiring.
 */

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? (pendingLabel ?? 'Saving…') : children}
    </Button>
  );
}

/** Form-level error or success banner. */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <div className="mb-4">
        <Alert tone="danger">{state.error}</Alert>
      </div>
    );
  }

  if (state.ok && state.message) {
    return (
      <div className="mb-4">
        <Alert tone="success">{state.message}</Alert>
      </div>
    );
  }

  return null;
}

/** A confirm-before-submit button, for destructive actions. */
export function ConfirmButton({
  confirmText,
  children,
  ...props
}: ComponentProps<typeof Button> & { confirmText: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmText)) event.preventDefault();
      }}
      {...props}
    >
      {children}
    </Button>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
      {children}
    </div>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}
