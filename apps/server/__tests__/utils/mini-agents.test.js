/**
 * Tests for mini-agents (detectMiniAgent, needsComplexSupervisor)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectMiniAgent,
  needsComplexSupervisor,
  MINI_CREATE,
  MINI_COLOR,
  MINI_DELETE,
  MINI_ANALYZE,
  MINI_SWOT,
} from '../../utils/mini-agents.js';

describe('mini-agents', () => {
  describe('detectMiniAgent', () => {
    it('returns MINI_CREATE for single-object create', () => {
      assert.strictEqual(detectMiniAgent('create a circle'), MINI_CREATE);
      assert.strictEqual(detectMiniAgent('add a red circle'), MINI_CREATE);
      assert.strictEqual(detectMiniAgent('add a frame'), MINI_CREATE);
    });

    it('returns null for create with quantity > 1', () => {
      assert.strictEqual(detectMiniAgent('create 5 circles'), null);
      assert.strictEqual(detectMiniAgent('create 8 stars'), null);
      assert.strictEqual(detectMiniAgent('add three sticky notes'), null);
    });

    it('returns MINI_COLOR for color commands', () => {
      assert.strictEqual(detectMiniAgent('color all circles red'), MINI_COLOR);
      // "make these blue" is matched by CREATE (starts with "make"); use a command that doesn't start with create/add/make
      assert.strictEqual(detectMiniAgent('change color to blue'), MINI_COLOR);
    });

    it('returns MINI_DELETE for delete commands', () => {
      assert.strictEqual(detectMiniAgent('delete all circles'), MINI_DELETE);
      assert.strictEqual(detectMiniAgent('remove these'), MINI_DELETE);
    });

    it('returns MINI_ANALYZE for how many / count', () => {
      assert.strictEqual(detectMiniAgent('how many circles'), MINI_ANALYZE);
      assert.strictEqual(detectMiniAgent('count the stars'), MINI_ANALYZE);
    });

    it('returns MINI_SWOT for swot/matrix', () => {
      assert.strictEqual(detectMiniAgent('create swot'), MINI_SWOT);
      assert.strictEqual(detectMiniAgent('create a 3x3 matrix'), MINI_SWOT);
    });

    it('returns null for creative/kanban (needs creative composer)', () => {
      assert.strictEqual(detectMiniAgent('create a kanban board'), null);
      assert.strictEqual(detectMiniAgent('draw a flowchart'), null);
      assert.strictEqual(detectMiniAgent('make a mind map'), null);
    });

    it('returns null for move to frame (intent path)', () => {
      assert.strictEqual(detectMiniAgent('move these to the frame'), null);
    });
  });

  describe('needsComplexSupervisor', () => {
    it('returns true for domain-specific layouts', () => {
      assert.strictEqual(needsComplexSupervisor('create a solar system'), true);
      assert.strictEqual(needsComplexSupervisor('draw a food chain'), true);
      assert.strictEqual(needsComplexSupervisor('make an org chart'), true);
      assert.strictEqual(needsComplexSupervisor('create a timeline'), true);
    });

    it('returns false for simple create', () => {
      assert.strictEqual(needsComplexSupervisor('create a circle'), false);
      assert.strictEqual(needsComplexSupervisor('add 5 stars'), false);
    });
  });
});
