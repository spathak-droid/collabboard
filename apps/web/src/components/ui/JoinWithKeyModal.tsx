/**
 * JoinWithKeyModal — join a board by entering a secret share key
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { joinBoardWithKey } from '@/lib/supabase/client';

interface JoinWithKeyModalProps {
  open: boolean;
  onClose: () => void;
  onJoined?: (boardId: string) => void;
  userUid: string;
}

export const JoinWithKeyModal = ({
  open,
  onClose,
  onJoined,
  userUid,
}: JoinWithKeyModalProps) => {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = key.trim();
    if (!trimmed || !userUid) return;
    setLoading(true);
    setError(null);
    try {
      const result = await joinBoardWithKey(trimmed, userUid);
      if (result) {
        onJoined?.(result.boardId);
        onClose();
        setKey('');
        router.push(`/board/${result.boardId}`);
      } else {
        setError('Invalid or expired key. Check the key and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join board');
    } finally {
      setLoading(false);
    }
  }, [key, userUid, onClose, onJoined, router]);

  const handleClose = useCallback(() => {
    setKey('');
    setError(null);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Join with key</h3>
            <p className="mt-1 text-sm text-slate-500">
              Enter the secret key shared by the board owner to join the board.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Paste secret key"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            onClick={handleSubmit}
            disabled={!key.trim() || loading}
            className="rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Joining...' : 'Join'}
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
