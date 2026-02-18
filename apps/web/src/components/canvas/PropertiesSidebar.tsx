/**
 * Properties Sidebar - Right side panel for object properties
 * Shows when objects are selected
 */

'use client';

import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import type { WhiteboardObject } from '@/types/canvas';

interface PropertiesSidebarProps {
  selectedObjects: WhiteboardObject[];
  onStrokeColorChange: (color: string) => void;
  onFillColorChange: (color: string) => void;
  onStickyColorChange: (color: string) => void;
  onTextChange: (text: string) => void;
  onTextSizeChange: (size: number) => void;
  onTextFamilyChange: (family: 'Inter' | 'Poppins' | 'Merriweather') => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onCopy?: () => void;
  onMove?: (dx: number, dy: number) => void;
  isSelectionArea?: boolean;
}

export const PropertiesSidebar = ({ 
  selectedObjects, 
  onStrokeColorChange,
  onFillColorChange,
  onStickyColorChange,
  onTextChange,
  onTextSizeChange,
  onTextFamilyChange,
  onDelete,
  onDuplicate,
  onCopy,
  onMove,
  isSelectionArea = false
}: PropertiesSidebarProps) => {
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showStickyPicker, setShowStickyPicker] = useState(false);
  
  if (selectedObjects.length === 0) return null;
  
  // Get current colors from first selected shape
  const currentStroke = selectedObjects.find(obj => obj.type !== 'sticky' && obj.type !== 'textBubble')?.stroke || '#000000';
  const currentFill = (
    selectedObjects.find(obj => obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'frame') as { fill?: string } | undefined
  )?.fill || '#FFFFFF';
  const hasShapes = selectedObjects.some(obj => obj.type !== 'sticky' && obj.type !== 'textBubble');
  const hasSticky = selectedObjects.some(obj => obj.type === 'sticky');
  const currentStickyColor = selectedObjects.find(obj => obj.type === 'sticky')?.color || '#FFF59D';
  const hasTextSupport = selectedObjects.some(
    obj => obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'sticky' || obj.type === 'textBubble'
  );
  const firstSelected = selectedObjects[0];
  const currentText =
    firstSelected && 'text' in firstSelected && typeof firstSelected.text === 'string'
      ? firstSelected.text
      : '';
  const currentTextSize =
    firstSelected && 'textSize' in firstSelected && typeof firstSelected.textSize === 'number'
      ? firstSelected.textSize
      : 16;
  const currentTextFamily =
    firstSelected && 'textFamily' in firstSelected && typeof firstSelected.textFamily === 'string'
      ? firstSelected.textFamily
      : 'Inter';
  
  const presetColors = [
    '#000000', '#6B7280', '#EF4444', '#F97316',
    '#EAB308', '#10B981', '#3B82F6', '#6366F1',
    '#A855F7', '#EC4899', '#FFFFFF', '#94A3B8'
  ];
  
  const stickyColors = ['#FFF59D', '#F48FB1', '#81D4FA', '#A5D6A7', '#FFCC80'];
  
  return (
    <>
    <div className="fixed right-5 top-1/2 -translate-y-1/2 w-64 max-h-[80vh] bg-white rounded-[16px] shadow-[0_2px_12px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.06)] z-40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">
          {isSelectionArea 
            ? `Selection Area (${selectedObjects.length} objects)`
            : selectedObjects.length === 1 
              ? `${selectedObjects[0].type.charAt(0).toUpperCase() + selectedObjects[0].type.slice(1)} Properties`
              : `${selectedObjects.length} Objects Selected`
          }
        </h3>
      </div>
      
      {/* Properties */}
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* For selection area, show info message */}
        {isSelectionArea ? (
          <div className="text-sm text-slate-600 text-center py-8">
            <p className="mb-2">Drag the selection area to move all selected objects.</p>
            <p className="text-xs text-slate-500">Use Copy, Duplicate, or Delete buttons below.</p>
          </div>
        ) : (
          <>
        {/* Stroke Color Section */}
        {hasShapes && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Stroke Color
            </label>
            
            <button
              onClick={() => {
                setShowStrokePicker(!showStrokePicker);
                setShowFillPicker(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded border-2 border-slate-300"
                  style={{ backgroundColor: currentStroke }}
                />
                <span className="text-sm font-mono text-slate-700">
                  {currentStroke.toUpperCase()}
                </span>
              </div>
              <svg 
                className={`w-4 h-4 text-slate-500 transition-transform ${showStrokePicker ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showStrokePicker && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="w-full overflow-visible rounded-xl border border-slate-200">
                  <HexColorPicker
                    color={currentStroke}
                    onChange={onStrokeColorChange}
                    style={{ paddingBottom: '18px' }}
                  />
                </div>
                <input
                  type="text"
                  value={currentStroke.toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-F]{0,6}$/i.test(val)) {
                      onStrokeColorChange(val);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="#000000"
                />
                <div className="grid grid-cols-6 gap-1.5">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => onStrokeColorChange(color)}
                      className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                        currentStroke.toUpperCase() === color.toUpperCase()
                          ? 'border-slate-900 ring-2 ring-slate-300'
                          : 'border-slate-200'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sticky Note Color Section */}
        {hasSticky && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Note Color
            </label>

            <button
              onClick={() => {
                setShowStickyPicker(!showStickyPicker);
                setShowFillPicker(false);
                setShowStrokePicker(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded border-2 border-slate-300"
                  style={{ backgroundColor: currentStickyColor }}
                />
                <span className="text-sm font-mono text-slate-700">
                  {currentStickyColor.toUpperCase()}
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-slate-500 transition-transform ${showStickyPicker ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showStickyPicker && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="w-full overflow-visible rounded-xl border border-slate-200">
                  <HexColorPicker
                    color={currentStickyColor}
                    onChange={onStickyColorChange}
                    className="hex-color-picker" style={{ paddingBottom: '16px' }}
                  />
                </div>
                <input
                  type="text"
                  value={currentStickyColor.toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-F]{0,6}$/i.test(val)) {
                      onStickyColorChange(val);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="#FFF59D"
                />
                <div className="grid grid-cols-5 gap-1.5">
                  {[...stickyColors, ...presetColors.slice(0, 7)].map((color) => (
                    <button
                      key={`sticky-${color}`}
                      onClick={() => onStickyColorChange(color)}
                      className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                        currentStickyColor.toUpperCase() === color.toUpperCase()
                          ? 'border-slate-900 ring-2 ring-slate-300'
                          : 'border-slate-200'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Fill Color Section */}
        {hasShapes && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Fill Color
            </label>
            
            <button
              onClick={() => {
                setShowFillPicker(!showFillPicker);
                setShowStrokePicker(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded border-2 border-slate-300"
                  style={{ backgroundColor: currentFill }}
                />
                <span className="text-sm font-mono text-slate-700">
                  {currentFill.toUpperCase()}
                </span>
              </div>
              <svg 
                className={`w-4 h-4 text-slate-500 transition-transform ${showFillPicker ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showFillPicker && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="w-full overflow-visible rounded-xl border border-slate-200">
                  <HexColorPicker
                    color={currentFill}
                    onChange={onFillColorChange}
                    style={{ paddingBottom: '16px' }}
                  />
                </div>
                <input
                  type="text"
                  value={currentFill.toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-F]{0,6}$/i.test(val)) {
                      onFillColorChange(val);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="#FFFFFF"
                />
                <div className="grid grid-cols-6 gap-1.5">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => onFillColorChange(color)}
                      className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                        currentFill.toUpperCase() === color.toUpperCase()
                          ? 'border-slate-900 ring-2 ring-slate-300'
                          : 'border-slate-200'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Text Section - For rectangles, circles, and sticky notes */}
        {hasTextSupport && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Text
            </label>
            
            <textarea
              value={currentText}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Enter text..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              rows={3}
            />

            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Font Size
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={12}
                  max={48}
                  step={1}
                  value={Math.max(12, Math.min(48, currentTextSize))}
                  onChange={(e) => onTextSizeChange(Number(e.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={12}
                  max={48}
                  value={Math.round(Math.max(12, Math.min(48, currentTextSize)))}
                  onChange={(e) => onTextSizeChange(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Font Style
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {(['Inter', 'Poppins', 'Merriweather'] as const).map((font) => (
                  <button
                    key={font}
                    onClick={() => onTextFamilyChange(font)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium text-center transition-colors ${
                      currentTextFamily === font
                        ? 'border-slate-900 bg-slate-100 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {font}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>
      
      {/* Actions Footer */}
      <div className="p-4 border-t border-slate-200 space-y-2">
        {/* Copy Button */}
        {onCopy && (
          <button
            onClick={onCopy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          </button>
        )}
        
        {/* Duplicate Button */}
        {onDuplicate && (
          <button
            onClick={onDuplicate}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Duplicate
          </button>
        )}
        
        {/* Delete Button */}
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>
    </div>
    <style jsx>{`
      :global(.hex-color-picker) {
        width: 100%;
        min-height: 240px;
      }
      :global(.hex-color-picker .react-colorful__saturation) {
        border-radius: 12px;
      }
    `}</style>
    </>
  );
};
