/** The document language uses indentation; expressions are kept as text, never executed. */
export class ParseError extends Error {
  constructor(message, line) {
    super(message);
    this.name = 'ParseError';
    this.line = line;
  }
}

export function parse(source) {
  if (source.length > 100_000) throw new ParseError('This document is too large (maximum 100,000 characters).', 1);
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map((raw, i) => {
    const expanded = raw.replace(/^\t+/, tabs => '  '.repeat(tabs.length));
    const prefix = expanded.match(/^\s*/)[0];
    if (prefix.includes('\t')) throw new ParseError('Use spaces, or tabs alone, for indentation.', i + 1);
    return { text: expanded.trim(), indent: prefix.length, line: i + 1 };
  }).filter(line => line.text);
  if (!lines.length) throw new ParseError('Start with a routine signature, for example: algorithm(A : T[n])', 1);
  if (lines.length > 1500) throw new ParseError('Use at most 1,500 non-empty lines in a document.', 1);
  let index = 0;
  const fail = (message, token = lines[index]) => { throw new ParseError(message, token?.line ?? lines.at(-1).line); };
  const condition = (text, prefix, token) => {
    const value = text.slice(prefix.length).replace(/:\s*$/, '').trim();
    if (!value) fail('Add a condition after the control keyword.', token);
    return value;
  };
  function children(parent, depth) {
    if (depth > 24) fail('Use at most 24 nested blocks.', parent);
    if (!lines[index] || lines[index].indent <= parent.indent) fail('Indent a body below this line. Use SKIP for an empty branch.', parent);
    const body = sequence(lines[index].indent, depth);
    if (!body.length) fail('Add a statement here. A branch keyword needs its matching control block.');
    return body;
  }
  function selection(token, depth, labelPrefix = 'if ') {
    const label = condition(token.text, labelPrefix, token);
    const yes = children(token, depth + 1);
    let no = [{ type: 'statement', text: 'SKIP', line: token.line, implicit: true }];
    const next = lines[index];
    if (next && next.indent === token.indent && /^(else\s+if\s|elif\s)/.test(next.text)) {
      index++;
      no = [selection(next, depth + 1, next.text.startsWith('elif ') ? 'elif ' : 'else if ')];
    } else if (next && next.indent === token.indent && /^else:?$/.test(next.text)) {
      index++;
      no = children(next, depth + 1);
    }
    return { type: 'if', text: label, yes, no, line: token.line };
  }
  function sequence(indent, depth) {
    const nodes = [];
    while (index < lines.length && lines[index].indent >= indent) {
      const token = lines[index];
      if (token.indent !== indent) fail('Unexpected indentation. Align this line with the statements in its block.', token);
      if (/^(else\b|elif\b|case\b|otherwise\b)/.test(token.text)) break;
      index++;
      if (token.text.startsWith('if ')) nodes.push(selection(token, depth));
      else if (/^(while|for|foreach)\s/.test(token.text)) {
        const keyword = token.text.match(/^\w+\s+/)[0];
        let text = condition(token.text, keyword, token);
        if ((keyword.trim() === 'for' || keyword.trim() === 'foreach') && /\s(?:∈|in)\s/.test(text)) {
          text = '∀' + text.replace(/^∀/, '').replace(/\s+in\s+/, ' ∈ ');
        }
        nodes.push({ type: 'loop', text, body: children(token, depth + 1), line: token.line });
      } else if (/^select:?$/.test(token.text)) {
        if (!lines[index] || lines[index].indent <= indent) fail('Indent case branches below select.', token);
        const branchIndent = lines[index].indent;
        const branches = [];
        let hasDefault = false;
        while (lines[index]?.indent === branchIndent) {
          const branch = lines[index++];
          if (hasDefault) fail('The otherwise branch must come last.', branch);
          if (!/^case\s/.test(branch.text) && !/^otherwise:?$/.test(branch.text)) fail('Use case condition or otherwise inside select.', branch);
          hasDefault = /^otherwise/.test(branch.text);
          branches.push({ text: hasDefault ? 'otherwise' : condition(branch.text, 'case ', branch), line: branch.line, body: children(branch, depth + 1) });
          if (branches.length > 12) fail('Use at most 12 branches in a selection.', token);
        }
        if (branches.length < 2) fail('A selection needs at least two case branches.', token);
        nodes.push({ type: 'select', branches, line: token.line });
      } else {
        if (/^(if|while|for|foreach|else|elif|case|otherwise)\b/.test(token.text)) fail('Check the control keyword and its condition.', token);
        nodes.push({ type: 'statement', text: token.text, line: token.line });
      }
    }
    return nodes;
  }
  const routines = [];
  while (index < lines.length) {
    const token = lines[index++];
    if (token.indent !== 0) fail('Routine signatures start at the left edge, without indentation.', token);
    const signature = token.text.replace(/^(?:function|procedure)\s+/, '');
    if (!/^[\p{L}_][\p{L}\p{N}_:]*\s*\(.*\)/u.test(signature)) fail('Write a routine signature such as search(t : Node*; k : T) : Node*.', token);
    routines.push({ signature, body: children(token, 0), line: token.line });
    if (lines[index]?.indent > 0) fail('This branch has no matching control block. Align else with its if, and cases under select.');
  }
  return routines;
}

export function notation(text) {
  if (text.startsWith('//')) return text;
  return text.replace(/->/g, '→').replace(/!=|<>/g, '≠').replace(/<=/g, '≤').replace(/>=/g, '≥')
    .replace(/&&/g, '∧').replace(/\|\|/g, '∨').replace(/!(?!=)/g, '¬').replace(/\b(?:NULL|null)\b/g, '∅');
}
