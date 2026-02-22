'use client';

import { type RefObject } from 'react';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

export type CollabInfo = {
  uid: string;
  name: string;
  color: string;
  isOnline: boolean;
};

export type BoardRow = {
  id: string;
  title: string;
  ownerName: string;
  ownerUid: string;
  collaborators: CollabInfo[];
  createdAt: number;
  lastModified: number;
  sharedWithMe: boolean;
  thumbnail?: string;
  isLocked: boolean;
};

const MAX_AVATARS = 3;

type BoardCardProps = {
  board: BoardRow;
  user: { uid: string } | null;
  openCollaboratorsDropdown: string | null;
  setOpenCollaboratorsDropdown: (id: string | null) => void;
  collaboratorsDropdownRefs: RefObject<Record<string, HTMLDivElement | null>>;
  dropdownPosition: { top: number; left: number } | null;
  onOpenBoard: (boardId: string, isLocked: boolean, ownerUid: string) => void;
  onShare: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  timeAgo: (timestamp: number) => string;
};

export function BoardCard({
  board,
  user,
  openCollaboratorsDropdown,
  setOpenCollaboratorsDropdown,
  collaboratorsDropdownRefs,
  dropdownPosition,
  onOpenBoard,
  onShare,
  onToggleLock,
  onDelete,
  timeAgo,
}: BoardCardProps) {
  const visibleCollabs = board.collaborators.slice(0, MAX_AVATARS);
  const overflow = board.collaborators.length - MAX_AVATARS;
  const isOwner = board.ownerUid === user?.uid;

  return (
    <div
      className={`group relative overflow-hidden flex flex-col gap-2 rounded-xl border p-4 shadow-[0_4px_14px_0_rgba(0,0,0,0.08),0_2px_6px_0_rgba(0,0,0,0.04)] transition hover:shadow-[0_12px_28px_-4px_rgba(0,0,0,0.12),0_6px_12px_-2px_rgba(0,0,0,0.06)] min-w-0 aspect-[3/2] ${
        board.isLocked ? 'border-red-300 bg-slate-200/70' : 'border-slate-200/70 bg-white/90'
      }`}
    >
      <div className="relative z-10 flex flex-1 flex-col justify-between gap-3 min-w-0 min-h-0">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={() => onOpenBoard(board.id, board.isLocked, board.ownerUid)}
              className="text-left min-w-0 flex-1"
            >
              <p className="text-lg font-semibold text-slate-900 line-clamp-2 leading-snug" title={board.title}>
                {board.title}
              </p>
            </button>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 shrink-0">
              {timeAgo(board.lastModified)}
            </span>
          </div>
          <p className="text-sm text-slate-500 truncate" title={board.ownerName}>
            Owned by {board.ownerName}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="relative"
              ref={(el) => {
                if (collaboratorsDropdownRefs.current) collaboratorsDropdownRefs.current[board.id] = el;
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenCollaboratorsDropdown(openCollaboratorsDropdown === board.id ? null : board.id);
                }}
                className="flex items-center gap-2 transition hover:opacity-80"
              >
                <div className="flex -space-x-1">
                  {visibleCollabs.map((c: CollabInfo, i: number) => (
                    <div
                      key={c.uid}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-white text-[10px] font-semibold text-white shadow-sm"
                      style={{
                        backgroundColor: c.color,
                        zIndex: MAX_AVATARS - i,
                      }}
                      title={c.name}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-gray-200 text-[9px] font-semibold text-gray-600"
                      style={{ zIndex: 0 }}
                    >
                      +{overflow}
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-500 truncate">
                  {board.collaborators.length} collab
                </span>
              </button>
            </div>

            {openCollaboratorsDropdown === board.id && dropdownPosition && (
              <div
                data-collaborators-dropdown
                className="fixed z-[100] w-[200px] rounded-lg border border-gray-200 bg-white shadow-xl text-sm"
                style={{
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                }}
              >
                <div className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Collaborators — {board.collaborators.length}
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {board.collaborators.map((c: CollabInfo) => (
                    <div
                      key={c.uid}
                      className="flex items-center gap-2 px-2 py-1.5 transition hover:bg-gray-50"
                    >
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0"
                        style={{ backgroundColor: c.color }}
                      >
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-slate-700 truncate">{c.name}</span>
                        {c.isOnline && (
                          <span className="text-[10px] text-emerald-500">Online</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isOwner ? (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShare();
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                  aria-label="Share board"
                  title="Share (secret key)"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLock();
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                  aria-label={board.isLocked ? 'Visibility off' : 'Visibility on'}
                  title={board.isLocked ? 'Visibility off' : 'Visibility on'}
                >
                  {board.isLocked ? (
                    <VisibilityOff className="h-3.5 w-3.5" />
                  ) : (
                    <Visibility className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-white text-red-500 transition hover:border-red-300 hover:text-red-600"
                  aria-label={`Delete ${board.title}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </>
            ) : (
              <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600">
                Collab
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
