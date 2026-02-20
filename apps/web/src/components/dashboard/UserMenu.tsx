'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type UserMenuProps = {
  displayName?: string | null;
  email?: string | null;
  onSignOut: () => Promise<void> | void;
};

const getInitials = (displayName?: string | null, email?: string | null) => {
  if (displayName && displayName.trim()) {
    const parts = displayName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (parts.length > 0) {
      return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
    }
  }

  if (email && email.trim()) {
    const prefix = email.split('@')[0] ?? '';
    const pieces = prefix.split(/[._-]+/).filter(Boolean);

    if (pieces.length >= 2) {
      return `${pieces[0][0] ?? ''}${pieces[1][0] ?? ''}`.toUpperCase();
    }

    return (prefix.slice(0, 2) || 'U').toUpperCase();
  }

  return 'U';
};

export const UserMenu = ({ displayName, email, onSignOut }: UserMenuProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = useMemo(() => getInitials(displayName, email), [displayName, email]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-cyan-500 to-emerald-500 text-xs font-bold tracking-wide text-white shadow-md shadow-cyan-200 transition-transform hover:scale-[1.03]"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Open profile menu"
      >
        {initials}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 min-w-[200px] rounded-lg border border-slate-200 bg-slate-50/95 p-2.5 shadow-[0_24px_50px_-25px_rgba(0,49,117,0.5)] backdrop-blur-sm">
          <div className="mb-2 border-b border-slate-200 pb-2">
            <p className="text-xs font-semibold text-slate-900">{displayName || 'User'}</p>
            <p className="truncate text-[11px] text-slate-500">{email || 'No email'}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await onSignOut();
            }}
            className="w-full rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
          >
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
};
