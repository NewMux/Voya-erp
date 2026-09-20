'use client';

import { useActionState } from 'react';
import { togglePartnerOfferActive } from '@/server/actions/partner-offer.actions';
import { idleState } from '@/server/actions/types';

export function ToggleActiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [, action] = useActionState(togglePartnerOfferActive, idleState);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        {isActive ? 'Deactivate' : 'Reactivate'}
      </button>
    </form>
  );
}
