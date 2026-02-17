# Whiteboard MVP - Implementation Prompt

Use this prompt to kick off or guide implementation. All items below are **hard gates**—the MVP is not complete until every checkbox passes.

---

## Project Context

Build a **collaborative whiteboard platform** with bulletproof real-time multiplayer. Core principle: *A simple whiteboard with perfect sync beats a feature-rich board with broken collaboration.*

**Tech Stack (non-negotiable):**
- Next.js 14 + TypeScript + Konva.js
- Firebase Auth (Email, Google, GitHub)
- Yjs + Hocuspocus (Railway) for CRDT sync
- Supabase Postgres for persistence
- Zustand for local UI state
- tRPC for type-safe API
- Vercel (frontend) + Railway (WebSocket server)

---

## Hard Gate Requirements

All items below are **required** to pass. No exceptions.

### ☐ 1. Infinite Board with Pan/Zoom

- Infinite canvas (no boundaries)
- **Pan:** Click and drag background
- **Zoom:** Mouse wheel, 10% increments, 10%–500% range
- Zoom toward cursor position
- Double-click background → reset to (0,0) at 100%
- Must be smooth at 60fps with 1000+ objects

### ☐ 2. Sticky Notes with Editable Text

- Create: Click tool, then click canvas to place
- Default: 200×200px, yellow (#FFF59D)
- Double-click to edit text (blinking cursor, wrap at boundaries)
- Escape or click outside to exit edit mode
- Color picker: 5 colors (yellow, pink, blue, green, orange)
- Font: 16px sans-serif, black text
- Text changes sync in <200ms via Yjs

### ☐ 3. At Least One Shape Type

Implement **at least one** of:
- **Rectangle:** 150×100px default
- **Circle:** 100px diameter default  
- **Line:** 200px length default

Properties: solid fill (same palette as stickies), black stroke, 2px stroke width.

### ☐ 4. Create, Move, and Edit Objects

- **Create:** Tool selection → click canvas → object appears
- **Move:** Click and drag any object (smooth, no stutter)
- **Resize:** Corner handles when selected (min 20×20px)
- **Rotate:** Rotation handle at top when selected
- **Select:** Click object (blue 2px border), click background to deselect
- **Multi-select:** Shift-click, drag-to-select rectangle
- **Delete:** Delete/Backspace key or toolbar button
- Sync position/size/rotation on **transform end**, not during drag

### ☐ 5. Real-Time Sync Between 2+ Users

- Yjs CRDT for conflict resolution
- WebSocket (Hocuspocus) for immediate push
- Updates visible on other clients in <200ms
- No data loss with concurrent edits
- Offline edits merge automatically on reconnect
- Disconnect banner + auto-reconnect every 2s

### ☐ 6. Multiplayer Cursors with Name Labels

- SVG cursor + user display name
- Real-time position (throttle: max 60 updates/sec)
- Deterministic color per user (from userId hash)
- Cursor hides after 5s idle
- Visible within 100ms of movement

### ☐ 7. Presence Awareness

- Fixed panel, top-right: "Online (N)"
- List: avatar (first letter), name, colored indicator
- Current user marked as "(You)"
- Updates in <500ms on join/leave
- Show first 15 users, then "... and N more"

---

## Additional Mandatory Requirements

- **Authentication:** Firebase Auth (email/password, Google, GitHub). Protected board routes.
- **Persistence:** Auto-save to Supabase every 30s. Load latest snapshot on board open.
- **Deployment:** Vercel (frontend) + Railway (WebSocket). Public URL.
- **TDD:** Test cases for every component. Red → Green → Refactor.

---

## Implementation Order (Recommended)

1. **Foundation:** Next.js app, Firebase Auth, Supabase, folder structure
2. **Canvas:** Konva Stage, pan/zoom, infinite canvas
3. **Objects:** Sticky notes (create, edit, color) + one shape type
4. **Manipulation:** Move, resize, rotate, selection, delete
5. **Yjs + Hocuspocus:** Wire up CRDT sync, WebSocket provider
6. **Multiplayer:** Cursors (awareness), presence panel
7. **Persistence:** Auto-save, load snapshot
8. **Polish:** Disconnect handling, deploy

---

## Success Criteria

- [ ] 2 users can edit the same board simultaneously with no data loss
- [ ] All objects sync within 200ms
- [ ] Canvas stays at 60fps with 1000+ objects
- [ ] Page loads in <3 seconds
- [ ] All hard gate checkboxes pass
- [ ] Deployed and publicly accessible

---

## Out of Scope (Week 1)

Do not build: connectors/arrows, frames, copy/paste, undo/redo, export, comments, version history, mobile, permissions.

---

## Reference

Full specifications: `Whiteboard_MVP_PRD.md`  
Project rules: `.cursor/rules/whiteboard-mvp-prd.mdc`
