import test from 'node:test';
import assert from 'node:assert/strict';
import Blockly from 'blockly/core';
import { parse } from '../src/parser.js';
import { examples } from '../src/examples.js';
import { sourceToBlocks, blocksToSource } from '../src/block-model.js';
import { defineAdsBlocks } from '../src/blocks.js';

defineAdsBlocks(Blockly);
const semantic = routines => JSON.parse(JSON.stringify(routines, (key, value) => key === 'line' || key === 'implicit' ? undefined : value));

test('every course example survives text → real Blockly serialization → text without changing its algorithm', () => {
  for (const example of examples) {
    const workspace = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load(sourceToBlocks(example.source), workspace);
      const result = blocksToSource(Blockly.serialization.workspaces.save(workspace));
      assert.deepEqual(semantic(parse(result.source)), semantic(parse(example.source)), example.title);
      assert.ok(Object.keys(result.lineMap).length > 0);
    } finally { workspace.dispose(); }
  }
});

test('editing a statement field changes the saved pseudocode literally, without running it', () => {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(sourceToBlocks('algorithm()\n  SKIP'), workspace);
    const text = '<script>globalThis.wasExecuted = true</script>';
    workspace.getAllBlocks(false).find(block => block.type === 'ads_statement').setFieldValue(text, 'TEXT');
    assert.equal(blocksToSource(Blockly.serialization.workspaces.save(workspace)).source, 'algorithm()\n  ' + text);
    assert.equal(globalThis.wasExecuted, undefined);
  } finally { workspace.dispose(); }
});

test('empty block bodies become SKIP; loose blocks cannot silently disappear from the source', () => {
  const state = { blocks: { blocks: [{ type: 'ads_routine', fields: { SIGNATURE: 'f()' } }] } };
  assert.equal(blocksToSource(state).source, 'f()\n  SKIP');
  state.blocks.blocks.push({ type: 'ads_statement', fields: { TEXT: 'x := 4' } });
  assert.throws(() => blocksToSource(state), /loose blocks/);
});

test('case blocks belong only to a selection; selection requires two branches', () => {
  assert.throws(() => blocksToSource({ blocks: { blocks: [{ type: 'ads_case' }] } }), /loose blocks/);
  const state = sourceToBlocks('f()\n  select\n    case x\n      SKIP\n    otherwise\n      SKIP');
  delete state.blocks.blocks[0].inputs.BODY.block.inputs.BRANCHES.block.next;
  assert.throws(() => blocksToSource(state), /at least two/);
});
