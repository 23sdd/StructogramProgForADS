import { initWorkspaceLayout } from './layout.js';
import { parse } from './parser.js';
import { render } from './renderer.js';
import { examples, blank } from './examples.js';
import { createBlockEditor } from './blocks.js';

const $ = id => document.getElementById(id);
const source = $('source'), stage = $('diagram-stage'), title = $('document-title');
const storageKey = 'structogram.ads.workspace.v1';
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
context.font = 'italic 18px "Times New Roman", Georgia, serif';
let documentState = { ...examples[0], modified: false };
let currentDiagram, valid = false, zoom = 1, fitMode = true, renderTimer, toastTimer, pendingReplacement;
let storageAvailable = true;
// Start in text mode so restoring a saved text document never flushes an empty workspace.
let visual = null, editorMode = 'text', lastBlockSource = '';

try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  if (stored && typeof stored.source === 'string' && typeof stored.title === 'string' && stored.source.length <= 100_000) {
    documentState = { ...stored, title: stored.title.slice(0, 100) };
  }
} catch { storageAvailable = false; }

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

function persist() {
  documentState.source = source.value;
  documentState.title = title.value;
  documentState.editorMode = editorMode;
  try {
    localStorage.setItem(storageKey, JSON.stringify(documentState));
    storageAvailable = true;
    $('save-status').textContent = 'Saved on this device';
  } catch {
    storageAvailable = false;
    $('save-status').textContent = 'Use Save source to keep your work';
  }
}

function updateDocumentLabel() {
  $('document-label').textContent = title.value.trim() || 'Untitled algorithm';
  document.title = `${title.value.trim() || 'Untitled algorithm'} — Structogram`;
  for (const button of $('examples').children) {
    const active = button.dataset.example === documentState.id;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
}

function updateLines() {
  $('line-numbers').textContent = source.value.split('\n').map((_, i) => i + 1).join('\n');
  $('line-numbers').scrollTop = source.scrollTop;
  updateCursor();
}

function updateCursor() {
  if (editorMode === 'blocks') { $('cursor-position').textContent = 'Visual editing'; return; }
  const before = source.value.slice(0, source.selectionStart).split('\n');
  $('cursor-position').textContent = `Ln ${before.length}, Col ${before.at(-1).length + 1}`;
}

function exportEnabled(enabled) {
  $('export-diagram').disabled = !enabled;
  $('print-diagram').disabled = !enabled;
}

function applyZoom() {
  if (!currentDiagram) return;
  if (fitMode) {
    const viewport = $('preview-viewport');
    const style = getComputedStyle(viewport);
    const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    zoom = Math.min(1, Math.max(.08, available / currentDiagram.width));
  }
  stage.style.width = `${currentDiagram.width * zoom}px`;
  stage.style.height = `${currentDiagram.height * zoom}px`;
  $('zoom-reset').textContent = `${Math.round(zoom * 100)}%`;
  $('zoom-fit').setAttribute('aria-pressed', String(fitMode));
}

function updatePreview() {
  clearTimeout(renderTimer);
  try {
    if (editorMode === 'blocks' && visual?.error) throw visual.error;
    const routines = parse(source.value);
    currentDiagram = render(routines, { measure: text => context.measureText(text).width, title: title.value.trim() || 'Structogram' });
    stage.innerHTML = currentDiagram.svg;
    stage.classList.remove('is-stale');
    $('parse-error').hidden = true;
    $('diagram-status').textContent = '';
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    $('diagram-status').append(dot, document.createTextNode(`Diagram is up to date${routines.length > 1 ? ` · ${routines.length} routines` : ''}`));
    valid = true;
    exportEnabled(true);
    applyZoom();
  } catch (error) {
    valid = false;
    stage.classList.add('is-stale');
    $('parse-error').textContent = `${error.line ? `Line ${error.line}` : 'Blocks'}: ${error.message}`;
    $('parse-error').hidden = false;
    $('diagram-status').textContent = 'Preview paused · fix the highlighted issue';
    exportEnabled(false);
  }
}

function documentChanged(fromBlocks = false) {
  documentState.modified = true;
  documentState.id = null;
  if (fromBlocks !== true) {
    lastBlockSource = '';
    delete documentState.blockWorkspace;
    delete documentState.blockSource;
  }
  updateLines();
  persist();
  updateDocumentLabel();
  valid = false;
  exportEnabled(false);
  $('diagram-status').textContent = 'Updating preview…';
  clearTimeout(renderTimer);
  renderTimer = setTimeout(updatePreview, 160);
}

function loadDocument(next) {
  documentState = { title: next.title, source: next.source, id: next.id || null, modified: false };
  source.value = next.source;
  title.value = next.title;
  source.scrollTop = source.scrollLeft = 0;
  fitMode = true;
  lastBlockSource = '';
  if (editorMode === 'blocks' && visual) {
    try { visual.load(next.source); lastBlockSource = next.source; }
    catch { editorMode = 'text'; setEditorMode('text'); }
  }
  persist();
  updateLines();
  updateDocumentLabel();
  updatePreview();
}

function setEditorMode(mode) {
  if (mode === 'blocks') {
    if (!visual) { toast('The visual editor is unavailable. Reopen the page online to reload its files.'); return false; }
    try {
      parse(source.value);
      if (lastBlockSource !== source.value) {
        visual.load(source.value, documentState.blockSource === source.value ? documentState.blockWorkspace : null);
        lastBlockSource = source.value;
      }
    } catch (error) { toast(`Fix the text first: ${error.message}`); return false; }
  } else if (editorMode === 'blocks' && visual) {
    visual.flush();
    if (visual.error) { toast(visual.error.message); return false; }
  }
  editorMode = mode;
  $('blocks-panel').hidden = mode !== 'blocks';
  $('text-panel').hidden = mode !== 'text';
  for (const name of ['blocks', 'text']) {
    $('mode-' + name).setAttribute('aria-selected', String(name === mode));
    $('mode-' + name).tabIndex = name === mode ? 0 : -1;
  }
  $('editor-hint').textContent = mode === 'blocks' ? 'Click a diagram row to find its block' : 'Tab to indent · click a diagram row to edit';
  updateCursor();
  if (mode === 'blocks') requestAnimationFrame(() => visual.resize());
  persist();
  updatePreview();
  return true;
}

function undoEditing(redo = false) {
  if (document.activeElement?.classList.contains('blocklyHtmlInput')) document.execCommand(redo ? 'redo' : 'undo');
  else if (editorMode === 'blocks') visual?.undo(redo);
  else { source.focus(); document.execCommand(redo ? 'redo' : 'undo'); }
}

function replaceDocument(next) {
  closeNavigation();
  if (documentState.modified && (source.value !== next.source || title.value !== next.title)) {
    pendingReplacement = next;
    $('replace-dialog').showModal();
  } else loadDocument(next);
}

function closeNavigation() {
  document.body.classList.remove('nav-open');
  $('nav-backdrop').hidden = true;
  $('toggle-nav').setAttribute('aria-expanded', 'false');
}

function editText(start, end, text) {
  source.focus();
  source.setSelectionRange(start, end);
  // insertText preserves the native undo history; setRangeText is the fallback.
  if (!document.execCommand('insertText', false, text)) {
    source.setRangeText(text, start, end, 'end');
    documentChanged();
  }
  updateCursor();
}

const snippets = {
  statement: 'statement',
  if: 'if condition\n  SKIP\nelse\n  SKIP',
  while: 'while condition\n  SKIP',
  for: 'for i := 0 to n − 1\n  SKIP',
  select: 'select\n  case condition\n    SKIP\n  otherwise\n    SKIP'
};

function insertConstruct(kind) {
  const position = source.selectionStart;
  const lineStart = source.value.lastIndexOf('\n', position - 1) + 1;
  const lineEnd = source.value.indexOf('\n', position);
  const end = lineEnd === -1 ? source.value.length : lineEnd;
  const currentLine = source.value.slice(lineStart, end);
  const indent = currentLine.match(/^\s*/)[0] || '  ';
  const snippet = snippets[kind].split('\n').map(line => indent + line).join('\n');
  if (!currentLine.trim() || currentLine.trim() === 'SKIP') {
    editText(lineStart, end, snippet);
    source.setSelectionRange(lineStart + indent.length, lineStart + snippet.length);
  } else {
    editText(end, end, '\n' + snippet);
    source.setSelectionRange(end + 1 + indent.length, end + 1 + snippet.length);
  }
  updateCursor();
}

async function download(blob, extension) {
  const filename = (title.value.trim().replace(/[^\p{L}\p{N}_.-]+/gu, '-').replace(/^-+|-+$/g, '') || 'algorithm') + extension;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

async function saveSource() {
  if (editorMode === 'blocks') {
    visual?.flush();
    if (visual?.error) { toast('Connect or remove loose blocks before saving source.'); return; }
  }
  try {
    if (await download(new Blob([source.value], { type: 'text/plain;charset=utf-8' }), '.ads')) toast('Source file saved');
  } catch { toast('Could not save the file. Try another location.'); }
}

async function exportDiagram() {
  if (editorMode === 'blocks') visual?.flush();
  updatePreview();
  if (!valid || !currentDiagram) return;
  const snapshot = currentDiagram;
  if ($('export-format').value === 'svg') {
    try {
      if (await download(new Blob([snapshot.svg], { type: 'image/svg+xml;charset=utf-8' }), '.svg')) toast('SVG saved');
    } catch { toast('Could not save the SVG. Try another location.'); }
    return;
  }
  try {
    const url = URL.createObjectURL(new Blob([snapshot.svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    try { img.src = url; await img.decode(); }
    finally { URL.revokeObjectURL(url); }
    const output = document.createElement('canvas');
    const scale = Math.min(2, 8192 / Math.max(snapshot.width, snapshot.height), Math.sqrt(24_000_000 / (snapshot.width * snapshot.height)));
    output.width = Math.max(1, Math.ceil(snapshot.width * scale));
    output.height = Math.max(1, Math.ceil(snapshot.height * scale));
    const painter = output.getContext('2d');
    painter.fillStyle = '#fff';
    painter.fillRect(0, 0, output.width, output.height);
    painter.drawImage(img, 0, 0, output.width, output.height);
    const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create the image.');
    if (await download(blob, '.png')) toast('PNG saved');
  } catch { toast('PNG export failed. Try SVG, which preserves the full diagram.'); }
}

examples.forEach((example, index) => {
  const button = document.createElement('button');
  button.className = 'example-button';
  button.dataset.example = example.id;
  button.title = example.description;
  const number = document.createElement('span');
  number.className = 'example-number';
  number.textContent = String(index + 1).padStart(2, '0');
  button.append(number, document.createTextNode(example.title));
  button.addEventListener('click', () => replaceDocument(example));
  $('examples').append(button);
});

for (const [symbol, meaning] of [[':=', 'Assignment'], ['→', 'Pointer field'], ['∅', 'Null pointer'], ['≠', 'Not equal'], ['≤', 'Less than or equal'], ['≥', 'Greater than or equal'], ['∧', 'Logical and'], ['∨', 'Logical or'], ['¬', 'Logical not'], ['∀', 'For all'], ['∈', 'Element of'], ['∞', 'Infinity'], ['π', 'Parent / pi']]) {
  const button = document.createElement('button');
  button.textContent = symbol;
  button.title = meaning;
  button.setAttribute('aria-label', `Insert ${meaning.toLowerCase()} (${symbol})`);
  button.addEventListener('pointerdown', event => event.preventDefault());
  button.addEventListener('click', () => {
    if (editorMode === 'blocks') { if (!visual?.insertSymbol(symbol)) toast('Select a block or click its text field first.'); }
    else editText(source.selectionStart, source.selectionEnd, symbol);
  });
  $('symbols').append(button);
}

document.querySelectorAll('[data-insert]').forEach(button => button.addEventListener('click', () => insertConstruct(button.dataset.insert)));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
$('open-guide').addEventListener('click', () => { closeNavigation(); $('guide-dialog').showModal(); });
$('toggle-nav').addEventListener('click', () => {
  if (document.body.classList.contains('nav-open')) closeNavigation();
  else {
    document.body.classList.add('nav-open');
    $('nav-backdrop').hidden = false;
    $('toggle-nav').setAttribute('aria-expanded', 'true');
    $('new-document').focus();
  }
});
$('nav-backdrop').addEventListener('click', closeNavigation);
$('new-document').addEventListener('click', () => replaceDocument(blank));
$('confirm-replace').addEventListener('click', () => { $('replace-dialog').close(); if (pendingReplacement) loadDocument(pendingReplacement); pendingReplacement = null; });
$('save-before-replace').addEventListener('click', saveSource);
$('save-source').addEventListener('click', saveSource);
$('export-diagram').addEventListener('click', exportDiagram);
$('print-diagram').addEventListener('click', async () => {
  if (editorMode === 'blocks') visual?.flush();
  updatePreview();
  if (!valid) return;
  try { window.print(); }
  catch { toast('Could not open the print dialog.'); }
});
$('import-source').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 400_000) { toast('Please open a source file smaller than 400 KB.'); return; }
  try { importSource(file.name, await file.text()); }
  catch { toast('Could not read this source file.'); }
});

function importSource(name, text) {
  try {
    const filename = name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    let next = { title: filename.slice(0, 100), source: text };
    if (/\.json$/i.test(name)) {
      const data = JSON.parse(text);
      if (typeof data.source !== 'string') throw new Error('Missing source text.');
      next = { title: typeof data.title === 'string' ? data.title.slice(0, 100) : filename, source: data.source };
    }
    if (next.source.length > 100_000) throw new Error('Too large.');
    replaceDocument(next);
  } catch { toast('Could not open this file. Use a text source file or JSON with a source field.'); }
}

source.addEventListener('input', documentChanged);
source.addEventListener('click', updateCursor);
source.addEventListener('keyup', updateCursor);
source.addEventListener('select', updateCursor);
source.addEventListener('scroll', () => { $('line-numbers').scrollTop = source.scrollTop; });
source.addEventListener('keydown', event => {
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = source.selectionStart, end = source.selectionEnd;
    const blockStart = source.value.lastIndexOf('\n', start - 1) + 1;
    if (start === end && !event.shiftKey) { editText(start, end, '  '); return; }
    const selected = source.value.slice(blockStart, end);
    const replacement = selected.split('\n').map(line => event.shiftKey ? line.replace(/^ {1,2}/, '') : '  ' + line).join('\n');
    editText(blockStart, end, replacement);
    source.setSelectionRange(blockStart, blockStart + replacement.length);
  } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.isComposing) {
    event.preventDefault();
    const before = source.value.slice(0, source.selectionStart).split('\n').at(-1);
    let indent = before.match(/^\s*/)[0];
    if (/^\s*(?:if\b|else\b|elif\b|while\b|for\b|foreach\b|select\b|case\b|otherwise\b)/.test(before) || /^\S.*\(.*\)/.test(before)) indent += '  ';
    editText(source.selectionStart, source.selectionEnd, '\n' + indent);
  }
});

title.addEventListener('input', () => { documentState.modified = true; updateDocumentLabel(); persist(); updatePreview(); });
stage.addEventListener('click', event => {
  const row = event.target.closest('[data-line]');
  if (!row) return;
  const lineNumber = Number(row.dataset.line);
  if (editorMode === 'blocks') { visual?.selectLine(lineNumber); return; }
  const lines = source.value.split('\n');
  const start = lines.slice(0, lineNumber - 1).reduce((sum, line) => sum + line.length + 1, 0);
  source.focus();
  source.setSelectionRange(start, start + lines[lineNumber - 1].length);
  source.scrollTop = Math.max(0, (lineNumber - 4) * 27);
  updateCursor();
});

function changeZoom(delta) { fitMode = false; zoom = Math.min(2, Math.max(.1, Math.round((zoom + delta) * 100) / 100)); applyZoom(); }
$('zoom-in').addEventListener('click', () => changeZoom(.1));
$('zoom-out').addEventListener('click', () => changeZoom(-.1));
$('zoom-reset').addEventListener('click', () => { fitMode = false; zoom = 1; applyZoom(); });
$('zoom-fit').addEventListener('click', () => { fitMode = true; applyZoom(); });
new ResizeObserver(() => { if (fitMode) applyZoom(); if (editorMode === 'blocks') visual?.resize(); }).observe($('preview-viewport'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('nav-open')) { closeNavigation(); $('toggle-nav').focus(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveSource(); }
});
window.addEventListener('beforeprint', updatePreview);
function saveBeforeUpdate() {
  // Commit an actively edited Blockly field before serializing its workspace.
  if (document.activeElement?.classList.contains('blocklyHtmlInput')) document.activeElement.blur();
  if (editorMode === 'blocks') visual?.flush();
  persist();
  return storageAvailable;
}
window.addEventListener('structogram-before-update', event => {
  if (!saveBeforeUpdate()) event.preventDefault();
});
window.addEventListener('pagehide', saveBeforeUpdate);

source.value = documentState.source;
title.value = documentState.title;
const initialMode = documentState.editorMode === 'text' ? 'text' : 'blocks';
try {
  visual = createBlockEditor($('block-workspace'), result => {
    if (editorMode !== 'blocks') return;
    documentState.blockWorkspace = result.state;
    documentState.blockSource = source.value;
    if (result.error) { documentState.modified = true; persist(); updatePreview(); return; }
    if (result.changed) {
      source.value = result.source;
      lastBlockSource = result.source;
      documentState.blockSource = result.source;
      documentChanged(true);
    } else persist();
  });
} catch (error) { toast(error.message); }
$('mode-blocks').addEventListener('click', () => setEditorMode('blocks'));
$('mode-text').addEventListener('click', () => setEditorMode('text'));
$('undo-blocks').addEventListener('click', () => undoEditing(false));
$('redo-blocks').addEventListener('click', () => undoEditing(true));
for (const mode of ['blocks', 'text']) $('mode-' + mode).addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const next = mode === 'blocks' ? 'text' : 'blocks';
    if (setEditorMode(next)) $('mode-' + next).focus();
  }
});
if (!setEditorMode(visual ? initialMode : 'text')) setEditorMode('text');
updateLines();
updateDocumentLabel();
updatePreview();
if (!storageAvailable) $('save-status').textContent = 'Use Save source to keep your work';

initWorkspaceLayout(() => {
  if (editorMode === 'blocks') visual?.resize();
  if (fitMode) applyZoom();
});
