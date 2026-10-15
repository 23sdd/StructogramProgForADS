import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, ParseError, notation } from '../src/parser.js';
import { render } from '../src/renderer.js';
import { examples } from '../src/examples.js';

test('all course examples produce finite, self-contained SVGs', () => {
  for (const example of examples) {
    const result = render(parse(example.source), { title: example.title });
    assert.ok(result.width > 0 && result.height > 0, example.title);
    assert.ok(!/NaN|undefined|Infinity/.test(result.svg), example.title);
    assert.match(result.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(result.svg, /<title id="diagram-title">/);
    assert.ok(!result.svg.includes('<script'));
  }
});

test('nested else binds to its matching indentation level', () => {
  const [routine] = parse(`f(x)
  if x > 0
    if x > 1
      return 2
    else
      return 1
  else
    return 0`);
  assert.equal(routine.body[0].yes[0].no[0].text, 'return 1');
  assert.equal(routine.body[0].no[0].text, 'return 0');
});

test('omitted else is an implicit SKIP with a valid source line', () => {
  const node = parse('f(x)\n  if x\n    return x')[0].body[0];
  assert.equal(node.no[0].text, 'SKIP');
  assert.equal(node.no[0].line, 2);
});

test('else if and elif preserve ordered selection semantics', () => {
  const node = parse('f(x)\n  if x < 0\n    return −1\n  else if x = 0\n    return 0\n  elif x = 1\n    return 1\n  else\n    return 2')[0].body[0];
  assert.equal(node.no[0].text, 'x = 0');
  assert.equal(node.no[0].no[0].text, 'x = 1');
  assert.equal(node.no[0].no[0].no[0].text, 'return 2');
});

test('blank lines and CRLF preserve routine boundaries and source line numbers', () => {
  const routines = parse('f()\r\n  SKIP\r\n\r\ng()\r\n  return 0');
  assert.equal(routines.length, 2);
  assert.equal(routines[1].line, 4);
  assert.equal(routines[1].body[0].line, 5);
});

test('multiway selection keeps each guard and its body', () => {
  const node = parse('f(x)\n  select\n    case x < 0\n      return −1\n    case x = 0\n      return 0\n    otherwise\n      return 1')[0].body[0];
  assert.deepEqual(node.branches.map(branch => branch.text), ['x < 0', 'x = 0', 'otherwise']);
  assert.equal(node.branches[2].body[0].text, 'return 1');
});

test('collection loops print quantification while numerical loops keep their limits', () => {
  const nodes = parse('f(G)\n  for u in G.V\n    visit(u)\n  for i := 0 to n − 1\n    visit(i)')[0].body;
  assert.equal(nodes[0].text, '∀u ∈ G.V');
  assert.equal(nodes[1].text, 'i := 0 to n − 1');
});

test('malformed indentation, unmatched branches and missing bodies report source lines', () => {
  for (const [source, line] of [
    ['f()\n  x := 1\n    x := 2', 3],
    ['f()\n  if x', 2],
    ['f()\n  if x\n    y := 1\n   else\n    y := 2', 4],
    ['f()\n  else\n    SKIP', 2],
    ['f()\n  select\n    case x\n      SKIP', 2],
    ['f()\n  select\n    otherwise\n      SKIP\n    case x\n      SKIP', 5],
    ['f()\n  if\n    SKIP', 2]
  ]) assert.throws(() => parse(source), error => error instanceof ParseError && error.line === line, source);
});

test('ASCII labels preserve assignment, equality, and literal comments', () => {
  assert.equal(notation('x := p->key; x = y && x != NULL || y <= z && z >= 0 && !b'), 'x := p→key; x = y ∧ x ≠ ∅ ∨ y ≤ z ∧ z ≥ 0 ∧ ¬b');
  assert.equal(notation('// a -> b != NULL'), '// a -> b != NULL');
});

test('export escapes user text in signatures, statements, and titles', () => {
  const { svg } = render(parse('f(x : A<B>)\n  <script>alert("hi")</script>'), { title: '</title><script>bad()</script>' });
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /A&lt;B&gt;/);
});

test('long identifiers wrap without losing text', () => {
  const token = 'veryLongIdentifier'.repeat(15);
  const { svg, width, height } = render(parse(`f()\n  ${token}`));
  assert.ok(width < 600);
  assert.ok(height > 150);
  const text = [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map(match => match[1]).join('');
  assert.ok(text.includes(token));
});

test('document size, line count and nesting are bounded', () => {
  assert.throws(() => parse('x'.repeat(100_001)), ParseError);
  assert.throws(() => parse('f()\n' + '  SKIP\n'.repeat(1501)), ParseError);
  const nested = ['f()', ...Array.from({ length: 27 }, (_, i) => '  '.repeat(i + 1) + 'while x'), '  '.repeat(28) + 'SKIP'].join('\n');
  assert.throws(() => parse(nested), /nested blocks/);
});
