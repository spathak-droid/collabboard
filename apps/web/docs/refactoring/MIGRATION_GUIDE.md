# Board Page Migration Guide

## Status: In Progress

The board page migration is partially complete. The hooks have been created and imported, but old function definitions still exist and need to be removed.

## Current Issues

1. **Duplicate function definitions** - Old functions still exist alongside hooks
2. **Missing state variables** - Some state moved to hooks needs to be accessed via hooks
3. **Function references** - Need to update all calls to use hook functions

## Migration Steps Remaining

### Step 1: Remove Old Function Definitions

Remove these duplicate functions (now provided by hooks):
- `getObjectBounds` (lines ~603-654) → Use `getObjectBounds` from `useObjectBounds()`
- `getConnectedObjectIds` (lines ~656-753) → Use `getConnectedObjectIds` from `useObjectBounds()`
- `showFrameWarning` (lines ~913-921) → Use `frameManagement.showFrameWarning`
- `findContainingFrame` (lines ~924-935) → Use `frameManagement.findContainingFrame`
- `isObjectWithinFrame` (lines ~938-968) → Use `frameManagement.isObjectWithinFrame`
- `updateShapeAndConnectors` (lines ~971-1035) → Use `manipulation.updateShapeAndConnectors`
- `handleShapeDragMove` (lines ~1039-1065) → Use `manipulation.handleShapeDragMove`
- `handleShapeTransformMove` (lines ~1066-1072) → Use `manipulation.handleShapeTransformMove`
- `handleAnchorMouseDown` (lines ~1270-1342) → Use `connectorDrawing.handleAnchorMouseDown`
- `handleConnectorClick` (lines ~1352-1393) → Use `connectorDrawing.handleConnectorClick`
- `handleEndpointDrag` (lines ~1395-1413) → Use `connectorDrawing.handleEndpointDrag`
- `handleEndpointDragEnd` (lines ~1414-1449) → Use `connectorDrawing.handleEndpointDragEnd`
- `intersectsRect` (lines ~1451-1459) → Use `intersectsRect` from `useObjectBounds()`
- `copySelectedObjects` (lines ~1817-1839) → Use `clipboard.copySelectedObjects`
- `pasteClipboardObjects` (lines ~1840-1869) → Use `clipboard.pasteClipboardObjects`
- `duplicateSelectedObjects` (lines ~1932-1943) → Use `clipboard.duplicateSelectedObjects`

### Step 2: Update State Variable References

Replace these state variables:
- `frameWarningVisible` → `frameManagement.frameWarningVisible`
- `copyToastVisible` → `clipboard.copyToastVisible`
- `isDrawingLine` → `connectorDrawing.isDrawingLine`
- `drawingLineId` → `connectorDrawing.drawingLineId`
- `highlightedAnchor` → `connectorDrawing.highlightedAnchor`
- `hoveredShapeId` → `connectorDrawing.hoveredShapeId`

### Step 3: Update Function Calls

Replace all calls to old functions with hook equivalents:
- `getObjectBounds(obj, map)` → `getObjectBounds(obj, map)` (same name, from hook)
- `getConnectedObjectIds(ids, objects)` → `getConnectedObjectIds(ids, objects)` (same name, from hook)
- `findContainingFrame(id)` → `frameManagement.findContainingFrame(id)`
- `isObjectWithinFrame(obj, frame, x, y)` → `frameManagement.isObjectWithinFrame(obj, frame, x, y)`
- `showFrameWarning()` → `frameManagement.showFrameWarning()`
- `updateShapeAndConnectors(id, updates)` → `manipulation.updateShapeAndConnectors(id, updates)`
- `handleShapeDragMove(id, x, y)` → `manipulation.handleShapeDragMove(id, x, y)`
- `handleShapeTransformMove(id, x, y, rot, dims)` → `manipulation.handleShapeTransformMove(id, x, y, rot, dims)`
- `handleAnchorMouseDown(id, anchor, x, y)` → `connectorDrawing.handleAnchorMouseDown(id, anchor, x, y)`
- `handleConnectorClick(e)` → `connectorDrawing.handleConnectorClick(canvasX, canvasY)`
- `handleEndpointDrag(lineId, endpoint, x, y)` → `connectorDrawing.handleEndpointDrag(lineId, endpoint, x, y)`
- `handleEndpointDragEnd(lineId, endpoint, x, y)` → `connectorDrawing.handleEndpointDragEnd(lineId, endpoint, x, y)`
- `copySelectedObjects()` → `clipboard.copySelectedObjects()`
- `pasteClipboardObjects()` → `clipboard.pasteClipboardObjects()`
- `duplicateSelectedObjects()` → `clipboard.duplicateSelectedObjects()`

### Step 4: Remove Old State Declarations

Remove these state declarations (now in hooks):
- `const [isDrawingLine, setIsDrawingLine] = useState(false);`
- `const [drawingLineId, setDrawingLineId] = useState<string | null>(null);`
- `const [highlightedAnchor, setHighlightedAnchor] = useState<...>(null);`
- `const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);`
- `const drawingStartedAtRef = useRef<number>(0);`
- `const liveDragRef = useRef<Map<...>>(new Map());`
- `const liveTransformRef = useRef<Map<...>>(new Map());`
- `const [, setDragTick] = useState(0);`
- `const [copyToastVisible, setCopyToastVisible] = useState(false);`
- `const copyToastTimerRef = useRef<...>(null);`
- `const [frameWarningVisible, setFrameWarningVisible] = useState(false);`
- `const frameWarningTimeoutRef = useRef<...>(null);`

### Step 5: Update handleMouseMove

Update `handleMouseMove` to use connector drawing hook:
```typescript
// Old:
if (isDrawingLine && drawingLineId) {
  // ... update line
}

// New:
if (connectorDrawing.isDrawingLine && connectorDrawing.drawingLineId) {
  const x = (pointerPosition.x - position.x) / scale;
  const y = (pointerPosition.y - position.y) / scale;
  connectorDrawing.handleDrawingMouseMove(x, y);
}
```

### Step 6: Update Keyboard Handlers

Update keyboard handlers to use hooks:
```typescript
// Escape cancels line drawing
if (e.key === 'Escape' && connectorDrawing.isDrawingLine && connectorDrawing.drawingLineId) {
  connectorDrawing.cancelLineDrawing();
  return;
}

// Copy/paste
if (isMetaOrCtrl && e.key === 'c') {
  clipboard.copySelectedObjects();
}
if (isMetaOrCtrl && e.key === 'v') {
  clipboard.pasteClipboardObjects();
}
```

### Step 7: Update Canvas onClick

Update canvas onClick handler:
```typescript
onClick={(e) => {
  if (connectorDrawing.isDrawingLine) {
    const stage = e.target.getStage();
    const pointerPosition = stage?.getPointerPosition();
    if (pointerPosition) {
      const x = (pointerPosition.x - position.x) / scale;
      const y = (pointerPosition.y - position.y) / scale;
      connectorDrawing.handleConnectorClick(x, y);
    }
  } else {
    handleCanvasClick(e);
  }
}}
```

### Step 8: Update Object Rendering

Update object rendering to use hook functions:
- Replace `updateShapeAndConnectors` → `manipulation.updateShapeAndConnectors`
- Replace `handleShapeDragMove` → `manipulation.handleShapeDragMove`
- Replace `handleShapeTransformMove` → `manipulation.handleShapeTransformMove`
- Replace `handleAnchorMouseDown` → `connectorDrawing.handleAnchorMouseDown`
- Replace `highlightedAnchor` → `connectorDrawing.highlightedAnchor`
- Replace `isDrawingLine` → `connectorDrawing.isDrawingLine`
- Replace `hoveredShapeId` → `connectorDrawing.hoveredShapeId`
- Replace `setHoveredShapeId` → `connectorDrawing.setHoveredShapeId`

### Step 9: Update Frame Warning Display

Replace:
```typescript
{frameWarningVisible && (
  <div>Warning message</div>
)}
```

With:
```typescript
{frameManagement.frameWarningVisible && (
  <div>Warning message</div>
)}
```

### Step 10: Update Copy Toast Display

Replace:
```typescript
{copyToastVisible && (
  <div>Copied!</div>
)}
```

With:
```typescript
{clipboard.copyToastVisible && (
  <div>Copied!</div>
)}
```

## Testing Checklist

After migration:
- [ ] Build passes (`npm run build`)
- [ ] No TypeScript errors
- [ ] Object manipulation works (drag, resize, rotate)
- [ ] Frame containment works
- [ ] Connector drawing works
- [ ] Copy/paste works
- [ ] Keyboard shortcuts work
- [ ] Frame warnings display correctly
- [ ] Copy toast displays correctly

## Estimated Lines Removed

- ~400 lines of duplicate function definitions
- ~50 lines of duplicate state declarations
- **Total: ~450 lines removed**

## Estimated Final Size

- Current: 2,453 lines
- After migration: ~2,000 lines
- After UI component extraction: ~400-500 lines
