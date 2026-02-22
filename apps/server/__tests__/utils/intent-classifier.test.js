/**
 * Tests for intent-classifier (executeFromIntent — sync execution from classified intent)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { executeFromIntent } from '../../utils/intent-classifier.js';

const boardWithShapes = {
  objects: [
    { id: 'obj-1', type: 'circle', color: '#EF4444', x: 100, y: 100 },
    { id: 'obj-2', type: 'star', fill: '#3B82F6', x: 200, y: 200 },
    { id: 'obj-3', type: 'sticky', color: '#FFF59D', x: 300, y: 300 },
  ],
  selectedIds: [],
};

describe('intent-classifier executeFromIntent', () => {
  describe('routing to agent (returns null)', () => {
    it('returns null for CONVERSATION', () => {
      const result = executeFromIntent({ operation: 'CONVERSATION' }, null);
      assert.strictEqual(result, null);
    });

    it('returns null for CREATIVE', () => {
      const result = executeFromIntent(
        { operation: 'CREATIVE', creativeDescription: 'kanban board' },
        null
      );
      assert.strictEqual(result, null);
    });

    it('returns null for FIT_FRAME_TO_CONTENTS', () => {
      const result = executeFromIntent(
        { operation: 'FIT_FRAME_TO_CONTENTS', objectType: 'frame' },
        boardWithShapes
      );
      assert.strictEqual(result, null);
    });

    it('returns null when isMultiStep is true', () => {
      const result = executeFromIntent(
        { operation: 'CREATE', isMultiStep: true, objectType: 'shape', shapeType: 'circle' },
        null
      );
      assert.strictEqual(result, null);
    });
  });

  describe('CREATE', () => {
    it('generates createShape for shape intent', () => {
      const result = executeFromIntent(
        {
          operation: 'CREATE',
          objectType: 'shape',
          shapeType: 'star',
          quantity: 1,
          color: '#10B981',
        },
        null
      );
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'createShape');
      assert.strictEqual(result[0].arguments.type, 'star');
      assert.strictEqual(result[0].arguments.color, '#10B981');
    });

    it('generates createStickyNote for sticky intent', () => {
      const result = executeFromIntent(
        {
          operation: 'CREATE',
          objectType: 'sticky',
          quantity: 1,
          text: 'Todo',
          color: 'yellow',
        },
        null
      );
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'createStickyNote');
      assert.strictEqual(result[0].arguments.text, 'Todo');
    });

    it('CREATE with quantity > 1 adds quantity to args', () => {
      const result = executeFromIntent(
        {
          operation: 'CREATE',
          objectType: 'shape',
          shapeType: 'circle',
          quantity: 5,
          color: '#EF4444',
        },
        null
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].arguments.quantity, 5);
    });
  });

  describe('CHANGE_COLOR', () => {
    it('generates changeColor for each matching object', () => {
      const result = executeFromIntent(
        {
          operation: 'CHANGE_COLOR',
          color: '#3B82F6',
          targetFilter: { type: 'circle' },
        },
        boardWithShapes
      );
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'changeColor');
      assert.strictEqual(result[0].arguments.objectId, 'obj-1');
      assert.strictEqual(result[0].arguments.color, '#3B82F6');
    });

    it('useSelection filters by selectedIds', () => {
      const board = {
        ...boardWithShapes,
        selectedIds: ['obj-2'],
      };
      const result = executeFromIntent(
        {
          operation: 'CHANGE_COLOR',
          color: 'red',
          targetFilter: { useSelection: true },
        },
        board
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].arguments.objectId, 'obj-2');
    });
  });

  describe('DELETE', () => {
    it('generates deleteObject with matching object ids', () => {
      const result = executeFromIntent(
        {
          operation: 'DELETE',
          targetFilter: { type: 'star' },
        },
        boardWithShapes
      );
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'deleteObject');
      assert.deepStrictEqual(result[0].arguments.objectIds, ['obj-2']);
    });

    it('returns empty when no objects match', () => {
      const result = executeFromIntent(
        {
          operation: 'DELETE',
          targetFilter: { type: 'frame' },
        },
        boardWithShapes
      );
      assert.strictEqual(result.length, 0);
    });
  });

  describe('ANALYZE', () => {
    it('generates analyzeObjects with object ids', () => {
      const result = executeFromIntent(
        {
          operation: 'ANALYZE',
          targetFilter: { type: 'circle' },
        },
        boardWithShapes
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'analyzeObjects');
      assert.deepStrictEqual(result[0].arguments.objectIds, ['obj-1']);
    });
  });

  describe('UPDATE', () => {
    it('generates updateText for each matching object', () => {
      const result = executeFromIntent(
        {
          operation: 'UPDATE',
          text: 'Updated',
          targetFilter: { type: 'sticky' },
        },
        boardWithShapes
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'updateText');
      assert.strictEqual(result[0].arguments.objectId, 'obj-3');
      assert.strictEqual(result[0].arguments.newText, 'Updated');
    });

    it('returns null when UPDATE has no text', () => {
      const result = executeFromIntent(
        {
          operation: 'UPDATE',
          targetFilter: { type: 'sticky' },
        },
        boardWithShapes
      );
      assert.strictEqual(result, null);
    });
  });
});
