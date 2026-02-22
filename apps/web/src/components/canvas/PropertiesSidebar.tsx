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
  onTextColorChange?: (color: string) => void;
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
  onTextColorChange,
  onTextChange,
  onTextSizeChange,
  onTextFamilyChange,
  onDelete,
  onDuplicate,
  onCopy,
  onMove: _onMove,
  isSelectionArea = false
}: PropertiesSidebarProps) => {
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showStickyPicker, setShowStickyPicker] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  
  if (selectedObjects.length === 0) return null;
  
  // Get current colors from first selected shape
  const shapeWithStroke = selectedObjects.find(obj => 
    obj.type === 'rect' || 
    obj.type === 'circle' || 
    obj.type === 'triangle' || 
    obj.type === 'star' || 
    obj.type === 'line' ||
    obj.type === 'frame' ||
    obj.type === 'path'
  ) as { stroke?: string } | undefined;
  const currentStroke = shapeWithStroke?.stroke || '#000000';
  const currentFill = (
    selectedObjects.find(obj => obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'frame') as { fill?: string } | undefined
  )?.fill || '#FFFFFF';
  const hasShapes = selectedObjects.some(obj => obj.type !== 'sticky' && obj.type !== 'text' && obj.type !== 'textBubble');
  const hasText = selectedObjects.some(obj => obj.type === 'text');
  const currentTextColor = selectedObjects.find(obj => obj.type === 'text')?.fill || '#000000';
  const hasSticky = selectedObjects.some(obj => obj.type === 'sticky');
  const currentStickyColor = selectedObjects.find(obj => obj.type === 'sticky')?.color || '#FFF59D';
  const hasTextSupport = selectedObjects.some(
    obj => obj.type === 'rect' || obj.type === 'circle' || obj.type === 'triangle' || obj.type === 'star' || obj.type === 'sticky' || obj.type === 'text' || obj.type === 'textBubble'
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
  
  // Format object type name for display
  const formatTypeName = (type: string): string => {
    if (type === 'rect') return 'Rectangle';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };
  
  const getHeaderText = (): string => {
    if (isSelectionArea) {
      return `Selection (${selectedObjects.length} objects)`;
    }
    if (selectedObjects.length === 1) {
      return formatTypeName(selectedObjects[0].type);
    }
    return `${selectedObjects.length} Selected`;
  };
  
  return (
    <>
    <div className="fixed right-4 top-1/2 -translate-y-1/2 w-56 max-h-[60vh] bg-white rounded-[12px] shadow-[-6px_0_20px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.1),0_12px_32px_rgba(0,0,0,0.08)] z-40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2.5 border-b border-slate-200">
        <h3 className="text-xs font-semibold text-slate-900 text-center">
          {getHeaderText()}
        </h3>
      </div>
      
      {/* Properties */}
    <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2.5">
        {/* For selection area, show info message */}
        {isSelectionArea ? (
          <div className="text-xs text-slate-600 text-center py-6">
            <p className="mb-1.5">Drag to move all objects.</p>
            <p className="text-[10px] text-slate-500">Use Copy, Duplicate, or Delete below.</p>
          </div>
        ) : (
          <>
        {/* Stroke Color Section */}
        {hasShapes && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Stroke Color
            </label>
            
            <button
              onClick={() => {
                setShowStrokePicker(!showStrokePicker);
                setShowFillPicker(false);
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <div 
                  className="w-5 h-5 rounded border-2 border-slate-300"
                  style={{ backgroundColor: currentStroke }}
                />
                <span className="text-xs font-mono text-slate-700">
                  {currentStroke.toUpperCase()}
                </span>
              </div>
              <svg 
                className={`w-3 h-3 text-slate-500 transition-transform ${showStrokePicker ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showStrokePicker && (
              <div className="space-y-2 p-2 bg-slate-50 rounded-md border border-slate-200">
                <div className="w-full overflow-hidden rounded-lg border border-slate-200">
                  <HexColorPicker
                    color={currentStroke}
                    onChange={onStrokeColorChange}
                    style={{ paddingBottom: '10px', width: '100%' }}
                  />
                </div>
                <input
                  type="text"
                  value={currentStroke.toUpperCase()}
                  readOnly
                  className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-md bg-slate-50 cursor-default select-all"
                  placeholder="#000000"
                />
                <div className="grid grid-cols-6 gap-1">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => onStrokeColorChange(color)}
                      className={`w-full aspect-square rounded-md border-2 transition-all hover:scale-110 ${
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
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Note Color
            </label>

            <button
              onClick={() => {
                setShowStickyPicker(!showStickyPicker);
                setShowFillPicker(false);
                setShowStrokePicker(false);
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded border-2 border-slate-300"
                  style={{ backgroundColor: currentStickyColor }}
                />
                <span className="text-xs font-mono text-slate-700">
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
              <div className="space-y-2 p-2 bg-slate-50 rounded-md border border-slate-200">
                <div className="w-full overflow-visible rounded-xl border border-slate-200">
                  <HexColorPicker
                    color={currentStickyColor}
                    onChange={onStickyColorChange}
                    className="hex-color-picker" style={{ paddingBottom: '10px' }}
                  />
                </div>
                <input
                  type="text"
                  value={currentStickyColor.toUpperCase()}
                  readOnly
                  className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-md bg-slate-50 cursor-default select-all"
                  placeholder="#FFF59D"
                />
                <div className="grid grid-cols-5 gap-1">
                  {[...stickyColors, ...presetColors.slice(0, 7)].map((color) => (
                    <button
                      key={`sticky-${color}`}
                      onClick={() => onStickyColorChange(color)}
                      className={`w-full aspect-square rounded-md border-2 transition-all hover:scale-110 ${
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
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Fill Color
            </label>
            
            <button
              onClick={() => {
                setShowFillPicker(!showFillPicker);
                setShowStrokePicker(false);
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-5 h-5 rounded border-2 border-slate-300"
                  style={{ backgroundColor: currentFill }}
                />
                <span className="text-xs font-mono text-slate-700">
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
              <div className="space-y-2 p-2 bg-slate-50 rounded-md border border-slate-200">
                <div className="w-full overflow-visible rounded-xl border border-slate-200">
                  <HexColorPicker
                    color={currentFill}
                    onChange={onFillColorChange}
                    style={{ paddingBottom: '10px', width: '100%' }}
                  />
                </div>
                <input
                  type="text"
                  value={currentFill.toUpperCase()}
                  readOnly
                  className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-md bg-slate-50 cursor-default select-all"
                  placeholder="#FFFFFF"
                />
                <div className="grid grid-cols-6 gap-1">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => onFillColorChange(color)}
                      className={`w-full aspect-square rounded-md border-2 transition-all hover:scale-110 ${
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
        
        {/* Text Color Section - For plain text objects */}
        {hasText && onTextColorChange && (
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Text Color
            </label>
            
            <button
              onClick={() => {
                setShowTextColorPicker(!showTextColorPicker);
                setShowStrokePicker(false);
                setShowFillPicker(false);
                setShowStickyPicker(false);
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-5 h-5 rounded border-2 border-slate-300"
                  style={{ backgroundColor: currentTextColor }}
                />
                <span className="text-xs font-mono text-slate-700">
                  {currentTextColor.toUpperCase()}
                </span>
              </div>
              <svg 
                className={`w-4 h-4 text-slate-500 transition-transform ${showTextColorPicker ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showTextColorPicker && (
              <div className="space-y-2 p-2 bg-slate-50 rounded-md border border-slate-200">
                <div className="w-full overflow-hidden rounded-lg border border-slate-200">
                  <HexColorPicker
                    color={currentTextColor}
                    onChange={onTextColorChange}
                    style={{ paddingBottom: '10px', width: '100%' }}
                  />
                </div>
                <input
                  type="text"
                  value={currentTextColor.toUpperCase()}
                  readOnly
                  className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-md bg-slate-50 cursor-default select-all"
                  placeholder="#000000"
                />
                <div className="grid grid-cols-6 gap-1">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => onTextColorChange(color)}
                      className={`w-full aspect-square rounded-md border-2 transition-all hover:scale-110 ${
                        currentTextColor.toUpperCase() === color.toUpperCase()
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

        {/* Text Section - For rectangles, circles, sticky notes, and text objects */}
        {hasTextSupport && (
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Text
            </label>
            
            <textarea
              value={currentText}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Enter text..."
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              rows={2}
            />

            <div className="space-y-2 pt-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
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
                  className="w-14 px-1.5 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                Font Style
              </label>
              <div className="grid grid-cols-1 gap-1">
                {(['Inter', 'Poppins', 'Merriweather'] as const).map((font) => (
                  <button
                    key={font}
                    onClick={() => onTextFamilyChange(font)}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium text-center transition-colors ${
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
      <div className="p-2 border-t border-slate-200 space-y-1.5">
        {/* Copy Button */}
        {onCopy && (
          <button
            onClick={onCopy}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          </button>
        )}
        
        {/* Duplicate Button */}
        {onDuplicate && (
          <button
            onClick={onDuplicate}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8a2 2 0 012 2v8a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z" />
            </svg>
            Duplicate
          </button>
        )}
        
        {/* Delete Button */}
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-md transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>
    </div>
    <style jsx>{`
      :global(.hex-color-picker) {
        width: 100% !important;
        max-width: 100% !important;
        min-height: 110px;
      }
      :global(.hex-color-picker .react-colorful__saturation) {
        border-radius: 8px;
        min-height: 80px;
        height: 80px;
        width: 100% !important;
        max-width: 100% !important;
      }
      :global(.hex-color-picker .react-colorful__hue) {
        height: 12px;
        border-radius: 6px;
        margin-top: 8px;
        width: 100% !important;
        max-width: 100% !important;
      }
      :global(.hex-color-picker .react-colorful__pointer) {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      :global(.hex-color-picker .react-colorful__saturation-pointer) {
        width: 16px;
        height: 16px;
      }
      :global(.hex-color-picker .react-colorful__interactive) {
        width: 100% !important;
      }
    `}</style>
    </>
  );
};
