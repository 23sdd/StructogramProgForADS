import test from 'node:test';
import assert from 'node:assert/strict';
import { structureTypes, makeStructure, validateStructure, analyseStructure, graphRepresentations, hashBuckets, parseValues, readStructureFile, writeStructureFile } from '../src/structures-model.js';
import { renderStructure, structureNotation } from '../src/structures-renderer.js';

test('every course structure can be created empty and populated, exported and restored',()=>{
  for(const {kind} of structureTypes){for(const values of [[],[5,3,7]]){
    const doc=makeStructure(kind,'A',values,8);assert.deepEqual(readStructureFile(writeStructureFile([doc])),[doc]);
    const svg=renderStructure(doc);assert.match(svg,/<svg/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);assert.ok(structureNotation(doc).length>0);
  }}
});
test('values are bounded data; objects and executable content never become code',()=>{
  assert.deepEqual(parseValues('5, -3; 2.5 label'),[5,-3,2.5,'label']);assert.deepEqual(parseValues('["two words", 3]'),['two words',3]);
  assert.throws(()=>parseValues('[{}]'));assert.throws(()=>parseValues('1e999'));assert.throws(()=>makeStructure('set','S',[1,1]));
  assert.throws(()=>makeStructure('array','A',Array(65).fill(0)));
  const doc=makeStructure('s1l','<script>x</script>',['<img onerror="x">']);assert.doesNotMatch(renderStructure(doc),/<script|<img/);assert.match(renderStructure(doc),/&lt;img/);
});
test('course queue uses Z, k, n and wraps logical values into physical storage',()=>{
  const doc=makeStructure('queue','Q',[10,20,30],4);doc.start=3;validateStructure(doc);
  const svg=renderStructure(doc);assert.match(svg,/↑ k/);assert.match(structureNotation(doc),/k = 3/);assert.match(structureNotation(doc),/Z = \[20, 30, ·, 10\]/);
  assert.throws(()=>makeStructure('queue','Q',[1,2,3],2));doc.start=4;assert.throws(()=>validateStructure(doc));
});
test('empty list sentinels and list variants have correct null and circular pointers',()=>{
  assert.match(structureNotation(makeStructure('c2l','L',[])),/H→next = H/);assert.match(structureNotation(makeStructure('c2l','L',[])),/H→prev = H/);
  assert.match(structureNotation(makeStructure('h1l','L',[])),/H→next = ∅/);
  assert.match(structureNotation(makeStructure('t1l','L',[])),/L → T/);
  assert.match(structureNotation(makeStructure('c1l','L',[1,2])),/p2→key = 2; next = p1/);
});
test('AVL signs use right minus left; BST and heap violations remain visible',()=>{
  const avl=makeStructure('avl','t',[3,2,1]);const a=analyseStructure(avl);assert.equal(a.metrics.n1.balance,-2);assert.ok(a.issues.some(s=>/not AVL-balanced/.test(s)));
  const bst=makeStructure('bst','t',[3,2,4]);bst.nodes[1].key=5;assert.ok(analyseStructure(bst).issues.some(s=>/BST ordering/.test(s)));
  assert.ok(analyseStructure(makeStructure('heap','P',[1,2])).issues.some(s=>/heap/.test(s)));
});
test('manual tree construction handles cycles, disconnected nodes and invalid references safely',()=>{
  const d=makeStructure('binary','t',[1,2,3]);d.nodes[1].left='n1';assert.ok(analyseStructure(d).issues.some(s=>/cycle/.test(s)));assert.doesNotMatch(renderStructure(d),/NaN|Infinity/);
  d.nodes[1].left=null;d.nodes[0].right=null;assert.ok(analyseStructure(d).issues.some(s=>/disconnected/.test(s)));
  d.nodes[1].left='missing';assert.throws(()=>validateStructure(d));
  const b=makeStructure('bplus','B',[1,2]);b.nodes[0].children=['n1'];assert.ok(analyseStructure(b).issues.some(s=>/cycle/.test(s)));assert.doesNotMatch(renderStructure(b),/NaN|Infinity/);
});
test('simple directed and undirected graph representations agree, using 1-based neighbours',()=>{
  for(const kind of ['graph','digraph']){
    const d=makeStructure(kind,'G',['a','b','c']);d.edges=[{from:'n1',to:'n2'}];validateStructure(d);const {matrix,adj}=graphRepresentations(d);
    assert.equal(matrix[0][1],1);assert.deepEqual(adj[0],[2]);assert.equal(matrix[1][0],kind==='graph'?1:0);
    d.edges.push({from:'n1',to:'n2'});assert.throws(()=>validateStructure(d));
  }
});
test('integer hash layouts handle chaining, wraparound and collisions without hanging',()=>{
  const d=makeStructure('chain','T',[1,5,-3],4);assert.deepEqual(hashBuckets(d)[1],[1,5,-3]);
  const open=makeStructure('open','T',[3,7,11,15],4);assert.deepEqual(hashBuckets(open),[[7],[11],[15],[3]]);
  assert.throws(()=>makeStructure('open','T',[1,2,3],2));assert.throws(()=>makeStructure('direct','T',[9],8));
});
test('malformed or oversized structure files are rejected before replacing any collection',()=>{
  assert.throws(()=>readStructureFile('{}'));assert.throws(()=>readStructureFile('{'));
  const doc=makeStructure('binary','t',[1]);doc.nodes.push({...doc.nodes[0]});assert.throws(()=>validateStructure(doc));
  assert.throws(()=>readStructureFile(JSON.stringify({format:'ads-structures',version:1,structures:Array(31).fill(makeStructure('array','A'))})));
});
