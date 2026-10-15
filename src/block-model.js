import { parse } from './parser.js';

/** Convert our course AST to Blockly's data format. No expression is executed. */
export function sourceToBlocks(source) {
  const original = source.split(/\r?\n/);
  function chain(nodes) {
    let next;
    for (const node of [...nodes].reverse()) {
      let block;
      if (node.type === 'statement') block = { type: 'ads_statement', fields: { TEXT: node.text } };
      else if (node.type === 'loop') {
        const isFor = /^\s*(for|foreach)\s/.test(original[node.line - 1]);
        block = { type: isFor ? 'ads_for' : 'ads_while', fields: { CONDITION: node.text }, inputs: { BODY: { block: chain(node.body) } } };
      } else if (node.type === 'if') {
        block = { type: 'ads_if', fields: { CONDITION: node.text }, inputs: { YES: { block: chain(node.yes) }, NO: { block: chain(node.no) } } };
      } else {
        const cases = node.branches.map(branch => ({
          type: 'ads_case', data: String(branch.line), fields: { CONDITION: branch.text }, inputs: { BODY: { block: chain(branch.body) } }
        }));
        block = { type: 'ads_select', inputs: { BRANCHES: { block: link(cases) } } };
      }
      block.data = String(node.line);
      if (next) block.next = { block: next };
      next = block;
    }
    return next;
  }
  function link(blocks) {
    let next;
    for (const block of [...blocks].reverse()) { if (next) block.next = { block: next }; next = block; }
    return next;
  }
  return { blocks: { languageVersion: 0, blocks: parse(source).map((routine, index) => ({
    type: 'ads_routine', data: String(routine.line), x: 35, y: 35 + index * 300,
    fields: { SIGNATURE: routine.signature }, inputs: { BODY: { block: chain(routine.body) } }
  })) } };
}

/** Generate the editable pseudocode, keeping a map from diagram rows to blocks. */
export function blocksToSource(state) {
  const lines = [], lineMap = {};
  let count = 0;
  function field(block, name, fallback) {
    const value = String(block.fields?.[name] ?? fallback).trim();
    if (/[\r\n]/.test(value)) throw new Error('Write one statement or condition per block.');
    return value || fallback;
  }
  function emit(text, depth, block) {
    lines.push('  '.repeat(depth) + text);
    if (block.id) lineMap[lines.length] = block.id;
  }
  function body(block, name, depth) {
    const child = block.inputs?.[name]?.block;
    if (child) sequence(child, depth);
    else emit('SKIP', depth, block);
  }
  function sequence(first, depth) {
    if (depth > 25) throw new Error('Use at most 24 nested blocks.');
    for (let block = first; block; block = block.next?.block) {
      if (++count > 1500) throw new Error('Use at most 1,500 blocks.');
      switch (block.type) {
        case 'ads_statement': emit(field(block, 'TEXT', 'SKIP'), depth, block); break;
        case 'ads_for': case 'ads_while':
          emit((block.type === 'ads_for' ? 'for ' : 'while ') + field(block, 'CONDITION', block.type === 'ads_for' ? 'i := 0 to n − 1' : 'condition'), depth, block);
          body(block, 'BODY', depth + 1); break;
        case 'ads_if':
          emit('if ' + field(block, 'CONDITION', 'condition'), depth, block);
          body(block, 'YES', depth + 1);
          emit('else', depth, block);
          body(block, 'NO', depth + 1); break;
        case 'ads_select': {
          emit('select', depth, block);
          let branch = block.inputs?.BRANCHES?.block, branches = 0;
          while (branch) {
            if (branch.type !== 'ads_case') throw new Error('Only case blocks belong inside a selection.');
            if (++branches > 12) throw new Error('Use at most 12 case branches.');
            const condition = field(branch, 'CONDITION', 'condition');
            emit(condition === 'otherwise' ? 'otherwise' : 'case ' + condition, depth + 1, branch);
            body(branch, 'BODY', depth + 2);
            branch = branch.next?.block;
          }
          if (branches < 2) throw new Error('Add at least two case blocks inside the selection.');
          break;
        }
        default: throw new Error('Place case blocks inside a selection, and other blocks inside an algorithm.');
      }
    }
  }
  const top = state.blocks?.blocks ?? [];
  if (!top.length) throw new Error('Add an Algorithm block to begin.');
  for (const [index, routine] of top.entries()) {
    if (routine.type !== 'ads_routine') throw new Error('Connect loose blocks inside an Algorithm block.');
    if (index) lines.push('');
    emit(field(routine, 'SIGNATURE', 'algorithm()'), 0, routine);
    body(routine, 'BODY', 1);
    if (routine.next?.block) throw new Error('Algorithms must be separate top-level blocks.');
  }
  return { source: lines.join('\n'), lineMap };
}
