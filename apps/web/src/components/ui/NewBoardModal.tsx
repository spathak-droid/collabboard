'use client';

import { useState, useRef, useEffect } from 'react';

interface NewBoardModalProps {
  open: boolean;
  loading: boolean;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export const NewBoardModal = ({
  open,
  loading,
  onConfirm,
  onClose,
}: NewBoardModalProps) => {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(name.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]"
      >
        <h3 className="text-lg font-semibold text-slate-900">Create New Board</h3>
        <p className="mt-1 text-sm text-slate-500">
          Give your board a name, or leave blank for a default title.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sprint Planning, Brainstorm..."
          maxLength={100}
          className="mt-4 w-full rounded-xl border border-slate-300 bg-transparent px-4 py-2.5 text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-500"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-200/50 transition-opacity disabled:opacity-60"
          >
            {loading ? 'Creating...' : 'Create Board'}
          </button>
        </div>
      </form>
    </div>
  );
};
