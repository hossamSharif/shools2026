'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from '../../lib/actions/profile.js';

/**
 * Header account menu: the signed-in user's name toggles a small dropdown with a
 * link to their profile and a sign-out action. RTL — the panel opens to the
 * start (left in RTL). `@erp/ui` has no dropdown primitive, so this is a small
 * self-contained toggle with a click-away backdrop.
 */
export function AccountMenu({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{displayName}</span>
        <span aria-hidden className="text-xs text-gray-400">
          ▾
        </span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute end-0 z-20 mt-1 w-48 rounded-md border bg-white py-1 shadow-lg"
          >
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              الملف الشخصي
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="block w-full px-4 py-2 text-start text-sm text-red-600 hover:bg-gray-100"
              >
                تسجيل الخروج
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
