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
  onDuplicate 
}: PropertiesSidebarProps) => {
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [showFillPicker, setShowFillPicker] = useState(false);
  const [showStickyPicker, setShowStickyPicker] = useState(false);
  
  if (selectedObjects.length === 0) return null;
  
  // Get current colors from first selected shape
  const currentStroke = selectedObjects.find(obj => obj.type !== 'sticky' && obj.type !== 'textBubble')?.stroke || '#000000';
  const currentFill = (selectedObjects.find(obj => obj.type === 'rect' || obj.type === 'circle') as { fill?: string } | undefined)?.fill || '#FFFFFF';
  const hasShapes = selectedObjects.some(obj => obj.type !== 'sticky' && obj.type !== 'textBubble');
  const hasSticky = selectedObjects.some(obj => obj.type === 'sticky');
  const currentStickyColor = selectedObjects.find(obj => obj.type === 'sticky')?.color || '#FFF59D';
  const hasTextSupport = selectedObjects.some(obj => obj.type === 'rect' || obj.type === 'circle' || obj.type === 'sticky' || obj.type === 'textBubble');
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
    <div className="fixed right-0 top-0 h-screen w-80 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">
          {selectedObjects.length === 1 
            ? `${selectedObjects[0].type.charAt(0).toUpperCase() + selectedObjects[0].type.slice(1)} Properties`
            : `${selectedObjects.length} Objects Selected`
          }
        </h3>
      </div>
      
      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* Stroke Color Section */}
        {hasShapes && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Stroke Color
            </label>
            
            <button
              onClick={() => {
                setShowStrokePicker(!showStrokePicker);
                setShowFillPicker(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded border-2 border-gray-300"
                  style={{ backgroundColor: currentStroke }}
                />
                <span className="text-sm font-mono text-gray-700">
                  {currentStroke.toUpperCase()}
                </span>
              </div>
              <svg 
                className={`w-4 h-4 text-gray-500 transition-transform ${showStrokePicker ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showStrokePicker && (
              <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <HexColorPicker color={currentStroke} onChange={onStrokeColorChange} />
                <input
                  type="text"
                  value={currentStroke.toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-F]{0,6}$/i.test(val)) {
                      onStrokeColorChange(val);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="#000000"
                />
                <div className="grid grid-cols-6 gap-2">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => onStrokeColorChange(color)}
                      className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                        currentStroke.toUpperCase() === color.toUpperCase()
                          ? 'border-blue-500 ring-2 ring-blue-200'
                          : 'border-gray-300'
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
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Note Color
            </label>

            <button
              onClick={() => {
                setShowStickyPicker(!showStickyPicker);
                setShowFillPicker(false);
                setShowStrokePicker(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded border-2 border-gray-300"
                  style={{ backgroundColor: currentStickyColor }}
                />
                <span className="text-sm font-mono text-gray-700">
                  {currentStickyColor.toUpperCase()}
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${showStickyPicker ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showStickyPicker && (
              <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <HexColorPicker color={currentStickyColor} onChange={onStickyColorChange} />
                <input
                  type="text"
                  value={currentStickyColor.toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-F]{0,6}$/i.test(val)) {
                      onStickyColorChange(val);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="#FFF59D"
                />
                <div className="grid grid-cols-6 gap-2">
                  {[...stickyColors, ...presetColors].map((color) => (
                    <button
                      key={`sticky-${color}`}
                      onClick={() => onStickyColorChange(color)}
                      className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                        currentStickyColor.toUpperCase() === color.toUpperCase()
                          ? 'border-blue-500 ring-2 ring-blue-200'
                          : 'border-gray-300'
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
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Fill Color
            </label>
            
            <button
              onClick={() => {
                setShowFillPicker(!showFillPicker);
                setShowStrokePicker(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded border-2 border-gray-300"
                  style={{ backgroundColor: currentFill }}
                />
                <span className="text-sm font-mono text-gray-700">
                  {currentFill.toUpperCase()}
                </span>
              </div>
              <svg 
                className={`w-4 h-4 text-gray-500 transition-transform ${showFillPicker ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showFillPicker && (
              <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <HexColorPicker color={currentFill} onChange={onFillColorChange} />
                <input
                  type="text"
                  value={currentFill.toUpperCase()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9A-F]{0,6}$/i.test(val)) {
                      onFillColorChange(val);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="#FFFFFF"
                />
                <div className="grid grid-cols-6 gap-2">
                  {presetColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => onFillColorChange(color)}
                      className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                        currentFill.toUpperCase() === color.toUpperCase()
                          ? 'border-blue-500 ring-2 ring-blue-200'
                          : 'border-gray-300'
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
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Text
            </label>
            
            <textarea
              value={currentText}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Enter text..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />

            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
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
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Font Style
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Inter', 'Poppins', 'Merriweather'] as const).map((font) => (
                  <button
                    key={font}
                    onClick={() => onTextFamilyChange(font)}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      currentTextFamily === font
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {font}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Actions Footer */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        {/* Duplicate Button */}
        {onDuplicate && (
          <button
            onClick={onDuplicate}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
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
  );
};
