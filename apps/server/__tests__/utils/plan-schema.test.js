/**
 * Tests for plan-schema (layout types, node types, color maps, tool definition)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  LAYOUT_TYPES,
  NODE_TYPES,
  STICKY_COLOR_MAP,
  SHAPE_COLOR_MAP,
  CREATE_PLAN_TOOL,
} from '../../utils/plan-schema.js';

describe('plan-schema', () => {
  describe('LAYOUT_TYPES', () => {
    it('includes expected layout types', () => {
      assert.ok(Array.isArray(LAYOUT_TYPES));
      assert.ok(LAYOUT_TYPES.includes('columns'));
      assert.ok(LAYOUT_TYPES.includes('grid'));
      assert.ok(LAYOUT_TYPES.includes('freeform'));
      assert.ok(LAYOUT_TYPES.includes('stack_vertical'));
      assert.ok(LAYOUT_TYPES.includes('flow_horizontal'));
    });

    it('has no duplicates', () => {
      const set = new Set(LAYOUT_TYPES);
      assert.strictEqual(set.size, LAYOUT_TYPES.length);
    });
  });

  describe('NODE_TYPES', () => {
    it('includes leaf and container types', () => {
      assert.ok(Array.isArray(NODE_TYPES));
      assert.ok(NODE_TYPES.includes('sticky'));
      assert.ok(NODE_TYPES.includes('shape'));
      assert.ok(NODE_TYPES.includes('frame'));
      assert.ok(NODE_TYPES.includes('composition'));
    });
  });

  describe('STICKY_COLOR_MAP', () => {
    it('maps names to hex codes', () => {
      assert.strictEqual(STICKY_COLOR_MAP.yellow, '#FFF59D');
      assert.strictEqual(STICKY_COLOR_MAP.pink, '#F48FB1');
      assert.strictEqual(STICKY_COLOR_MAP.blue, '#81D4FA');
      assert.strictEqual(STICKY_COLOR_MAP.green, '#A5D6A7');
      assert.strictEqual(STICKY_COLOR_MAP.orange, '#FFCC80');
    });

    it('has exactly 5 sticky colors', () => {
      assert.strictEqual(Object.keys(STICKY_COLOR_MAP).length, 5);
    });
  });

  describe('SHAPE_COLOR_MAP', () => {
    it('maps common names to hex', () => {
      assert.strictEqual(SHAPE_COLOR_MAP.red, '#EF4444');
      assert.strictEqual(SHAPE_COLOR_MAP.blue, '#3B82F6');
      assert.strictEqual(SHAPE_COLOR_MAP.green, '#10B981');
    });

    it('includes black and white', () => {
      assert.strictEqual(SHAPE_COLOR_MAP.black, '#000000');
      assert.strictEqual(SHAPE_COLOR_MAP.white, '#FFFFFF');
    });
  });

  describe('CREATE_PLAN_TOOL', () => {
    it('is a function tool definition', () => {
      assert.strictEqual(CREATE_PLAN_TOOL.type, 'function');
      assert.strictEqual(CREATE_PLAN_TOOL.function.name, 'createPlan');
      assert.ok(CREATE_PLAN_TOOL.function.description);
    });

    it('parameters include title, layout, children', () => {
      const params = CREATE_PLAN_TOOL.function.parameters;
      assert.ok(params.required.includes('title'));
      assert.ok(params.required.includes('layout'));
      assert.ok(params.required.includes('children'));
      assert.ok(params.properties.layout.enum === LAYOUT_TYPES);
    });
  });
});
