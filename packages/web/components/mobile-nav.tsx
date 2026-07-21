'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button, Sheet, SheetTrigger, SheetContent, SheetTitle, SheetClose } from '@erp/ui';
import { NavLinks, type NavLinkItem } from './nav-links.js';

/** Hamburger + slide-in drawer for the nav, shown only below md. */
export function MobileNav({
  items,
  menuLabel,
  closeLabel,
}: {
  items: NavLinkItem[];
  menuLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="md:hidden" aria-label={menuLabel}>
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <div className="mb-4 flex items-center justify-between">
          <SheetTitle>{menuLabel}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="sm" aria-label={closeLabel}>
              <X className="h-5 w-5" />
            </Button>
          </SheetClose>
        </div>
        <NavLinks items={items} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
