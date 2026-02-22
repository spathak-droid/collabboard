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
/** Larger gap for flow layouts so connector lines between nodes are longer and more visible */
const FLOW_GAP = 80;
const FRAME_PADDING = 40;
// Extra padding for wrapper frame so start/end nodes (e.g. circles) are fully inside
const WRAPPER_FRAME_PADDING = 80;

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
    case 'stack_horizontal': {
      const totalWidth = childSizes.reduce((sum, s) => sum + s.width, 0) + GAP * (count - 1);
      const maxHeight = Math.max(...childSizes.map(s => s.height));
      return { width: totalWidth, height: maxHeight };
    }
    case 'flow_horizontal': {
      const totalWidth = childSizes.reduce((sum, s) => sum + s.width, 0) + FLOW_GAP * (count - 1);
      const maxHeight = Math.max(...childSizes.map(s => s.height));
      return { width: totalWidth, height: maxHeight };
    }
    case 'stack_vertical': {
      const maxWidth = Math.max(...childSizes.map(s => s.width));
      const totalHeight = childSizes.reduce((sum, s) => sum + s.height, 0) + GAP * (count - 1);
      return { width: maxWidth, height: totalHeight };
    }
    case 'flow_vertical': {
      const maxWidth = Math.max(...childSizes.map(s => s.width));
      const totalHeight = childSizes.reduce((sum, s) => sum + s.height, 0) + FLOW_GAP * (count - 1);
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
 * @param {{ x: number, y: number }} anchor - Top-left anchor for the composition (optional, if null uses free space)
 * @param {object|null} frameInfo - Existing frame to compose inside { id, x, y, width, height }
 * @param {boolean} useExplicitPositions - If false, omit x,y to let client find free space (default: false for top-level)
 * @returns {{ toolCalls: Array<{ name: string, arguments: object }>, summary: string }}
 */
export function planToToolCalls(plan, anchor = null, frameInfo = null, useExplicitPositions = false) {
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

  const startX = compositionArea ? compositionArea.x : (anchor ? anchor.x : 100);
  const startY = compositionArea ? compositionArea.y : (anchor ? anchor.y : 100);

  const layout = plan.layout || 'columns';
  const children = plan.children || [];

  if (children.length === 0) {
    return { toolCalls: [], summary: 'Empty plan — nothing to create' };
  }

  const positions = computeChildPositions(children, layout, startX, startY, compositionArea);

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const pos = positions[i];
    emitNode(child, pos.x, pos.y, pos.width, pos.height, toolCalls, idMap, generateTempId, frameInfo, useExplicitPositions);
  }

  emitConnectors(children, idMap, toolCalls);

  // Emit branch nodes (e.g. "did not receive link" → ERROR) and their connectors
  emitBranches(children, positions, layout, idMap, toolCalls, generateTempId, frameInfo, useExplicitPositions);

  if (plan.wrapInFrame !== false && !frameInfo) {
    const contentBounds = computeContentBounds(toolCalls);
    if (contentBounds) {
      // Use WRAPPER_FRAME_PADDING so start/end shapes (e.g. circles) are fully inside the frame
      const framePadding = WRAPPER_FRAME_PADDING;
      const frameArgs = {
        title: plan.title || 'Composition',
        width: contentBounds.width + framePadding * 2,
        height: contentBounds.height + framePadding * 2,
        fill: 'transparent',
      };
      
      // Only add x,y if using explicit positions
      if (useExplicitPositions) {
        frameArgs.x = contentBounds.x - framePadding;
        frameArgs.y = contentBounds.y - framePadding;
      }
      toolCalls.push({
        name: 'createFrame',
        arguments: frameArgs,
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
      return layoutHorizontal(childSizes, startX, startY, GAP);
    case 'stack_vertical':
      return layoutVertical(childSizes, startX, startY, GAP);
    case 'grid':
      return layoutGrid(childSizes, startX, startY, children.length);
    case 'radial':
      return layoutRadial(childSizes, startX, startY, children.length);
    case 'flow_horizontal':
      return layoutHorizontal(childSizes, startX, startY, FLOW_GAP);
    case 'flow_vertical':
      return layoutVertical(childSizes, startX, startY, FLOW_GAP);
    case 'freeform':
      return layoutFreeform(children, childSizes, startX, startY);
    default:
      return layoutHorizontal(childSizes, startX, startY, GAP);
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
      return layoutHorizontal(childSizes, startX, startY, GAP);
    case 'flow_horizontal':
      return layoutHorizontal(childSizes, startX, startY, FLOW_GAP);
    case 'stack_vertical':
      return layoutVertical(childSizes, startX, startY, GAP);
    case 'flow_vertical':
      return layoutVertical(childSizes, startX, startY, FLOW_GAP);
    case 'grid':
      return layoutGrid(childSizes, startX, startY, count);
    case 'radial':
      return layoutRadial(childSizes, startX, startY, count);
    case 'freeform':
      return layoutHorizontal(childSizes, startX, startY, GAP);
    default:
      return layoutHorizontal(childSizes, startX, startY, GAP);
  }
}

// ── Layout algorithms ───────────────────────────────────────

function layoutHorizontal(childSizes, startX, startY, gap = GAP) {
  const positions = [];
  let x = startX;
  const maxHeight = Math.max(...childSizes.map(s => s.height));
  // Single center line so start/end shapes (e.g. circles) align with middle shapes
  const centerY = startY + maxHeight / 2;

  for (const size of childSizes) {
    // Center each node on the same axis (centerY - height/2)
    const y = Math.round(centerY - size.height / 2);
    positions.push({
      x: Math.round(x),
      y,
      width: size.width,
      height: size.height,
    });
    x += size.width + gap;
  }
  return positions;
}

function layoutVertical(childSizes, startX, startY, gap = GAP) {
  const positions = [];
  let y = startY;
  const maxWidth = Math.max(...childSizes.map(s => s.width));
  // Single center line so start/end shapes (e.g. circles) align with middle shapes
  const centerX = startX + maxWidth / 2;

  for (const size of childSizes) {
    // Center each node on the same axis (centerX - width/2)
    const x = Math.round(centerX - size.width / 2);
    positions.push({
      x,
      y: Math.round(y),
      width: size.width,
      height: size.height,
    });
    y += size.height + gap;
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

/**
 * Use agent-provided placement: each child has x,y. Engine adds startX/startY offset.
 * If any child is missing x or y, fall back to horizontal so we don't break.
 */
function layoutFreeform(children, childSizes, startX, startY) {
  const allHaveXY = children.every(
    (c) => typeof c.x === 'number' && typeof c.y === 'number'
  );
  if (!allHaveXY) {
    return layoutHorizontal(childSizes, startX, startY, GAP);
  }
  return children.map((child, i) => {
    const size = childSizes[i] || { width: 150, height: 150 };
    return {
      x: Math.round(startX + Number(child.x)),
      y: Math.round(startY + Number(child.y)),
      width: size.width,
      height: size.height,
    };
  });
}

// ── Node emission (plan node → tool call) ───────────────────

function emitNode(node, x, y, allocWidth, allocHeight, toolCalls, idMap, genId, frameInfo, useExplicitPositions = false) {
  const nodeId = genId();

  switch (node.type) {
    case 'sticky': {
      const size = getNodeSize(node);
      const args = {
        text: node.text || '',
        color: resolveStickyColor(node.color),
        ...(frameInfo ? { frameId: frameInfo.id } : {}),
      };
      
      // Only add x,y if explicitly requested or inside a frame
      if (useExplicitPositions || frameInfo) {
        args.x = x;
        args.y = y;
      }
      
      toolCalls.push({
        name: 'createStickyNote',
        arguments: args,
      });
      idMap.set(nodeId, toolCalls.length - 1);
      break;
    }

    case 'shape': {
      const size = getNodeSize(node);
      const w = allocWidth || size.width;
      const h = allocHeight || size.height;
      const args = {
        type: node.shape || 'rect',
        width: w,
        height: h,
        color: resolveShapeColor(node.color),
        ...(node.text ? { text: node.text } : {}),
        ...(frameInfo ? { frameId: frameInfo.id } : {}),
      };
      
      // Only add x,y if explicitly requested or inside a frame
      // For circles, emit CENTER so alignment with rects (top-left) is correct on the executor
      if (useExplicitPositions || frameInfo) {
        const isCircle = (node.shape || '').toString().toLowerCase() === 'circle';
        if (isCircle) {
          args.x = x + w / 2;
          args.y = y + h / 2;
        } else {
          args.x = x;
          args.y = y;
        }
      }
      
      toolCalls.push({
        name: 'createShape',
        arguments: args,
      });
      idMap.set(nodeId, toolCalls.length - 1);
      break;
    }

    case 'text': {
      const args = {
        text: node.text || '',
      };
      
      // Only add x,y if explicitly requested
      if (useExplicitPositions) {
        args.x = x;
        args.y = y;
      }
      
      toolCalls.push({
        name: 'createText',
        arguments: args,
      });
      idMap.set(nodeId, toolCalls.length - 1);
      break;
    }

    case 'textBubble': {
      const size = getNodeSize(node);
      const args = {
        text: node.text || '',
        width: allocWidth || size.width,
        height: allocHeight || size.height,
      };
      
      // Only add x,y if explicitly requested
      if (useExplicitPositions) {
        args.x = x;
        args.y = y;
      }
      
      toolCalls.push({
        name: 'createTextBubble',
        arguments: args,
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
        // CRITICAL: Children must use same positioning mode as parent frame
        // If frame uses explicit positions, children should too (and vice versa)
        // Otherwise frame and children end up in different locations!
        emitNode(child, pos.x, pos.y, pos.width, pos.height, toolCalls, idMap, genId, null, useExplicitPositions);
      }

      emitConnectors(children, idMap, toolCalls);

      const childBounds = computeContentBoundsFromPositions(childPositions);
      const frameW = Math.max(allocWidth || 0, childBounds.width + FRAME_PADDING * 2);
      const frameH = Math.max(allocHeight || 0, childBounds.height + FRAME_PADDING * 2);

      const frameArgs = {
        title: node.title || node.text || '',
        width: frameW,
        height: frameH,
      };
      
      // CRITICAL FIX: If frame has children, it MUST include x,y coordinates
      // because children were emitted with explicit positions relative to this frame's position.
      // Without frame coordinates, executor places frame via free space separately from children,
      // causing frame and children to be in different locations!
      if (useExplicitPositions || frameInfo || children.length > 0) {
        frameArgs.x = x;
        frameArgs.y = y;
      }

      toolCalls.push({
        name: 'createFrame',
        arguments: frameArgs,
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
        emitNode(child, pos.x, pos.y, pos.width, pos.height, toolCalls, idMap, genId, frameInfo, useExplicitPositions);
      }
      emitConnectors(children, idMap, toolCalls);
      idMap.set(nodeId, -1);
      break;
    }

    default: {
      const size = getNodeSize(node);
      const args = {
        type: 'rect',
        width: allocWidth || size.width,
        height: allocHeight || size.height,
        color: resolveShapeColor(node.color),
        ...(node.text ? { text: node.text } : {}),
      };
      
      // Only add x,y if explicitly requested
      if (useExplicitPositions) {
        args.x = x;
        args.y = y;
      }
      
      toolCalls.push({
        name: 'createShape',
        arguments: args,
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

/**
 * Emit branch nodes (e.g. error/failure paths) and connectors from a main-flow node.
 * Branch is placed below (flow_horizontal) or to the side (flow_vertical) of the source node.
 */
function emitBranches(children, positions, layout, idMap, toolCalls, genId, frameInfo, useExplicitPositions) {
  const branchGap = FLOW_GAP;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const branch = child.branch;
    if (!branch || !branch.steps || branch.steps.length === 0) continue;

    const pos = positions[i];
    const sourceCenterX = pos.x + pos.width / 2;
    const sourceCenterY = pos.y + pos.height / 2;
    const steps = branch.steps;
    const direction = branch.direction || 'down';

    const stepSizes = steps.map(step => getNodeSize(step));
    let bx, by;

    if (layout === 'flow_horizontal') {
      if (direction === 'down') {
        by = pos.y + pos.height + branchGap;
        let yAcc = by;
        const branchPositions = stepSizes.map((size, j) => {
          const x = Math.round(sourceCenterX - size.width / 2);
          const y = Math.round(yAcc);
          yAcc += size.height + GAP;
          return { x, y, width: size.width, height: size.height };
        });
        for (let j = 0; j < steps.length; j++) {
          const stepPos = branchPositions[j];
          emitNode(steps[j], stepPos.x, stepPos.y, stepPos.width, stepPos.height, toolCalls, idMap, genId, frameInfo, useExplicitPositions);
          idMap.set(`plan_${i}_branch_${j}`, toolCalls.length - 1);
        }
      } else if (direction === 'up') {
        const totalBranchHeight = stepSizes.reduce((sum, s) => sum + s.height, 0) + GAP * (steps.length - 1);
        by = pos.y - totalBranchHeight - branchGap;
        let yAcc = by;
        for (let j = 0; j < steps.length; j++) {
          const size = stepSizes[j];
          bx = Math.round(sourceCenterX - size.width / 2);
          const stepY = Math.round(yAcc);
          yAcc += size.height + GAP;
          emitNode(steps[j], bx, stepY, size.width, size.height, toolCalls, idMap, genId, frameInfo, useExplicitPositions);
          idMap.set(`plan_${i}_branch_${j}`, toolCalls.length - 1);
        }
      } else {
        bx = direction === 'right' ? pos.x + pos.width + branchGap : pos.x - stepSizes[0].width - branchGap;
        let xAcc = direction === 'right' ? bx : bx + stepSizes[0].width;
        for (let j = 0; j < steps.length; j++) {
          const size = stepSizes[j];
          const stepX = Math.round(direction === 'right' ? xAcc : xAcc - size.width);
          const stepY = Math.round(sourceCenterY - size.height / 2);
          emitNode(steps[j], stepX, stepY, size.width, size.height, toolCalls, idMap, genId, frameInfo, useExplicitPositions);
          idMap.set(`plan_${i}_branch_${j}`, toolCalls.length - 1);
          xAcc += (direction === 'right' ? size.width + GAP : -(size.width + GAP));
        }
      }
    } else {
      // flow_vertical: branch goes left/right or up/down
      if (direction === 'right' || direction === 'left') {
        bx = direction === 'right' ? pos.x + pos.width + branchGap : pos.x - stepSizes[0].width - branchGap;
        let xAcc = direction === 'right' ? bx : bx + stepSizes[0].width;
        for (let j = 0; j < steps.length; j++) {
          const size = stepSizes[j];
          const stepX = Math.round(direction === 'right' ? xAcc : xAcc - size.width);
          const stepY = Math.round(sourceCenterY - size.height / 2);
          emitNode(steps[j], stepX, stepY, size.width, size.height, toolCalls, idMap, genId, frameInfo, useExplicitPositions);
          idMap.set(`plan_${i}_branch_${j}`, toolCalls.length - 1);
          xAcc += (direction === 'right' ? size.width + GAP : -(size.width + GAP));
        }
      } else {
        by = direction === 'down' ? pos.y + pos.height + branchGap : pos.y - stepSizes.reduce((s, sz) => s + sz.height, 0) - GAP * (steps.length - 1) - branchGap;
        let yAcc = by;
        for (let j = 0; j < steps.length; j++) {
          const size = stepSizes[j];
          bx = Math.round(sourceCenterX - size.width / 2);
          const stepY = Math.round(yAcc);
          emitNode(steps[j], bx, stepY, size.width, size.height, toolCalls, idMap, genId, frameInfo, useExplicitPositions);
          idMap.set(`plan_${i}_branch_${j}`, toolCalls.length - 1);
          yAcc += size.height + GAP;
        }
      }
    }

    const sourceIdx = findToolCallIndex(idMap, i, children);
    const branch0Idx = idMap.get(`plan_${i}_branch_0`);
    if (sourceIdx >= 0 && branch0Idx >= 0) {
      toolCalls.push({
        name: 'createConnector',
        arguments: { fromIndex: sourceIdx, toIndex: branch0Idx, style: 'straight' },
      });
    }
    for (let j = 0; j < steps.length - 1; j++) {
      const fromIdx = idMap.get(`plan_${i}_branch_${j}`);
      const toIdx = idMap.get(`plan_${i}_branch_${j + 1}`);
      if (fromIdx >= 0 && toIdx >= 0) {
        toolCalls.push({
          name: 'createConnector',
          arguments: { fromIndex: fromIdx, toIndex: toIdx, style: 'straight' },
        });
      }
    }
  }
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
    // Circles emit center; rects/stickies emit top-left
    const isCircle = tc.name === 'createShape' && (args.type || '').toString().toLowerCase() === 'circle';
    if (isCircle) {
      const halfW = w / 2;
      const halfH = h / 2;
      minX = Math.min(minX, x - halfW);
      minY = Math.min(minY, y - halfH);
      maxX = Math.max(maxX, x + halfW);
      maxY = Math.max(maxY, y + halfH);
    } else {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
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
