/**
 * Zoom Control Panel - Bottom center zoom controls
 */

'use client';

import { useCanvasStore } from '@/lib/store/canvas';
import { useCallback, useState } from 'react';
import ControlCameraIcon from '@mui/icons-material/ControlCamera';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';

interface ZoomControlProps {
  /** When provided, "Fit to screen" fits view to content (same as minimap). When omitted, resets to 100% at (0,0). */
  onFitToContent?: () => void;
  /** When provided, called after zoom out so the board can recenter on content (e.g. keep content in view). */
  onZoomOut?: (newScale: number) => void;
}

export const ZoomControl = ({ onFitToContent, onZoomOut }: ZoomControlProps) => {
  const { scale, setScale, resetView, minimapOpen, setMinimapOpen } = useCanvasStore();
  const [showCameraControls, setShowCameraControls] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);

  const handleZoomIn = useCallback(() => {
    setScale(Math.min(5, scale * 1.2));
  }, [scale, setScale]);

  const handleZoomOut = useCallback(() => {
    const newScale = Math.max(0.1, scale / 1.2);
    setScale(newScale);
    onZoomOut?.(newScale);
  }, [scale, setScale, onZoomOut]);

  const handleFitToScreen = useCallback(() => {
    if (onFitToContent) {
      onFitToContent();
    } else {
      resetView();
    }
  }, [onFitToContent, resetView]);

  const handleCameraControlsClick = useCallback(() => {
    setShowCameraControls(true);
  }, []);

  const handleCloseCameraControls = useCallback(() => {
    setShowCameraControls(false);
  }, []);

  const handleZoomTo10 = useCallback(() => {
    setScale(0.1);
    onZoomOut?.(0.1);
  }, [setScale, onZoomOut]);

  const handleMinimapToggle = useCallback(() => {
    setMinimapOpen(!minimapOpen);
  }, [minimapOpen, setMinimapOpen]);

  const tooltip = (label: string, children: React.ReactNode) => (
    <span className="relative inline-flex">
      {children}
      {hoveredTooltip === label && (
        <span className="pointer-events-none absolute left-1/2 bottom-full -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg z-50">
          {label}
        </span>
      )}
    </span>
  );

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-[10px] shadow-[0_-6px_20px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.1),0_12px_32px_rgba(0,0,0,0.08)] border border-gray-200 px-1.5 py-1">
          {/* Fit to Screen Button */}
          <button
            onClick={handleFitToScreen}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors relative"
            title="Fit to screen"
            onMouseEnter={() => setHoveredTooltip('Fit to screen')}
            onMouseLeave={() => setHoveredTooltip(null)}
          >
            {tooltip('Fit to screen', (
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" fill="none" />
                <line x1="6" y1="9" x2="18" y2="9" stroke="currentColor" />
                <line x1="6" y1="15" x2="18" y2="15" stroke="currentColor" />
              </svg>
            ))}
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-gray-300" />

          {/* Zoom Out Button */}
          <button
            onClick={handleZoomOut}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors relative"
            title="Zoom out"
            disabled={scale <= 0.1}
            onMouseEnter={() => setHoveredTooltip('Zoom out')}
            onMouseLeave={() => setHoveredTooltip(null)}
          >
            {tooltip('Zoom out', (
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            ))}
          </button>

          {/* Zoom Percentage Display */}
          <div
            className="relative inline-flex px-1.5 py-0 text-xs font-medium text-gray-900 min-w-[38px] text-center"
            title="Current zoom level"
            onMouseEnter={() => setHoveredTooltip('Current zoom')}
            onMouseLeave={() => setHoveredTooltip(null)}
          >
            {typeof scale === 'number' && !isNaN(scale) && isFinite(scale) ? Math.round(scale * 100) : 100}%
            {hoveredTooltip === 'Current zoom' && (
              <span className="pointer-events-none absolute left-1/2 bottom-full -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg z-50">
                Current zoom
              </span>
            )}
          </div>

          {/* Zoom In Button */}
          <button
            onClick={handleZoomIn}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors relative"
            title="Zoom in"
            disabled={scale >= 5}
            onMouseEnter={() => setHoveredTooltip('Zoom in')}
            onMouseLeave={() => setHoveredTooltip(null)}
          >
            {tooltip('Zoom in', (
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            ))}
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-gray-300" />

          {/* Mini map toggle - opens minimap to the right */}
          <button
            onClick={handleMinimapToggle}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors relative"
            title="Mini map"
            onMouseEnter={() => setHoveredTooltip('Mini map')}
            onMouseLeave={() => setHoveredTooltip(null)}
            aria-pressed={minimapOpen}
          >
            {tooltip('Mini map', <MapOutlinedIcon className="w-4 h-4 text-gray-700" sx={{ opacity: minimapOpen ? 1 : 0.5 }} />)}
          </button>

          {/* Control Camera Button */}
          <button
            onClick={handleCameraControlsClick}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors relative"
            title="Canvas controls"
            onMouseEnter={() => setHoveredTooltip('Canvas controls')}
            onMouseLeave={() => setHoveredTooltip(null)}
          >
            {tooltip('Canvas controls', <ControlCameraIcon className="w-4 h-4 text-gray-700" />)}
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-gray-300" />

          {/* Zoom to 10% Button */}
          <button
            onClick={handleZoomTo10}
            disabled={scale <= 0.1}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors relative"
            title="Zoom to 10%"
            onMouseEnter={() => setHoveredTooltip('Zoom to 10%')}
            onMouseLeave={() => setHoveredTooltip(null)}
          >
            {tooltip('Zoom to 10%', <CloseFullscreenIcon className="w-4 h-4 text-gray-700" />)}
          </button>
        </div>
      </div>

      {/* Canvas Controls Modal */}
      {showCameraControls && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4" onClick={handleCloseCameraControls}>
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <ControlCameraIcon className="w-4 h-4 text-gray-700" />
                  Canvas Controls
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">Learn how to navigate the canvas</p>
              </div>
              <button
                onClick={handleCloseCameraControls}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Instructions List */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 text-xs font-semibold">1</span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-900">Pinch to zoom in/out</h4>
                  <p className="mt-0.5 text-xs text-slate-600">Use two fingers on trackpad or touchscreen to zoom in and out</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-green-600 text-xs font-semibold">2</span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-900">Two finger swipe to move</h4>
                  <p className="mt-0.5 text-xs text-slate-600">Swipe with two fingers to pan and move the canvas</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                  <span className="text-purple-600 text-xs font-semibold">3</span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-900">Ctrl + drag to move</h4>
                  <p className="mt-0.5 text-xs text-slate-600">Hold Ctrl (or Cmd on Mac) and drag to pan the canvas</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                  <span className="text-orange-600 text-xs font-semibold">4</span>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-900">Click + drag to select</h4>
                  <p className="mt-0.5 text-xs text-slate-600">Click and drag on empty canvas to create a selection box</p>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleCloseCameraControls}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
