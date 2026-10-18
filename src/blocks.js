import { sourceToBlocks, blocksToSource } from './block-model.js';

export function defineAdsBlocks(B) {
  const textField = value => new B.FieldTextInput(value, value => value.replace(/[\r\n]/g, ' '));
  function statement(block, color) { block.setPreviousStatement(true, 'ADS'); block.setNextStatement(true, 'ADS'); block.setColour(color); }
  B.Blocks.ads_routine = { init() {
    this.appendDummyInput().appendField('algorithm').appendField(textField('algorithm()'), 'SIGNATURE');
    this.appendStatementInput('BODY').setCheck('ADS').appendField('do');
    this.setColour('#315c62'); this.setTooltip('Name the algorithm and place its statements inside.');
  } };
  B.Blocks.ads_statement = { init() {
    this.appendDummyInput().appendField('statement').appendField(textField('SKIP'), 'TEXT');
    statement(this, '#40755a'); this.setTooltip('Write an assignment, declaration, call, return, or SKIP.');
  } };
  B.Blocks.ads_if = { init() {
    this.appendDummyInput().appendField('if').appendField(textField('condition'), 'CONDITION');
    this.appendStatementInput('YES').setCheck('ADS').appendField('then');
    this.appendStatementInput('NO').setCheck('ADS').appendField('else');
    statement(this, '#9c7135'); this.setTooltip('Edit the condition; place statements in the then and else branches.');
  } };
  for (const [type, label, placeholder] of [['ads_while', 'while', 'condition'], ['ads_for', 'for', 'i := 0 to n − 1']]) {
    B.Blocks[type] = { init() {
      this.appendDummyInput().appendField(label).appendField(textField(placeholder), 'CONDITION');
      this.appendStatementInput('BODY').setCheck('ADS').appendField('do');
      statement(this, '#3c7d79'); this.setTooltip('Edit the loop condition or range, then add statements inside.');
    } };
  }
  B.Blocks.ads_select = { init() {
    this.appendDummyInput().appendField('selection');
    this.appendStatementInput('BRANCHES').setCheck('CASE').appendField('cases');
    statement(this, '#9c7135'); this.setTooltip('Place two or more case blocks here; use otherwise for a final default branch.');
  } };
  B.Blocks.ads_case = { init() {
    this.appendDummyInput().appendField('case').appendField(textField('condition'), 'CONDITION');
    this.appendStatementInput('BODY').setCheck('ADS').appendField('do');
    this.setPreviousStatement(true, 'CASE'); this.setNextStatement(true, 'CASE'); this.setColour('#ac8450');
    this.setTooltip('A branch of a selection. Write otherwise for the final default branch.');
  } };
}

export function createBlockEditor(element, onChange) {
  const B = window.Blockly;
  if (!B) throw new Error('The block editor could not load. Reopen the page online to reload its files.');
  defineAdsBlocks(B);
  const toolbox = { kind: 'categoryToolbox', contents: [
    { kind: 'category', name: 'Algorithm', colour: '#315c62', contents: [{ kind: 'block', type: 'ads_routine' }] },
    { kind: 'category', name: 'Statements', colour: '#40755a', contents: [{ kind: 'block', type: 'ads_statement' }] },
    { kind: 'category', name: 'Conditions', colour: '#9c7135', contents: [{ kind: 'block', type: 'ads_if' }, { kind: 'block', type: 'ads_select', inputs: { BRANCHES: { block: { type: 'ads_case', fields: { CONDITION: 'condition' }, next: { block: { type: 'ads_case', fields: { CONDITION: 'otherwise' } } } } } } }, { kind: 'block', type: 'ads_case' }] },
    { kind: 'category', name: 'Loops', colour: '#3c7d79', contents: [{ kind: 'block', type: 'ads_while' }, { kind: 'block', type: 'ads_for' }] }
  ] };
  const workspace = B.inject(element, {
    toolbox, renderer: 'zelos', media: './vendor/blockly/media/', sounds: false,
    trashcan: true, scrollbars: true, move: { scrollbars: true, drag: true, wheel: true },
    zoom: { controls: true, wheel: false, startScale: .85, minScale: .3, maxScale: 1.6 },
    grid: { spacing: 20, length: 2, colour: '#e2e8dd', snap: true }
  });
  let suspended = false, lineMap = {}, lastSource = '', lastError = null, timer;
  function save() { return B.serialization.workspaces.save(workspace); }
  function publish() {
    clearTimeout(timer);
    if (suspended) return;
    try {
      const generated = blocksToSource(save());
      const changed = generated.source !== lastSource || lastError !== null;
      if (changed) {
        lineMap = generated.lineMap;
        const seen = new Set();
        for (const [line, id] of Object.entries(lineMap)) {
          if (!seen.has(id)) { workspace.getBlockById(id).data = line; seen.add(id); }
        }
      }
      lastSource = generated.source; lastError = null;
      onChange({ source: generated.source, state: save(), changed });
    } catch (error) { lastError = error; onChange({ error, state: save() }); }
  }
  workspace.addChangeListener(event => {
    if (!event.isUiEvent && !suspended && event.type !== B.Events.FINISHED_LOADING) {
      clearTimeout(timer); timer = setTimeout(publish, 80);
    }
  });
  return {
    workspace,
    get error() { return lastError; },
    load(source, savedState) {
      const state = savedState || sourceToBlocks(source);
      suspended = true; clearTimeout(timer); B.Events.disable();
      try {
        workspace.clear();
        B.serialization.workspaces.load(state, workspace);
        if (!savedState) workspace.cleanUp();
        workspace.clearUndo();
        lineMap = {};
        for (const block of workspace.getAllBlocks(false)) if (block.data && !lineMap[Number(block.data)]) lineMap[Number(block.data)] = block.id;
        try { lastSource = blocksToSource(save()).source; lastError = null; }
        catch (error) { lastError = error; lastSource = ''; }
      } finally { B.Events.enable(); suspended = false; }
      if (lastError) onChange({ error: lastError, state: save() });
    },
    save,
    flush: publish,
    resize() { B.svgResize(workspace); },
    undo(redo = false) { workspace.undo(redo); publish(); },
    selectLine(line) { const block = workspace.getBlockById(lineMap[line]); if (block) { B.getFocusManager().focusNode(block); block.select(); workspace.centerOnBlock(block.id); } },
    insertSymbol(symbol) {
      const active = document.activeElement;
      if (active?.classList.contains('blocklyHtmlInput')) {
        active.setRangeText(symbol, active.selectionStart, active.selectionEnd, 'end');
        active.dispatchEvent(new Event('input', { bubbles: true })); return true;
      }
      const block = B.getSelected();
      const field = block?.getField('TEXT') || block?.getField('CONDITION') || block?.getField('SIGNATURE');
      if (!field) return false;
      field.setValue(field.getValue() + symbol); return true;
    }
  };
}
