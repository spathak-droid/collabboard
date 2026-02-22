/**
 * Zoom Control Panel - Bottom center zoom controls
 */

'use client';

import { useCanvasStore } from '@/lib/store/canvas';
import { useCallback, useState } from 'react';
import ControlCameraIcon from '@mui/icons-material/ControlCamera';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';

export const ZoomControl = () => {
  const { scale, setScale, resetView } = useCanvasStore();
  const [showCameraControls, setShowCameraControls] = useState(false);

  const handleZoomIn = useCallback(() => {
    setScale(Math.min(5, scale * 1.2));
  }, [scale, setScale]);

  const handleZoomOut = useCallback(() => {
    setScale(Math.max(0.1, scale / 1.2));
  }, [scale, setScale]);

  const handleFitToScreen = useCallback(() => {
    resetView();
  }, [resetView]);

  const handleCameraControlsClick = useCallback(() => {
    setShowCameraControls(true);
  }, []);

  const handleCloseCameraControls = useCallback(() => {
    setShowCameraControls(false);
  }, []);

  const handleZoomTo10 = useCallback(() => {
    setScale(0.1);
  }, [setScale]);

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-[12px] shadow-[0_-6px_20px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.1),0_12px_32px_rgba(0,0,0,0.08)] border border-gray-200 px-2 py-1.5">
          {/* Fit to Screen Button */}
          <button
            onClick={handleFitToScreen}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="Fit to screen"
          >
            <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" fill="none" />
              <line x1="6" y1="9" x2="18" y2="9" stroke="currentColor" />
              <line x1="6" y1="15" x2="18" y2="15" stroke="currentColor" />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-300" />

          {/* Zoom Out Button */}
          <button
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="Zoom out"
            disabled={scale <= 0.1}
          >
            <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>

          {/* Zoom Percentage Display */}
          <div className="px-2 py-0.5 text-xs font-medium text-gray-900 min-w-[42px] text-center">
            {typeof scale === 'number' && !isNaN(scale) && isFinite(scale) ? Math.round(scale * 100) : 100}%
          </div>

          {/* Zoom In Button */}
          <button
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="Zoom in"
            disabled={scale >= 5}
          >
            <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-gray-300" />

          {/* Control Camera Button */}
          <button
            onClick={handleCameraControlsClick}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="Canvas controls"
          >
            <ControlCameraIcon className="w-4 h-4 text-gray-700" />
          </button>


          {/* Divider */}
          <div className="w-px h-5 bg-gray-300" />

          {/* Zoom to 10% Button */}
          <button
            onClick={handleZoomTo10}
            disabled={scale <= 0.1}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="Zoom to 10%"
          >
            <CloseFullscreenIcon className="w-4 h-4 text-gray-700" />
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
