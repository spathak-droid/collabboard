/**
 * Shape Color Picker Component
 */

'use client';

import { SHAPE_COLORS } from '@/types/canvas';

interface ShapeColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  position?: 'top' | 'bottom';
}

export const ShapeColorPicker = ({ 
  selectedColor, 
  onColorSelect,
  position = 'bottom' 
}: ShapeColorPickerProps) => {
  const colors = Object.values(SHAPE_COLORS);
  
  return (
    <div className={`fixed left-4 ${position === 'top' ? 'top-[500px]' : 'bottom-20'} bg-white rounded-xl shadow-lg p-3 z-30 w-16`}>
      <div className="text-xs font-semibold text-gray-700 mb-2 text-center">Color</div>
      <div className="flex flex-col gap-2">
        {colors.map((color) => (
          <button
            key={color}
            onClick={() => onColorSelect(color)}
            className={`w-10 h-10 rounded-lg transition-all ${
              selectedColor === color
                ? 'ring-2 ring-blue-500 ring-offset-2 scale-110'
                : 'hover:scale-105'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
    </div>
  );
};
