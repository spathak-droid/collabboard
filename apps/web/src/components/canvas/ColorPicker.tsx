/**
 * Color Picker Component for sticky notes
 */

'use client';

import { STICKY_COLORS } from '@/types/canvas';

interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  position: { x: number; y: number };
}

export const ColorPicker = ({ currentColor, onColorChange, position }: ColorPickerProps) => {
  const colors = Object.values(STICKY_COLORS);
  
  return (
    <div
      className="absolute bg-white rounded-lg shadow-lg p-2 flex gap-2 z-20"
      style={{
        left: `${position.x}px`,
        top: `${position.y + 210}px`, // Below the sticky note
      }}
    >
      {colors.map((color) => (
        <button
          key={color}
          onClick={() => onColorChange(color)}
          className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
            currentColor === color ? 'border-blue-500 scale-110' : 'border-gray-300'
          }`}
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  );
};
