/**
 * Canvas object types and interfaces
 */

export type ObjectType = 'sticky' | 'rect' | 'circle' | 'triangle' | 'star' | 'line' | 'text' | 'textBubble' | 'frame';

export interface BaseObject {
  id: string;
  type: ObjectType;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  createdBy: string;
  createdAt: number;
  modifiedBy?: string;
  modifiedAt?: number;
}

export interface StickyNote extends BaseObject {
  type: 'sticky';
  width: number;
  height: number;
  color: string; // #FFF59D, #F48FB1, #81D4FA, #A5D6A7, #FFCC80
  text?: string; // Optional text inside
  textSize?: number;
  textFamily?: 'Inter' | 'Poppins' | 'Merriweather';
}

export interface RectShape extends BaseObject {
  type: 'rect';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string; // Optional text inside
  textSize?: number;
  textFamily?: 'Inter' | 'Poppins' | 'Merriweather';
}

export interface CircleShape extends BaseObject {
  type: 'circle';
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string; // Optional text inside
  textSize?: number;
  textFamily?: 'Inter' | 'Poppins' | 'Merriweather';
}

export interface TriangleShape extends BaseObject {
  type: 'triangle';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string;
  textSize?: number;
  textFamily?: 'Inter' | 'Poppins' | 'Merriweather';
}

export interface StarShape extends BaseObject {
  type: 'star';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text?: string;
  textSize?: number;
  textFamily?: 'Inter' | 'Poppins' | 'Merriweather';
}

export type AnchorPosition =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'p1'
  | 'p2'
  | 'p3'
  | 'p4'
  | 'p5';

export interface ConnectorAnchor {
  objectId: string;
  anchor: AnchorPosition;
}

export interface LineShape extends BaseObject {
  type: 'line';
  points: number[]; // [x1, y1, x2, y2]
  stroke: string;
  strokeWidth: number;
  startAnchor?: ConnectorAnchor; // connected to a shape's anchor point
  endAnchor?: ConnectorAnchor;   // connected to a shape's anchor point
}

export interface TextShape extends BaseObject {
  type: 'text';
  text: string;
  textSize?: number;
  textFamily?: 'Inter' | 'Poppins' | 'Merriweather';
  fill?: string; // Text color (default black)
}

export interface TextBubbleShape extends BaseObject {
  type: 'textBubble';
  width: number;
  height: number;
  text?: string;
  textSize?: number;
  textFamily?: 'Inter' | 'Poppins' | 'Merriweather';
}

export interface Frame extends BaseObject {
  type: 'frame';
  width: number;
  height: number;
  stroke: string; // Frame border color
  strokeWidth: number;
  fill?: string; // Optional background fill (default transparent)
  containedObjectIds: string[]; // IDs of objects inside this frame
  name?: string; // Frame name (default: frame1, frame2, etc.)
  isAIContainer?: boolean; // True if AI created this for grouping/organizing objects, false/undefined for user-drawn frames
}

export type WhiteboardObject = StickyNote | RectShape | CircleShape | TriangleShape | StarShape | LineShape | TextShape | TextBubbleShape | Frame;

export interface CanvasState {
  objects: Map<string, WhiteboardObject>;
  selectedIds: string[];
  scale: number;
  position: { x: number; y: number };
}

export const STICKY_COLORS = {
  YELLOW: '#FFF59D',
  PINK: '#F48FB1',
  BLUE: '#81D4FA',
  GREEN: '#A5D6A7',
  ORANGE: '#FFCC80',
} as const;

export const SHAPE_COLORS = {
  BLACK: '#000000',
  GRAY: '#6B7280',
  RED: '#EF4444',
  ORANGE: '#F97316',
  YELLOW: '#EAB308',
  GREEN: '#10B981',
  BLUE: '#3B82F6',
  INDIGO: '#6366F1',
  PURPLE: '#A855F7',
  PINK: '#EC4899',
} as const;

export const CURSOR_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
] as const;
