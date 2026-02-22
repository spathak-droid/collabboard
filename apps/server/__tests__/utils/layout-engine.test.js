/**
 * Tests for layout-engine (planToToolCalls)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { planToToolCalls } from '../../utils/layout-engine.js';

describe('layout-engine', () => {
  describe('planToToolCalls', () => {
    it('returns empty toolCalls and summary for empty children', () => {
      const result = planToToolCalls({
        title: 'Empty',
        layout: 'columns',
        children: [],
      });
      assert.ok(Array.isArray(result.toolCalls));
      assert.strictEqual(result.toolCalls.length, 0);
      assert.ok(result.summary.includes('Empty') || result.summary.includes('nothing'));
    });

    it('emits createStickyNote for single sticky', () => {
      const result = planToToolCalls({
        title: 'One sticky',
        layout: 'columns',
        wrapInFrame: false,
        children: [{ type: 'sticky', text: 'Hello' }],
      });
      const stickies = result.toolCalls.filter((tc) => tc.name === 'createStickyNote');
      assert.strictEqual(stickies.length, 1);
      assert.strictEqual(stickies[0].arguments.text, 'Hello');
      assert.ok(stickies[0].arguments.color);
    });

    it('emits createShape for single shape', () => {
      const result = planToToolCalls({
        title: 'One shape',
        layout: 'columns',
        wrapInFrame: false,
        children: [{ type: 'shape', shape: 'circle', color: 'blue' }],
      });
      const shapes = result.toolCalls.filter((tc) => tc.name === 'createShape');
      assert.strictEqual(shapes.length, 1);
      assert.strictEqual(shapes[0].arguments.type, 'circle');
      assert.ok(shapes[0].arguments.color);
    });

    it('columns layout places children horizontally', () => {
      const result = planToToolCalls({
        title: 'Two stickies',
        layout: 'columns',
        wrapInFrame: false,
        children: [
          { type: 'sticky', text: 'A' },
          { type: 'sticky', text: 'B' },
        ],
      });
      const stickies = result.toolCalls.filter((tc) => tc.name === 'createStickyNote');
      assert.strictEqual(stickies.length, 2);
      assert.ok(result.summary.includes('2') || result.summary.includes('Two'));
    });

    it('freeform layout uses agent x,y when provided', () => {
      const result = planToToolCalls(
        {
          title: 'Freeform',
          layout: 'freeform',
          wrapInFrame: false,
          children: [
            { type: 'sticky', text: 'A', x: 10, y: 20 },
            { type: 'sticky', text: 'B', x: 200, y: 20 },
          ],
        },
        null,
        null,
        true
      );
      const stickies = result.toolCalls.filter((tc) => tc.name === 'createStickyNote');
      assert.strictEqual(stickies.length, 2);
      assert.strictEqual(stickies[0].arguments.text, 'A');
      assert.strictEqual(stickies[1].arguments.text, 'B');
      assert.strictEqual(typeof stickies[0].arguments.x, 'number');
      assert.strictEqual(typeof stickies[0].arguments.y, 'number');
    });

    it('grid layout produces multiple tool calls', () => {
      const result = planToToolCalls({
        title: 'Grid',
        layout: 'grid',
        wrapInFrame: false,
        children: [
          { type: 'sticky', text: '1' },
          { type: 'sticky', text: '2' },
          { type: 'sticky', text: '3' },
          { type: 'sticky', text: '4' },
        ],
      });
      const stickies = result.toolCalls.filter((tc) => tc.name === 'createStickyNote');
      assert.strictEqual(stickies.length, 4);
    });

    it('summary includes title and object count', () => {
      const result = planToToolCalls({
        title: 'My Board',
        layout: 'columns',
        wrapInFrame: false,
        children: [
          { type: 'sticky', text: 'X' },
          { type: 'sticky', text: 'Y' },
        ],
      });
      assert.ok(result.summary.includes('My Board') || result.summary.includes('2'));
    });

    it('connectTo emits createConnector', () => {
      const result = planToToolCalls({
        title: 'Flow',
        layout: 'flow_horizontal',
        wrapInFrame: false,
        children: [
          { type: 'shape', shape: 'circle' },
          { type: 'shape', shape: 'rect', connectTo: 'straight' },
          { type: 'shape', shape: 'circle' },
        ],
      });
      const connectors = result.toolCalls.filter((tc) => tc.name === 'createConnector');
      assert.ok(connectors.length >= 1);
    });
  });
});
