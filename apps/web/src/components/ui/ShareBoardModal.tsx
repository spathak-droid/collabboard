/**
 * ShareBoardModal — show and copy secret share key for a board (owner only)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { generateOrGetShareKey } from '@/lib/supabase/client';

interface ShareBoardModalProps {
  open: boolean;
  boardId: string;
  boardTitle: string;
  ownerUid: string;
  onClose: () => void;
}

export const ShareBoardModal = ({
  open,
  boardId,
  boardTitle,
  ownerUid,
  onClose,
}: ShareBoardModalProps) => {
  const [shareKey, setShareKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKey = useCallback(async () => {
    if (!open || !boardId || !ownerUid) return;
    setLoading(true);
    setError(null);
    try {
      const key = await generateOrGetShareKey(boardId, ownerUid);
      setShareKey(key ?? null);
      if (!key) setError('Only the board owner can share this board.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get share key');
    } finally {
      setLoading(false);
    }
  }, [open, boardId, ownerUid]);

  useEffect(() => {
    if (open) loadKey();
    else {
      setShareKey(null);
      setError(null);
      setCopied(false);
    }
  }, [open, loadKey]);

  const handleCopy = useCallback(async () => {
    if (!shareKey) return;
    try {
      await navigator.clipboard.writeText(shareKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  }, [shareKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Share &ldquo;{boardTitle}&rdquo;</h3>
            <p className="mt-1 text-sm text-slate-500">
              Anyone with this secret key can join the board. Share it only with people you trust.
            </p>
          </div>
          <button
            onClick={onClose}
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

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-500" />
            Generating share key...
          </div>
        ) : shareKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm tracking-wide text-slate-800">
                {shareKey}
              </code>
              <button
                onClick={handleCopy}
                className="rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.02]"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Others can join from the dashboard by clicking &ldquo;Join with key&rdquo; and entering this key.
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
