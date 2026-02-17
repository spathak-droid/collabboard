/**
 * Toolbar Component for canvas tools - Left sidebar layout
 */

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useCanvasStore } from '@/lib/store/canvas';
import stickyNotesIcon from '@/assets/stickyNotes.svg';
import rectangleIcon from '@/assets/rectangle.svg';
import circleIcon from '@/assets/circle.svg';
import lineIcon from '@/assets/line.svg';
import textBubbleIcon from '@/assets/textBubble.svg';

interface ToolbarProps {
  onDelete?: () => void;
  onDuplicate?: () => void;
  selectedCount?: number;
}

export const Toolbar = ({ onDelete, onDuplicate, selectedCount = 0 }: ToolbarProps) => {
  const { activeTool, setActiveTool, scale, gridMode, setGridMode, snapToGrid, setSnapToGrid } = useCanvasStore();
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

  const drawingTools = [
    {
      id: 'sticky' as const,
      label: 'Sticky Note',
      icon: (
        <Image
          src={stickyNotesIcon}
          alt=""
          aria-hidden="true"
          className="h-7 w-7 object-contain"
        />
      ),
    },
    {
      id: 'rect' as const,
      label: 'Rectangle',
      icon: (
        <Image src={rectangleIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
      ),
    },
    {
      id: 'circle' as const,
      label: 'Circle',
      icon: (
        <Image src={circleIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
      ),
    },
    {
      id: 'line' as const,
      label: 'Line',
      icon: (
        <Image src={lineIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
      ),
    },
    {
      id: 'textBubble' as const,
      label: 'Text Bubble',
      icon: (
        <Image src={textBubbleIcon} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
      ),
    },
  ];

  const renderToolButton = (
    id: (typeof drawingTools)[number]['id'],
    label: string,
    icon: ReactNode
  ) => (
    <button
      key={id}
      data-tool={id}
      onClick={() => setActiveTool(id)}
      onMouseEnter={() => setHoveredTooltip(label)}
      onMouseLeave={() => setHoveredTooltip(null)}
      aria-pressed={activeTool === id}
      className={`relative mb-1 flex h-11 w-10 items-center justify-center rounded-lg border transition-all ${
        activeTool === id
          ? 'border-slate-500 bg-slate-700 text-slate-50 shadow-sm'
          : 'border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100'
      }`}
      title={label}
    >
      {icon}
      {hoveredTooltip === label ? (
        <div className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-100 shadow-lg">
          {label}
        </div>
      ) : null}
    </button>
  );

  const renderSwitch = (isOn: boolean) => (
    <span
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        isOn ? 'bg-sky-500/90' : 'bg-slate-700'
      }`}
      aria-hidden="true"
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isOn ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </span>
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!viewMenuRef.current) return;
      if (!viewMenuRef.current.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);
  
  return (
    <div className="fixed left-5 top-1/2 z-30 -translate-y-1/2">
      <div ref={viewMenuRef} className="relative flex w-[56px] flex-col items-center rounded-[20px] border border-slate-800 bg-[#0F172A] p-2 shadow-[0_24px_50px_-30px_rgba(2,6,23,0.95)]">
        <button
          onClick={() => setIsViewMenuOpen((prev) => !prev)}
          onMouseEnter={() => setHoveredTooltip('View options')}
          onMouseLeave={() => setHoveredTooltip(null)}
          aria-expanded={isViewMenuOpen}
          aria-label="View options"
          className={`relative mb-1 flex h-11 w-10 items-center justify-center rounded-lg border transition-all ${
            isViewMenuOpen
              ? 'border-slate-500 bg-slate-700 text-slate-50 shadow-sm'
              : 'border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100'
          }`}
          title="View options"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6h.01M12 12h.01M12 18h.01" />
          </svg>
          {hoveredTooltip === 'View options' ? (
            <div className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-100 shadow-lg">
              View options
            </div>
          ) : null}
        </button>

        {isViewMenuOpen ? (
          <div className="absolute left-full top-2 ml-4 w-64 rounded-2xl border border-slate-700 bg-[#111827] p-3 shadow-2xl">
            <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">View</div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-2">
              <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Grid</div>
              <button
                onClick={() => setGridMode('none')}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors ${
                  gridMode === 'none' ? 'bg-slate-700/80 text-slate-100' : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <span>None</span>
                <span className={`h-4 w-4 rounded-full border-2 ${gridMode === 'none' ? 'border-sky-400' : 'border-slate-500'}`} />
              </button>
              <button
                onClick={() => setGridMode('line')}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors ${
                  gridMode === 'line' ? 'bg-slate-700/80 text-slate-100' : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <span>Line grid</span>
                <span className={`h-4 w-4 rounded-full border-2 ${gridMode === 'line' ? 'border-sky-400' : 'border-slate-500'}`} />
              </button>
              <button
                onClick={() => setGridMode('dot')}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors ${
                  gridMode === 'dot' ? 'bg-slate-700/80 text-slate-100' : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <span>Dot grid</span>
                <span className={`h-4 w-4 rounded-full border-2 ${gridMode === 'dot' ? 'border-sky-400' : 'border-slate-500'}`} />
              </button>
            </div>

            <div className="my-2 h-px bg-slate-700/80" />

            <button
              onClick={() => setSnapToGrid(!snapToGrid)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
            >
              <span>Snap to grid</span>
              {renderSwitch(snapToGrid)}
            </button>
          </div>
        ) : null}

        <div className="my-1 h-px w-8 bg-slate-700/80" />

        <div className="mb-1 flex w-full flex-col items-center">
          {drawingTools.map((tool) => renderToolButton(tool.id, tool.label, tool.icon))}
        </div>

        {selectedCount > 0 && (onDuplicate || onDelete) ? (
          <>
            <div className="my-1 h-px w-8 bg-slate-700/80" />
            {onDuplicate ? (
              <button
                onClick={onDuplicate}
                onMouseEnter={() => setHoveredTooltip('Duplicate (Cmd+D)')}
                onMouseLeave={() => setHoveredTooltip(null)}
                className="relative mb-1 flex h-11 w-10 items-center justify-center rounded-lg border border-transparent text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100"
                title="Duplicate (Cmd+D)"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="9" y="9" width="10" height="10" rx="2" strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 15H6a2 2 0 01-2-2V6a2 2 0 012-2h7a2 2 0 012 2v1" />
                </svg>
                {hoveredTooltip === 'Duplicate (Cmd+D)' ? (
                  <div className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-100 shadow-lg">
                    Duplicate (Cmd+D)
                  </div>
                ) : null}
              </button>
            ) : null}

            {onDelete ? (
              <button
                onClick={onDelete}
                onMouseEnter={() => setHoveredTooltip('Delete (Del)')}
                onMouseLeave={() => setHoveredTooltip(null)}
                className="relative mb-1 flex h-11 w-10 items-center justify-center rounded-lg border border-transparent text-rose-300 transition-all hover:border-rose-400/30 hover:bg-rose-500/20 hover:text-rose-200"
                title="Delete (Del)"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M10 11v6m4-6v6M9 7l1-2h4l1 2m-8 0l1 12h8l1-12" />
                </svg>
                {hoveredTooltip === 'Delete (Del)' ? (
                  <div className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-100 shadow-lg">
                    Delete (Del)
                  </div>
                ) : null}
              </button>
            ) : null}
          </>
        ) : null}

        <div className="mt-2 w-full rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-center text-[10px] font-semibold tracking-wide text-slate-300">
          {Math.round(scale * 100)}%
        </div>
      </div>
    </div>
  );
};
