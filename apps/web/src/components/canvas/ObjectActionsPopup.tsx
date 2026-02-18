import React from 'react';

interface ObjectActionsPopupProps {
  x: number;
  y: number;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
}

export const ObjectActionsPopup = ({ x, y, onDelete, onDuplicate, onCopy }: ObjectActionsPopupProps) => {
  return (
    <div
      className="fixed z-50 rounded-xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-sm"
      style={{ left: x, top: y, transform: 'translate(-50%, -100%)' }}
      role="toolbar"
      aria-label="Object actions"
    >
      <div className="flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Copy
        </button>
      </div>
    </div>
  );
};
