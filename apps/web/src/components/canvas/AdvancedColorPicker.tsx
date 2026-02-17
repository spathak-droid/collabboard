/**
 * Advanced Color Picker for Shapes
 * Shows when a shape is selected
 */

'use client';

import { HexColorPicker } from 'react-colorful';
import { useState } from 'react';

interface AdvancedColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  position?: { x: number; y: number };
  onClose?: () => void;
}

export const AdvancedColorPicker = ({ 
  currentColor, 
  onColorChange,
  position,
  onClose
}: AdvancedColorPickerProps) => {
  const [color, setColor] = useState(currentColor);
  
  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    onColorChange(newColor);
  };
  
  const presetColors = [
    '#000000', '#6B7280', '#EF4444', '#F97316',
    '#EAB308', '#10B981', '#3B82F6', '#6366F1',
    '#A855F7', '#EC4899', '#FFFFFF', '#94A3B8'
  ];
  
  // Position the picker near the selected object or default to left side
  const style = position 
    ? { 
        position: 'fixed' as const,
        left: `${Math.min(position.x + 20, window.innerWidth - 250)}px`,
        top: `${Math.min(position.y, window.innerHeight - 400)}px`,
      }
    : {
        position: 'fixed' as const,
        left: '80px',
        top: '100px',
      };
  
  return (
    <div 
      className="bg-white rounded-xl shadow-2xl p-4 z-50 border border-gray-200"
      style={style}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">Pick Color</span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Color Picker */}
      <div className="mb-3">
        <HexColorPicker color={color} onChange={handleColorChange} />
      </div>
      
      {/* Color Input */}
      <div className="mb-3">
        <input
          type="text"
          value={color.toUpperCase()}
          onChange={(e) => {
            const val = e.target.value;
            if (/^#[0-9A-F]{0,6}$/i.test(val)) {
              handleColorChange(val);
            }
          }}
          className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="#000000"
        />
      </div>
      
      {/* Preset Colors */}
      <div className="grid grid-cols-6 gap-2">
        {presetColors.map((presetColor) => (
          <button
            key={presetColor}
            onClick={() => handleColorChange(presetColor)}
            className={`w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110 ${
              color.toUpperCase() === presetColor.toUpperCase()
                ? 'border-blue-500 ring-2 ring-blue-200'
                : 'border-gray-300'
            }`}
            style={{ backgroundColor: presetColor }}
            title={presetColor}
          />
        ))}
      </div>
      
      {/* Current color preview */}
      <div className="mt-3 flex items-center gap-2">
        <div 
          className="w-10 h-10 rounded-lg border-2 border-gray-300"
          style={{ backgroundColor: color }}
        />
        <div className="text-xs text-gray-600">
          <div className="font-semibold">Current</div>
          <div className="font-mono">{color.toUpperCase()}</div>
        </div>
      </div>
    </div>
  );
};
