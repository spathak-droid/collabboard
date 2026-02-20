# Resize Anchor Point Issue - Konva Transformer

## Problem Description

When resizing objects (rectangles, circles, sticky notes, etc.) using Konva Transformer handles, the objects do not resize smoothly around the cursor position. The resize feels "off" - objects jump or shift unexpectedly during resize, especially when resizing from corner handles.

**Expected Behavior:**
- When dragging a corner resize handle, the opposite corner should remain fixed in place
- The object should resize smoothly around the cursor/anchor point
- No jumping or offset during resize

**Actual Behavior:**
- Objects shift position unexpectedly during resize
- The resize feels inaccurate and "off by some amount"
- Objects don't maintain the correct anchor point

## Tech Stack

- **Framework:** Next.js 14 + React + TypeScript
- **Canvas Library:** Konva.js with react-konva
- **Transform System:** Konva.Transformer component
- **State Management:** Yjs for real-time sync, Zustand for local UI state

## Current Implementation

### Component Structure

Objects are rendered as Konva Groups with child shapes (Rect, Circle, Line, etc.). The Transformer is attached to the Group node.

```typescript
<Group
  ref={groupRef}
  x={data.x}
  y={data.y}
  rotation={data.rotation}
  draggable={isDraggable}
  onTransformStart={handleTransformStart}
  onTransform={handleTransform}
  onTransformEnd={handleTransformEnd}
>
  <Rect
    x={0}
    y={0}
    width={data.width}
    height={data.height}
    // ... other props
  />
</Group>

{isSelected && (
  <Transformer
    ref={transformerRef}
    centeredScaling={false}
    centeredRotation={false}
    boundBoxFunc={(oldBox, newBox) => {
      if (newBox.width < 20 || newBox.height < 20) {
        return oldBox;
      }
      return newBox;
    }}
  />
)}
```

### Current Transform End Handler

```typescript
const handleTransformEnd = () => {
  const node = groupRef.current;
  if (!node || !baseDimensionsRef.current) return;

  const scaleX = node.scaleX();
  const scaleY = node.scaleY();
  const newWidth = Math.max(20, baseDimensionsRef.current.width * scaleX);
  const newHeight = Math.max(20, baseDimensionsRef.current.height * scaleY);

  // Get current position (Konva has adjusted it to keep opposite corner fixed)
  const currentX = node.x();
  const currentY = node.y();
  const finalRotation = node.rotation();

  // Reset scale to 1
  node.scaleX(1);
  node.scaleY(1);

  // Update child Rect dimensions imperatively so position is correct
  const rectNode = node.findOne('Rect');
  if (rectNode) {
    rectNode.width(newWidth);
    rectNode.height(newHeight);
  }

  // Position should already be correct from Konva's adjustment, but verify
  // by reading it again after updating dimensions
  const finalX = node.x();
  const finalY = node.y();

  // Force Transformer to recalculate bounding box
  if (transformerRef.current) {
    transformerRef.current.forceUpdate();
    transformerRef.current.getLayer()?.batchDraw();
  }

  window.dispatchEvent(new Event('object-transform-end'));
  baseDimensionsRef.current = null;

  onUpdate({
    width: newWidth,
    height: newHeight,
    x: finalX,
    y: finalY,
    rotation: finalRotation,
  });
};
```

### Transform Start Handler

```typescript
const handleTransformStart = () => {
  baseDimensionsRef.current = { width: data.width, height: data.height };
  window.dispatchEvent(new Event('object-transform-start'));
};
```

### Transform Handler (Live Updates)

```typescript
const handleTransform = () => {
  const node = groupRef.current;
  if (node && onTransformMove && baseDimensionsRef.current) {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const liveWidth = baseDimensionsRef.current.width * scaleX;
    const liveHeight = baseDimensionsRef.current.height * scaleY;
    onTransformMove(data.id, node.x(), node.y(), node.rotation(), { 
      width: liveWidth, 
      height: liveHeight 
    });
  }
};
```

## What Has Been Tried

1. **Reading position before resetting scale** - Captured position when Konva has already adjusted it for anchor point
2. **Updating child node dimensions imperatively** - Updated Rect/Circle dimensions before reading final position
3. **Configuring Transformer with `centeredScaling={false}`** - Ensures corner anchors are used instead of center anchors
4. **Reading position twice** - Once before scale reset, once after dimension update
5. **Forcing Transformer update** - Called `forceUpdate()` and `batchDraw()` after changes

## Key Questions

1. **Is the position calculation correct?** Should we be calculating position differently based on which anchor was dragged?

2. **Timing issue?** Is there a timing problem with when we read position vs when we update dimensions?

3. **Anchor point detection?** Do we need to detect which anchor was dragged and calculate position adjustment manually?

4. **Konva Transformer behavior?** How exactly does Konva Transformer adjust position during resize? Does it maintain the opposite corner, or use a different anchor strategy?

5. **Scale reset order?** Should we reset scale before or after updating dimensions? Should we update dimensions before or after reading position?

## Additional Context

- Objects can be rotated (rotation property)
- Objects are synced in real-time via Yjs (updates happen on transform end, not during transform)
- Multiple object types: Rectangle, Circle, Triangle, Star, StickyNote, Frame, TextBubble, Line
- All objects follow the same pattern but some have different child node structures (e.g., Triangle uses Line with points array, Circle uses radius instead of width/height)

## Request

Please provide a solution that:
1. Ensures objects resize smoothly around the cursor/anchor point
2. Maintains the opposite corner fixed when resizing from corners
3. Works correctly with rotated objects
4. Is compatible with the current architecture (Group + Transformer + child shapes)
5. Explains why the current approach isn't working and what the correct approach should be

Thank you!
