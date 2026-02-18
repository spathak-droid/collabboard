# Refactoring Plan for Large Board Pages

## Overview

The board pages (`board/[id]/page.tsx` - 2,453 lines and `canvas/[id]/page.tsx` - 1,367 lines) are too large and need refactoring for maintainability, testability, and performance.

## Current Issues

### 1. **board/[id]/page.tsx** (2,453 lines)
- **108+ hooks** (useState, useCallback, useMemo, useEffect)
- **15+ state variables** mixed together
- **Complex business logic** intertwined with UI rendering
- **Large utility functions** embedded in component
- **Multiple responsibilities**: object manipulation, frame management, connectors, copy/paste, selection, rendering

### 2. **canvas/[id]/page.tsx** (1,367 lines)
- Similar structure but slightly smaller
- Duplicate logic with board page
- Could potentially be consolidated

## Refactoring Strategy

### Phase 1: Extract Custom Hooks (Priority: High)

#### 1.1 `useObjectManipulation.ts`
**Location:** `apps/web/src/lib/hooks/useObjectManipulation.ts`

**Extract:**
- `handleShapeDragEnd` logic
- `handleShapeDragMove` logic  
- `handleShapeTransformMove` logic
- `updateShapeAndConnectors` logic
- Object update operations

**Benefits:**
- Reusable across board and canvas pages
- Easier to test
- Clear separation of concerns

#### 1.2 `useObjectBounds.ts`
**Location:** `apps/web/src/lib/hooks/useObjectBounds.ts`

**Extract:**
- `getObjectBounds` function (lines 410-461)
- `getConnectedObjectIds` function (lines 463-573)
- Bounds calculation utilities

**Benefits:**
- Pure functions, easy to test
- Reusable across components

#### 1.3 `useFrameManagement.ts`
**Location:** `apps/web/src/lib/hooks/useFrameManagement.ts`

**Extract:**
- `findContainingFrame` logic
- `isObjectWithinFrame` logic
- `showFrameWarning` logic
- Frame creation from selection
- Frame containment checks

**Benefits:**
- Isolates complex frame logic
- Easier to maintain and test

#### 1.4 `useConnectorDrawing.ts`
**Location:** `apps/web/src/lib/hooks/useConnectorDrawing.ts`

**Extract:**
- `handleConnectorClick` logic
- `handleEndpointDrag` logic
- `handleEndpointDragEnd` logic
- `handleAnchorMouseDown` logic
- Line drawing state management

**Benefits:**
- Separates connector logic from main component
- Easier to test line drawing behavior

#### 1.5 `useClipboardOperations.ts`
**Location:** `apps/web/src/lib/hooks/useClipboardOperations.ts`

**Extract:**
- `copySelectedObjects` function
- `pasteClipboardObjects` function
- `cloneObjectsAtPoint` function
- Clipboard state management

**Benefits:**
- Isolated clipboard logic
- Easier to test copy/paste functionality

#### 1.6 `useBoardMetadata.ts`
**Location:** `apps/web/src/lib/hooks/useBoardMetadata.ts`

**Extract:**
- Board title management
- Owner UID tracking
- Board members fetching
- Global online users tracking
- Presence polling

**Benefits:**
- Separates data fetching from UI
- Easier to test board metadata logic

### Phase 2: Extract Utility Functions (Priority: High)

#### 2.1 `objectBounds.ts`
**Location:** `apps/web/src/lib/utils/objectBounds.ts`

**Extract:**
- `getObjectBounds` (with rotation support)
- `getConnectedObjectIds`
- `intersectsRect`
- `pointInBounds`

**Benefits:**
- Pure functions, easy to test
- Reusable across codebase

#### 2.2 `frameUtils.ts`
**Location:** `apps/web/src/lib/utils/frameUtils.ts`

**Extract:**
- `findContainingFrame`
- `isObjectWithinFrame`
- `getFrameBounds`
- Frame containment checks

**Benefits:**
- Centralized frame logic
- Easier to maintain

#### 2.3 `connectorUtils.ts` (Already exists, enhance)
**Location:** `apps/web/src/lib/utils/connectors.ts`

**Enhance:**
- Already has `findNearestAnchor` and `resolveLinePoints`
- Add more connector utilities if needed

### Phase 3: Extract UI Components (Priority: Medium)

#### 3.1 `ObjectRenderer.tsx`
**Location:** `apps/web/src/components/canvas/ObjectRenderer.tsx`

**Extract:**
- Object rendering logic (lines 2100-2429)
- Map objects to components
- Handle selection and drag callbacks

**Benefits:**
- Separates rendering from business logic
- Easier to optimize rendering

#### 3.2 `BoardHeader.tsx`
**Location:** `apps/web/src/components/board/BoardHeader.tsx`

**Extract:**
- Header bar (lines 1900-2027)
- Board title editing
- Collaborators list
- Zoom/object count display

**Benefits:**
- Reusable header component
- Cleaner main component

#### 3.3 `CollaboratorsList.tsx`
**Location:** `apps/web/src/components/board/CollaboratorsList.tsx`

**Extract:**
- Collaborators dropdown (lines 1950-2009)
- User status indicators
- User presence logic

**Benefits:**
- Reusable component
- Easier to style and maintain

### Phase 4: Consolidate Duplicate Logic (Priority: Medium)

#### 4.1 Compare `board/[id]/page.tsx` and `canvas/[id]/page.tsx`
- Identify duplicate code
- Extract shared logic to hooks
- Consider consolidating into single page with route-based differences

**Benefits:**
- Single source of truth
- Less code to maintain

### Phase 5: Optimize Performance (Priority: Low)

#### 5.1 Memoization Review
- Review all `useMemo` and `useCallback` dependencies
- Ensure proper memoization of expensive computations
- Optimize re-renders

#### 5.2 Component Splitting
- Split large render functions
- Use React.memo where appropriate
- Lazy load heavy components

## Implementation Order

1. **Week 1: Extract Hooks**
   - `useObjectBounds.ts`
   - `useObjectManipulation.ts`
   - `useFrameManagement.ts`

2. **Week 2: Extract More Hooks**
   - `useConnectorDrawing.ts`
   - `useClipboardOperations.ts`
   - `useBoardMetadata.ts`

3. **Week 3: Extract Components**
   - `ObjectRenderer.tsx`
   - `BoardHeader.tsx`
   - `CollaboratorsList.tsx`

4. **Week 4: Consolidate & Optimize**
   - Compare and consolidate duplicate logic
   - Performance optimization
   - Testing

## Expected Results

### Before Refactoring:
- `board/[id]/page.tsx`: **2,453 lines**
- `canvas/[id]/page.tsx`: **1,367 lines**
- **Total: 3,820 lines**

### After Refactoring:
- `board/[id]/page.tsx`: **~400-500 lines** (UI orchestration)
- `canvas/[id]/page.tsx`: **~300-400 lines** (UI orchestration)
- **6-8 custom hooks**: ~100-200 lines each
- **3-4 utility files**: ~50-150 lines each
- **3-4 UI components**: ~100-200 lines each
- **Total: ~2,500-3,000 lines** (better organized)

## Benefits

1. **Maintainability**: Smaller, focused files are easier to understand
2. **Testability**: Hooks and utilities can be tested in isolation
3. **Reusability**: Hooks can be shared between board and canvas pages
4. **Performance**: Better memoization and component splitting
5. **Developer Experience**: Easier to find and modify code
6. **Code Quality**: Clear separation of concerns

## Testing Strategy

1. **Unit Tests**: Test each hook and utility function independently
2. **Integration Tests**: Test hook interactions
3. **Component Tests**: Test UI components in isolation
4. **E2E Tests**: Ensure refactoring doesn't break functionality

## Migration Strategy

1. Create new hooks/components alongside existing code
2. Gradually migrate functionality
3. Test thoroughly at each step
4. Remove old code once migration is complete
5. Update imports across codebase

## Notes

- Keep backward compatibility during migration
- Document hook APIs with JSDoc
- Follow existing code patterns and conventions
- Ensure TypeScript types are properly defined
- Maintain performance requirements (60 FPS, <100ms sync)
