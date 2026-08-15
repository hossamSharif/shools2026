'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input, Select, cn } from '@erp/ui';

/**
 * Shared URL-driven filter rail (students/payments/expenses design pass).
 *
 * Generalises the approach already proven in
 * `components/reports/receivables-filters.tsx`: all filter state lives in the
 * query string, so the server component above re-renders with fresh data and
 * the view is shareable/bookmarkable. Two deliberate differences from that
 * older component:
 *   - the search box is debounced (~350 ms) so typing doesn't fire a request
 *     per keystroke, and
 *   - navigation uses `router.replace`, so a search doesn't push one history
 *     entry per character.
 */

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelect {
  kind: 'select';
  key: string;
  placeholder: string;
  options: FilterOption[];
  /** Hide entirely when the parent filter has no value (cascading selects). */
  hiddenWhenEmpty?: boolean;
}

export interface FilterToggle {
  kind: 'toggle';
  key: string;
  label: string;
}

/** A single date bound; pair two of them for a range (from/to). */
export interface FilterDate {
  kind: 'date';
  key: string;
  label: string;
}

export type FilterControl = FilterSelect | FilterToggle | FilterDate;

export interface FilterBarProps {
  /** Current values, keyed the same as the controls (from the server's searchParams). */
  values: Record<string, string | undefined>;
  controls: FilterControl[];
  search?: { key: string; placeholder: string };
  /** Keys reset alongside a control when it changes (e.g. grade → section). */
  resets?: Record<string, string[]>;
}

export function FilterBar({ values, controls, search, resets }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const searchKey = search?.key ?? 'q';
  const [term, setTerm] = useState(values[searchKey] ?? '');
  // Only the *user's* typing should drive a navigation; syncing from props
  // (back button, filter change) must not re-fire the debounce.
  const typingRef = useRef(false);

  const push = useCallback(
    (next: Record<string, string | undefined>) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) {
        if (v !== undefined && v !== '') params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router],
  );

  // Debounced search.
  useEffect(() => {
    if (!typingRef.current) return;
    const id = setTimeout(() => {
      typingRef.current = false;
      push({ ...values, [searchKey]: term });
    }, 350);
    return () => clearTimeout(id);
  }, [term, values, searchKey, push]);

  // Keep the input in sync when the URL changes from elsewhere (reset, back).
  useEffect(() => {
    if (!typingRef.current) setTerm(values[searchKey] ?? '');
  }, [values, searchKey]);

  function setValue(key: string, value: string) {
    const next: Record<string, string | undefined> = { ...values, [key]: value };
    for (const cleared of resets?.[key] ?? []) next[cleared] = undefined;
    push(next);
  }

  const hasAny =
    Object.entries(values).some(([, v]) => v !== undefined && v !== '') || term !== '';

  return (
    <div dir="rtl" className="flex flex-wrap items-center gap-3" data-testid="filter-bar">
      {search ? (
        <div className="relative min-w-[16rem] flex-1 sm:max-w-sm sm:flex-none">
          <Search
            className="pointer-events-none absolute inset-y-0 end-3 my-auto h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={term}
            onChange={(e) => {
              typingRef.current = true;
              setTerm(e.target.value);
            }}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            data-testid="filter-search"
            className="pe-9"
          />
        </div>
      ) : null}

      {controls.map((c) => {
        if (c.kind === 'toggle') {
          const on = values[c.key] === '1';
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setValue(c.key, on ? '' : '1')}
              aria-pressed={on}
              data-testid={`filter-${c.key}`}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                on
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-muted-foreground hover:bg-muted',
              )}
            >
              {c.label}
            </button>
          );
        }
        if (c.kind === 'date') {
          return (
            <Input
              key={c.key}
              type="date"
              value={values[c.key] ?? ''}
              onChange={(e) => setValue(c.key, e.target.value)}
              aria-label={c.label}
              title={c.label}
              data-testid={`filter-${c.key}`}
              className="w-auto"
            />
          );
        }
        if (c.hiddenWhenEmpty && c.options.length === 0) return null;
        return (
          <Select
            key={c.key}
            value={values[c.key] ?? ''}
            onChange={(e) => setValue(c.key, e.target.value)}
            aria-label={c.placeholder}
            data-testid={`filter-${c.key}`}
            className="max-w-[12rem]"
          >
            <option value="">{c.placeholder}</option>
            {c.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        );
      })}

      {hasAny ? (
        <button
          type="button"
          onClick={() => {
            typingRef.current = false;
            setTerm('');
            push({});
          }}
          data-testid="filter-reset"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-danger"
        >
          <X className="h-4 w-4" aria-hidden />
          مسح الفلاتر
        </button>
      ) : null}
    </div>
  );
}
