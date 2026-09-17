'use client';

import { useActionState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  cancelNotification,
  dispatchNow,
  markNotificationSent,
  retryNotification,
} from '@/server/actions/notification.actions';
import { Button } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form';
import { idleState } from '@/server/actions/types';

/**
 * Manual dispatch row.
 *
 * The wa.me link opens WhatsApp with the message pre-filled; "Mark sent" then
 * records it. Two steps rather than one because the app cannot know whether the
 * staff member actually pressed send in WhatsApp.
 */
export function ManualSendActions({
  notificationId,
  waLink,
}: {
  notificationId: string;
  waLink: string;
}) {
  const [sentState, sentAction] = useActionState(markNotificationSent, idleState);
  const [cancelState, cancelAction] = useActionState(cancelNotification, idleState);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FormMessage state={sentState} />
      <FormMessage state={cancelState} />

      <a
        href={waLink}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-md bg-voya-400 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-voya-500"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        Open WhatsApp
      </a>

      <form action={sentAction}>
        <input type="hidden" name="notificationId" value={notificationId} />
        <SubmitButton size="sm" variant="secondary">
          Mark sent
        </SubmitButton>
      </form>

      <form action={cancelAction}>
        <input type="hidden" name="notificationId" value={notificationId} />
        <Button type="submit" size="sm" variant="ghost">
          Cancel
        </Button>
      </form>
    </div>
  );
}

/** Retry a message the provider rejected. */
export function RetryAction({ notificationId }: { notificationId: string }) {
  const [state, action] = useActionState(retryNotification, idleState);

  return (
    <form action={action}>
      <FormMessage state={state} />
      <input type="hidden" name="notificationId" value={notificationId} />
      <SubmitButton size="sm" variant="secondary">
        Retry
      </SubmitButton>
    </form>
  );
}

/** Run the dispatcher immediately. */
export function DispatchNowButton() {
  const [state, action] = useActionState(dispatchNow, idleState);

  return (
    <form action={action}>
      <FormMessage state={state} />
      <SubmitButton size="sm" variant="secondary" pendingLabel="Dispatching…">
        Dispatch now
      </SubmitButton>
    </form>
  );
}
