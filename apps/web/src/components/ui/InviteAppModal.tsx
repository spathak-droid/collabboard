/**
 * InviteAppModal — invite someone to join Collabry via email.
 * Simple modal: email input + send button. No board context needed.
 */

'use client';

import { useState, useCallback } from 'react';

interface InviteAppModalProps {
  open: boolean;
  inviterName: string;
  onClose: () => void;
}

interface SentInvite {
  email: string;
  status: 'sending' | 'sent' | 'error';
  error?: string;
}

export const InviteAppModal = ({ open, inviterName, onClose }: InviteAppModalProps) => {
  const [email, setEmail] = useState('');
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [emailTouched, setEmailTouched] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isEmailInvalid = emailTouched && email.length > 0 && !isValidEmail;

  const handleSend = useCallback(async () => {
    if (!isValidEmail) return;

    const targetEmail = email.toLowerCase().trim();

    if (sentInvites.some((s) => s.email === targetEmail && s.status === 'sent')) return;

    setSentInvites((prev) => [
      ...prev.filter((s) => s.email !== targetEmail),
      { email: targetEmail, status: 'sending' },
    ]);
    setEmail('');
    setEmailTouched(false);

    try {
      const res = await fetch('/api/invite-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, inviterName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send email');
      }

      setSentInvites((prev) =>
        prev.map((s) => (s.email === targetEmail ? { ...s, status: 'sent' as const } : s))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send invite';
      setSentInvites((prev) =>
        prev.map((s) => (s.email === targetEmail ? { ...s, status: 'error' as const, error: message } : s))
      );
    }
  }, [email, isValidEmail, inviterName, sentInvites]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = () => {
    setEmail('');
    setEmailTouched(false);
    setSentInvites([]);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Invite Members</h3>
            <p className="mt-1 text-sm text-slate-500">Send an email inviting someone to join Collabry.</p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Email input + send */}
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              onKeyDown={handleKeyDown}
              placeholder="colleague@example.com"
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-all ${
                isEmailInvalid
                  ? 'border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100'
                  : 'border-slate-200 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100'
              }`}
            />
            {isEmailInvalid && (
              <p className="mt-1 text-xs text-rose-500">Please enter a valid email address</p>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!isValidEmail}
            className="rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-cyan-200 transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Send
          </button>
        </div>

        {/* Sent list */}
        {sentInvites.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invitations</p>
            {sentInvites.map((invite) => (
              <div
                key={invite.email}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <span className="text-sm text-slate-700">{invite.email}</span>
                {invite.status === 'sending' && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                    Sending...
                  </span>
                )}
                {invite.status === 'sent' && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Sent
                  </span>
                )}
                {invite.status === 'error' && (
                  <span className="max-w-[200px] text-right text-xs text-rose-500">{invite.error || 'Failed'}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={handleClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
