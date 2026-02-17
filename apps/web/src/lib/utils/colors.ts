/**
 * Utility functions for colors
 */

import { STICKY_COLORS, CURSOR_COLORS } from '@/types/canvas';

export const getUserColor = (userId: string): string => {
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
};

export const getStickyColors = () => Object.values(STICKY_COLORS);

export const isValidStickyColor = (color: string): boolean => {
  return Object.values(STICKY_COLORS).includes(color as any);
};
