'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { lookupCustomers } from '@/server/actions/lookup.actions';
import { quickCreateCustomer } from '@/server/actions/customer.actions';

/**
 * Customer picker for the booking screen.
 *
 * The PRD wants the membership number to be the primary key here, so the search
 * runs against `searchCustomers`, which short-circuits on an exact membership
 * match. Selecting a customer surfaces their passport and member discount
 * immediately — the "auto-fills profile, passport and preferences" the PRD asks
 * for.
 */

export type PickerCustomer = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  nationality: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  customerType: string;
  companyName: string | null;
  membership: {
    membershipNumber: string;
    tier: string;
    discountPercent: string;
    active: boolean;
    expiryDate: string;
  } | null;
};

export function CustomerPicker({
  value,
  onChange,
}: {
  value: PickerCustomer | null;
  onChange: (customer: PickerCustomer | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickerCustomer[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Guards against an earlier, slower request overwriting a later one.
  const requestId = useRef(0);

  const [quickCreating, setQuickCreating] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [isCreating, startCreating] = useTransition();

  function openQuickCreate() {
    // The search query is usually the phone/membership number staff typed
    // first — reuse it as the starting phone value rather than retyping.
    setQuickPhone(/[a-z]/i.test(query) ? '' : query.trim());
    setQuickName('');
    setQuickError(null);
    setQuickCreating(true);
  }

  function submitQuickCreate() {
    setQuickError(null);
    startCreating(async () => {
      const result = await quickCreateCustomer({ fullName: quickName, phone: quickPhone });
      if ('error' in result) {
        setQuickError(result.error);
        return;
      }
      onChange(result.customer);
      setQuickCreating(false);
    });
  }

  // Debounced search. Bumping requestId first means an in-flight request for a
  // stale query is discarded when it returns, so a slow early response cannot
  // overwrite the results for what the user has since typed.
  useEffect(() => {
    const trimmed = query.trim();
    const id = ++requestId.current;

    if (trimmed.length < 2) return;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const found = await lookupCustomers(trimmed);
        if (id === requestId.current) {
          setResults(found);
          setSearched(true);
        }
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Derived from the query rather than stored, so clearing the box does not
  // need a setState inside the effect above.
  const showResults = query.trim().length >= 2;
  const visibleResults = showResults ? results : [];

  if (value) {
    return (
      <div className="rounded-md border border-voya-200 bg-voya-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-voya-900">{value.fullName}</p>
            {value.companyName ? (
              <p className="text-sm text-slate-600">{value.companyName}</p>
            ) : null}
            <p className="mt-1 text-sm text-slate-600 tabular-nums">{value.phone}</p>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
              <div>
                <dt className="inline text-slate-500">Passport: </dt>
                <dd className="inline">{value.passportNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Expires: </dt>
                <dd className="inline">{value.passportExpiry ?? '—'}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Nationality: </dt>
                <dd className="inline">{value.nationality ?? '—'}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Email: </dt>
                <dd className="inline">{value.email ?? '—'}</dd>
              </div>
            </dl>

            {value.membership ? (
              <p className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="gold">
                  {value.membership.membershipNumber} · {value.membership.tier}
                </Badge>
                {value.membership.active ? (
                  <span className="text-xs text-gold-700">
                    {value.membership.discountPercent}% member discount applies
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    Membership expired {value.membership.expiryDate} — no discount
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No membership on file.</p>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
            aria-label="Choose a different customer"
          >
            <X className="h-4 w-4" aria-hidden />
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="VY-0001042, name, phone or passport"
          className="pl-9"
          aria-label="Search for a customer"
          autoComplete="off"
        />
      </div>

      {isPending ? <p className="mt-2 text-xs text-slate-500">Searching…</p> : null}

      {visibleResults.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
          {visibleResults.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onChange(customer)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {customer.fullName}
                  </span>
                  <span className="block text-xs text-slate-500 tabular-nums">
                    {customer.phone}
                  </span>
                </span>
                {customer.membership ? (
                  <Badge tone={customer.membership.active ? 'gold' : 'neutral'}>
                    {customer.membership.membershipNumber}
                  </Badge>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showResults && searched && !isPending && visibleResults.length === 0 && !quickCreating ? (
        <div className="mt-2 text-sm text-slate-500">
          No customer matched.{' '}
          <button
            type="button"
            onClick={openQuickCreate}
            className="text-voya-700 underline"
          >
            Add them now
          </button>{' '}
          — the rest of their profile can be filled in later, or{' '}
          <Link href="/customers/new" className="text-voya-700 underline">
            open the full form
          </Link>
          .
        </div>
      ) : null}

      {quickCreating ? (
        <div className="mt-3 rounded-md border border-slate-200 p-3">
          <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
            New customer
          </p>
          {quickError ? <p className="mb-2 text-xs text-red-600">{quickError}</p> : null}
          <div className="space-y-2">
            <Input
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="Full name"
              autoFocus
            />
            <Input
              value={quickPhone}
              onChange={(e) => setQuickPhone(e.target.value)}
              placeholder="Phone, e.g. +973 3300 1122"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isCreating || !quickName.trim() || !quickPhone.trim()}
              onClick={submitQuickCreate}
            >
              {isCreating ? 'Creating…' : 'Create & continue'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setQuickCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
