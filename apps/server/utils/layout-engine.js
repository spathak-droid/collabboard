/**
 * Layout Engine — deterministic conversion of CompositionPlans into positioned tool calls.
 *
 * Takes a structured plan (from the Planner LLM) and produces an array of tool calls
 * with concrete x/y coordinates that the client executor already understands.
 *
 * Zero LLM calls. Pure math.
 */

import { STICKY_COLOR_MAP, SHAPE_COLOR_MAP } from './plan-schema.js';

// ── Size defaults ───────────────────────────────────────────

const SIZES = {
  sticky: { width: 200, height: 200 },
  shape: { width: 150, height: 150 },
  text: { width: 120, height: 30 },
  textBubble: { width: 200, height: 100 },
  frame: { width: 400, height: 400 },
};

const ASPECT_MULTIPLIERS = {
  square: { w: 1, h: 1 },
  wide: { w: 2, h: 1 },
  tall: { w: 1, h: 2 },
  tall_narrow: { w: 0.5, h: 2 },
  small: { w: 0.6, h: 0.6 },
  large: { w: 1.5, h: 1.5 },
};

const GAP = 20;
const FRAME_PADDING = 40;

// ── Color resolution ────────────────────────────────────────

const ALL_STICKY_COLORS = Object.values(STICKY_COLOR_MAP);
const ALL_SHAPE_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#A855F7', '#F97316', '#06B6D4', '#6366F1', '#EC4899'];

let colorCounter = 0;

function resolveStickyColor(color) {
  if (!color || color === 'random') {
    return ALL_STICKY_COLORS[colorCounter++ % ALL_STICKY_COLORS.length];
  }
  if (color.startsWith('#')) return color;
  return STICKY_COLOR_MAP[color] || STICKY_COLOR_MAP.yellow;
}

function resolveShapeColor(color) {
  if (!color || color === 'random') {
    return ALL_SHAPE_COLORS[colorCounter++ % ALL_SHAPE_COLORS.length];
  }
  if (color.startsWith('#')) return color;
  return SHAPE_COLOR_MAP[color] || SHAPE_COLOR_MAP.gray;
}

// ── Node sizing ─────────────────────────────────────────────

function getNodeSize(node) {
  const base = SIZES[node.type] || SIZES.shape;
  const aspect = ASPECT_MULTIPLIERS[node.aspect] || ASPECT_MULTIPLIERS.square;
  return {
    width: Math.round(base.width * aspect.w),
    height: Math.round(base.height * aspect.h),
  };
}

function getContainerChildrenSize(node, layout) {
  if (!node.children || node.children.length === 0) {
    return { width: 200, height: 200 };
  }

  const childSizes = node.children.map(child => {
    if (child.children && child.children.length > 0) {
      return getContainerChildrenSize(child, child.layout || 'stack_vertical');
    }
    return getNodeSize(child);
  });

  return computeLayoutBounds(childSizes, layout, node.children.length);
}

function computeLayoutBounds(childSizes, layout, count) {
  if (count === 0) return { width: 200, height: 200 };

  switch (layout) {
    case 'columns':
    case 'stack_horizontal':
    case 'flow_horizontal': {
      const totalWidth = childSizes.reduce((sum, s) => sum + s.width, 0) + GAP * (count - 1);
      const maxHeight = Math.max(...childSizes.map(s => s.height));
      return { width: totalWidth, height: maxHeight };
    }
    case 'stack_vertical':
    case 'flow_vertical': {
      const maxWidth = Math.max(...childSizes.map(s => s.width));
      const totalHeight = childSizes.reduce((sum, s) => sum + s.height, 0) + GAP * (count - 1);
      return { width: maxWidth, height: totalHeight };
    }
    case 'grid': {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const maxW = Math.max(...childSizes.map(s => s.width));
      const maxH = Math.max(...childSizes.map(s => s.height));
      return {
        width: cols * maxW + (cols - 1) * GAP,
        height: rows * maxH + (rows - 1) * GAP,
      };
    }
    case 'radial': {
      const maxDim = Math.max(...childSizes.map(s => Math.max(s.width, s.height)));
      const radius = Math.max(maxDim * 1.5, count * 30);
      return { width: radius * 2 + maxDim, height: radius * 2 + maxDim };
    }
    default: {
      const totalWidth = childSizes.reduce((sum, s) => sum + s.width, 0) + GAP * (count - 1);
      const maxHeight = Math.max(...childSizes.map(s => s.height));
      return { width: totalWidth, height: maxHeight };
    }
  }
}

// ── Main entry point ────────────────────────────────────────

/**
 * Convert a CompositionPlan into an array of positioned tool calls.
 *
 * @param {object} plan - The plan from the Planner LLM (createPlan arguments)
 * @param {{ x: number, y: number }} anchor - Top-left anchor for the composition
 * @param {object|null} frameInfo - Existing frame to compose inside { id, x, y, width, height }
 * @returns {{ toolCalls: Array<{ name: string, arguments: object }>, summary: string }}
 */
export function planToToolCalls(plan, anchor = { x: 100, y: 100 }, frameInfo = null) {
  colorCounter = 0;
  const toolCalls = [];
  const idMap = new Map();
  let idCounter = 0;

  const generateTempId = () => `plan_${idCounter++}`;

  const compositionArea = frameInfo
    ? {
        x: frameInfo.x + FRAME_PADDING,
        y: frameInfo.y + FRAME_PADDING,
        width: frameInfo.width - FRAME_PADDING * 2,
        height: frameInfo.height - FRAME_PADDING * 2,
      }
    : null;

  const startX = compositionArea ? compositionArea.x : anchor.x;
  const startY = compositionArea ? compositionArea.y : anchor.y;

  const layout = plan.layout || 'columns';
  const children = plan.children || [];

  if (children.length === 0) {
    return { toolCalls: [], summary: 'Empty plan — nothing to create' };
  }

  const positions = computeChildPositions(children, layout, startX, startY, compositionArea);

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const pos = positions[i];
    emitNode(child, pos.x, pos.y, pos.width, pos.height, toolCalls, idMap, generateTempId, frameInfo);
  }

  emitConnectors(children, idMap, toolCalls);

  if (plan.wrapInFrame !== false && !frameInfo) {
    const contentBounds = computeContentBounds(toolCalls);
    if (contentBounds) {
      toolCalls.push({
        name: 'createFrame',
        arguments: {
          title: plan.title || 'Composition',
          x: contentBounds.x - FRAME_PADDING,
          y: contentBounds.y - FRAME_PADDING,
          width: contentBounds.width + FRAME_PADDING * 2,
          height: contentBounds.height + FRAME_PADDING * 2,
          fill: 'transparent',
        },
      });
    }
  }

  const objectCount = toolCalls.filter(tc => tc.name !== 'createConnector').length;
  const summary = `Composed "${plan.title || 'design'}" with ${objectCount} objects`;

  return { toolCalls, summary };
}

// ── Position computation per layout ─────────────────────────

function computeChildPositions(children, layout, startX, startY, constraintArea) {
  const childSizes = children.map(child => {
    if (child.children && child.children.length > 0) {
      const inner = getContainerChildrenSize(child, child.layout || 'stack_vertical');
      return {
        width: inner.width + FRAME_PADDING * 2,
        height: inner.height + FRAME_PADDING * 2,
      };
    }
    return getNodeSize(child);
  });

  if (constraintArea) {
    return computeConstrainedPositions(childSizes, layout, constraintArea);
  }

  switch (layout) {
    case 'columns':
    case 'stack_horizontal':
      return layoutHorizontal(childSizes, startX, startY);
    case 'stack_vertical':
      return layoutVertical(childSizes, startX, startY);
    case 'grid':
      return layoutGrid(childSizes, startX, startY, children.length);
    case 'radial':
      return layoutRadial(childSizes, startX, startY, children.length);
    case 'flow_horizontal':
      return layoutHorizontal(childSizes, startX, startY);
    case 'flow_vertical':
      return layoutVertical(childSizes, startX, startY);
    default:
      return layoutHorizontal(childSizes, startX, startY);
  }
}

function computeConstrainedPositions(childSizes, layout, area) {
  const scaleToFit = (positions) => {
    let maxRight = 0;
    let maxBottom = 0;
    for (const p of positions) {
      maxRight = Math.max(maxRight, p.x + p.width - area.x);
      maxBottom = Math.max(maxBottom, p.y + p.height - area.y);
    }
    const scaleX = maxRight > area.width ? area.width / maxRight : 1;
    const scaleY = maxBottom > area.height ? area.height / maxBottom : 1;
    const scale = Math.min(scaleX, scaleY, 1);
    if (scale < 1) {
      return positions.map(p => ({
        x: area.x + (p.x - area.x) * scale,
        y: area.y + (p.y - area.y) * scale,
        width: Math.round(p.width * scale),
        height: Math.round(p.height * scale),
      }));
    }
    return positions;
  };

  const raw = computeChildPositionsUnconstrained(childSizes, layout, area.x, area.y, childSizes.length);
  return scaleToFit(raw);
}

function computeChildPositionsUnconstrained(childSizes, layout, startX, startY, count) {
  switch (layout) {
    case 'columns':
    case 'stack_horizontal':
    case 'flow_horizontal':
      return layoutHorizontal(childSizes, startX, startY);
    case 'stack_vertical':
    case 'flow_vertical':
      return layoutVertical(childSizes, startX, startY);
    case 'grid':
      return layoutGrid(childSizes, startX, startY, count);
    case 'radial':
      return layoutRadial(childSizes, startX, startY, count);
    default:
      return layoutHorizontal(childSizes, startX, startY);
  }
}

// ── Layout algorithms ───────────────────────────────────────

function layoutHorizontal(childSizes, startX, startY) {
  const positions = [];
  let x = startX;
  const maxHeight = Math.max(...childSizes.map(s => s.height));

  for (const size of childSizes) {
    const yOffset = Math.round((maxHeight - size.height) / 2);
    positions.push({
      x: Math.round(x),
      y: Math.round(startY + yOffset),
      width: size.width,
      height: size.height,
    });
    x += size.width + GAP;
  }
  return positions;
}

function layoutVertical(childSizes, startX, startY) {
  const positions = [];
  let y = startY;
  const maxWidth = Math.max(...childSizes.map(s => s.width));

  for (const size of childSizes) {
    const xOffset = Math.round((maxWidth - size.width) / 2);
    positions.push({
      x: Math.round(startX + xOffset),
      y: Math.round(y),
      width: size.width,
      height: size.height,
    });
    y += size.height + GAP;
  }
  return positions;
}

function layoutGrid(childSizes, startX, startY, count) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const maxW = Math.max(...childSizes.map(s => s.width));
  const maxH = Math.max(...childSizes.map(s => s.height));
  const cellW = maxW + GAP;
  const cellH = maxH + GAP;

  const positions = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    positions.push({
      x: Math.round(startX + col * cellW),
      y: Math.round(startY + row * cellH),
      width: childSizes[i]?.width || maxW,
      height: childSizes[i]?.height || maxH,
    });
  }
  return positions;
}

function layoutRadial(childSizes, startX, startY, count) {
  const maxDim = Math.max(...childSizes.map(s => Math.max(s.width, s.height)));
  const radius = Math.max(maxDim * 2, count * 35);
  const centerX = startX + radius + maxDim / 2;
  const centerY = startY + radius + maxDim / 2;

  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    const size = childSizes[i] || { width: maxDim, height: maxDim };
    positions.push({
      x: Math.round(centerX + radius * Math.cos(angle) - size.width / 2),
      y: Math.round(centerY + radius * Math.sin(angle) - size.height / 2),
      width: size.width,
      height: size.height,
    });
  }
  return positions;
}

// ── Node emission (plan node → tool call) ───────────────────

function emitNode(node, x, y, allocWidth, allocHeight, toolCalls, idMap, genId, frameInfo) {
  const nodeId = genId();

  switch (node.type) {
    case 'sticky': {
      const size = getNodeSize(node);
      toolCalls.push({
        name: 'createStickyNote',
        arguments: {
          text: node.text || '',
          x,
          y,
          color: resolveStickyColor(node.color),
          ...(frameInfo ? { frameId: frameInfo.id } : {}),
        },
      });
      idMap.set(nodeId, toolCalls.length - 1);
      break;
    }

    case 'shape': {
      const size = getNodeSize(node);
      toolCalls.push({
        name: 'createShape',
        arguments: {
          type: node.shape || 'rect',
          x,
          y,
          width: allocWidth || size.width,
          height: allocHeight || size.height,
          color: resolveShapeColor(node.color),
          ...(node.text ? { text: node.text } : {}),
          ...(frameInfo ? { frameId: frameInfo.id } : {}),
        },
      });
      idMap.set(nodeId, toolCalls.length - 1);
      break;
    }

    case 'text': {
      toolCalls.push({
        name: 'createText',
        arguments: {
          text: node.text || '',
          x,
          y,
        },
      });
      idMap.set(nodeId, toolCalls.length - 1);
      break;
    }

    case 'textBubble': {
      const size = getNodeSize(node);
      toolCalls.push({
        name: 'createTextBubble',
        arguments: {
          text: node.text || '',
          x,
          y,
          width: allocWidth || size.width,
          height: allocHeight || size.height,
        },
      });
      idMap.set(nodeId, toolCalls.length - 1);
      break;
    }

    case 'column':
    case 'frame': {
      const innerLayout = node.layout || 'stack_vertical';
      const children = node.children || [];

      if (children.length === 0) {
        toolCalls.push({
          name: 'createFrame',
          arguments: {
            title: node.title || node.text || '',
            x,
            y,
            width: allocWidth || 280,
            height: allocHeight || 400,
          },
        });
        idMap.set(nodeId, toolCalls.length - 1);
        break;
      }

      const innerX = x + FRAME_PADDING;
      const innerY = y + FRAME_PADDING;
      const innerW = (allocWidth || 280) - FRAME_PADDING * 2;
      const innerH = (allocHeight || 400) - FRAME_PADDING * 2;

      const innerArea = { x: innerX, y: innerY, width: innerW, height: innerH };
      const childPositions = computeChildPositions(children, innerLayout, innerX, innerY, innerArea);

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const pos = childPositions[i];
        emitNode(child, pos.x, pos.y, pos.width, pos.height, toolCalls, idMap, genId, null);
      }

      emitConnectors(children, idMap, toolCalls);

      const childBounds = computeContentBoundsFromPositions(childPositions);
      const frameW = Math.max(allocWidth || 0, childBounds.width + FRAME_PADDING * 2);
      const frameH = Math.max(allocHeight || 0, childBounds.height + FRAME_PADDING * 2);

      toolCalls.push({
        name: 'createFrame',
        arguments: {
          title: node.title || node.text || '',
          x,
          y,
          width: frameW,
          height: frameH,
        },
      });
      idMap.set(nodeId, toolCalls.length - 1);
      break;
    }

    case 'group':
    case 'composition': {
      const innerLayout = node.layout || 'stack_vertical';
      const children = node.children || [];
      if (children.length === 0) break;

      const childPositions = computeChildPositions(children, innerLayout, x, y, null);
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const pos = childPositions[i];
        emitNode(child, pos.x, pos.y, pos.width, pos.height, toolCalls, idMap, genId, frameInfo);
      }
      emitConnectors(children, idMap, toolCalls);
      idMap.set(nodeId, -1);
      break;
    }

    default: {
      const size = getNodeSize(node);
      toolCalls.push({
        name: 'createShape',
        arguments: {
          type: 'rect',
          x,
          y,
          width: allocWidth || size.width,
          height: allocHeight || size.height,
          color: resolveShapeColor(node.color),
          ...(node.text ? { text: node.text } : {}),
        },
      });
      idMap.set(nodeId, toolCalls.length - 1);
    }
  }
}

// ── Connector emission ──────────────────────────────────────

function emitConnectors(children, idMap, toolCalls) {
  if (!children || children.length < 2) return;

  for (let i = 0; i < children.length - 1; i++) {
    const child = children[i];
    if (!child.connectTo) continue;

    const fromIdx = findToolCallIndex(idMap, i, children);
    const toIdx = findToolCallIndex(idMap, i + 1, children);

    if (fromIdx >= 0 && toIdx >= 0) {
      toolCalls.push({
        name: 'createConnector',
        arguments: {
          fromIndex: fromIdx,
          toIndex: toIdx,
          style: child.connectTo === 'curved' ? 'curved' : 'straight',
        },
      });
    }
  }
}

function findToolCallIndex(idMap, childIndex, children) {
  const nodeId = `plan_${childIndex}`;
  const idx = idMap.get(nodeId);
  if (idx !== undefined && idx >= 0) return idx;

  for (const [key, val] of idMap.entries()) {
    if (key.startsWith(`plan_`) && val >= 0) {
      const num = parseInt(key.replace('plan_', ''), 10);
      if (num === childIndex) return val;
    }
  }
  return -1;
}

// ── Bounds helpers ──────────────────────────────────────────

function computeContentBounds(toolCalls) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const tc of toolCalls) {
    if (tc.name === 'createConnector') continue;
    const args = tc.arguments;
    const x = args.x ?? 0;
    const y = args.y ?? 0;
    const w = args.width ?? 200;
    const h = args.height ?? 200;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  if (!Number.isFinite(minX)) return null;

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function computeContentBoundsFromPositions(positions) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const p of positions) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + (p.width || 200));
    maxY = Math.max(maxY, p.y + (p.height || 200));
  }

  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 200, height: 200 };

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
