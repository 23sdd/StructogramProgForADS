import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionSession } from '../src/execution-runtime.js';
import { executionExpression } from '../src/execution-language.js';
import { structureTypes, makeStructure } from '../src/structures-model.js';
import { renderExecutionStructure } from '../src/execution-view.js';
import { examples } from '../src/examples.js';
function finish(session){let state;for(let i=0;i<21000;i++){state=session.step();if(state.done||state.error)return state;}throw Error('Did not terminate');}
function example(id){return examples.find(e=>e.id===id).source;}
function graph(kind='graph') {const g=makeStructure(kind,'G',['a','b','c','d','unreachable']);g.edges=[{from:'n1',to:'n2'},{from:'n1',to:'n3'},{from:'n2',to:'n4'},{from:'n3',to:'n4'}];return g;}
function bfs(g=graph(),source=example('bfs')){return new ExecutionSession(source,'BFS',{G:{structure:g},s:{vertex:'n1',graphParam:'G'}});}
test('written BFS executes with actual FIFO queue, distances, predecessors and unreachable nodes',()=>{
 const g=graph(),original=JSON.stringify(g),s=bfs(g),states=[];let state;do{state=s.step();states.push(state);}while(!state.done&&!state.error);
 assert.equal(state.error,null);assert.ok(states.length>30);const nodes=state.structures[0].nodes;
 assert.deepEqual(nodes.map(n=>n.d),['0','1','1','2','∞']);assert.equal(nodes[3].pi,'n2');assert.equal(nodes[4].pi,null);
 assert.ok(states.some(s=>s.variables.some(v=>v.name==='Q'&&v.value.includes('n2')&&v.value.includes('n3'))));assert.ok(states.some(s=>s.structures[0].edge));assert.equal(JSON.stringify(g),original);
});
test('edits to BFS change execution rather than replaying a canned traversal',()=>{
 const state=finish(bfs(graph(),example('bfs').replace('d(u) + 1','d(u) + 2')));assert.equal(state.error,null);assert.equal(state.structures[0].nodes[3].d,'4');
 const directed=graph('digraph');const reverse=new ExecutionSession(example('bfs'),'BFS',{G:{structure:directed},s:{vertex:'n4',graphParam:'G'}});const end=finish(reverse);assert.deepEqual(end.structures[0].nodes.map(n=>n.d),['∞','∞','∞','0','∞']);
});
test('insertion-sort example updates a copied array, including duplicate and negative values',()=>{
 for(const input of [[],[1],[5,-2,5,0,3]]){const doc=makeStructure('array','A',input);const end=finish(new ExecutionSession(example('insertion'),'insertionSort',{A:{structure:doc}}));assert.equal(end.error,null);assert.deepEqual(end.structures[0].doc.values,[...input].sort((a,b)=>a-b));assert.deepEqual(doc.values,input);}
});
test('BST search, recursive traversals, AVL height calculation and by-reference insertion work',()=>{
 const tree=makeStructure('bst','t',[5,3,7,1]);
 let end=finish(new ExecutionSession(example('search'),'search',{t:{structure:tree},k:3}));assert.equal(end.error,null);assert.match(end.result,/n2/);
 end=finish(new ExecutionSession(example('traversal'),'inorder',{t:{structure:tree}}));assert.equal(end.error,null);assert.deepEqual(end.output,['n4 (1)','n2 (3)','n1 (5)','n3 (7)']);
 end=finish(new ExecutionSession(example('balances'),'fillBalances',{t:{structure:tree}}));assert.equal(end.error,null);assert.equal(end.result,'2');assert.equal(end.structures[0].nodes[0].b,-1);
 end=finish(new ExecutionSession(example('insert'),'insert',{t:{structure:tree},k:6}));assert.equal(end.error,null);assert.equal(end.structures[0].nodes.length,5);assert.equal(end.structures[0].nodes.find(n=>n.key===7).left,end.structures[0].nodes.find(n=>n.key===6).id);
 const empty=makeStructure('bst','t',[]);end=finish(new ExecutionSession(example('insert'),'insert',{t:{structure:empty},k:9}));assert.equal(end.error,null);assert.equal(end.structures[0].doc.root,end.structures[0].nodes[0].id);
});
test('bounds, null pointers, queue underflow, infinite loops and recursion stop with source lines',()=>{
 const cases=[['f(A : T[n])\n  A[n] := 1',{A:{structure:makeStructure('array','A',[1])}},/Index/],['f(t : Node*)\n  x := t→key',{t:null},/∅/],['f()\n  Q : Queue\n  x := Q.rem()',{},/Underflow/],['f()\n  while true\n    SKIP',{},/limit/],['f()\n  f()',{},/depth/]];
 for(const [source,args,message]of cases){const end=finish(new ExecutionSession(source,'f',args,{maxSteps:100}));assert.match(end.error,message);assert.ok(end.line>0);}
});
test('unsupported statements and hostile expressions never reach JavaScript evaluation',()=>{
 for(const source of ['f()\n  document.body.remove()', 'f()\n  x := A.constructor(1)', 'f()\n  eval(\"globalThis.pwned=1\")']){const end=finish(new ExecutionSession(source,'f'));assert.ok(end.error);}
 assert.equal(globalThis.pwned,undefined);assert.throws(()=>executionExpression('(()=>1)()'));assert.throws(()=>executionExpression('2 ** 3'));
});

test('missing initialization and invalid ADT operations are real runtime errors',()=>{
 const missing=example('bfs').replace('    d(u) := ∞; π(u) := ∅','    SKIP');assert.match(finish(bfs(graph(),missing)).error,/not been initialized/);
 const badPi=example('bfs').replace('π(v) := u','π(v) := 7');assert.match(finish(bfs(graph(),badPi)).error,/must be/);
 assert.match(finish(new ExecutionSession('f()\n  Q : Queue\n  Q.add(1)\n  x := Q.remMax()','f')).error,/Unsupported queue/);
});

test('every saved structure type can be bound and visualized as a working copy',()=>{
 for(const type of structureTypes){const doc=makeStructure(type.kind,'input',[5,3,7],8);const state=finish(new ExecutionSession('f(x : T)\n  SKIP','f',{x:{structure:doc}}));assert.equal(state.error,null,type.kind);assert.match(renderExecutionStructure(state.structures[0]),/<svg/,type.kind);}
});
test('self-containing containers and cross-copy pointer writes are rejected instead of creating unsafe snapshots',()=>{
 assert.match(finish(new ExecutionSession('f()\n  Q : Queue\n  Q.add(Q)','f')).error,/scalar values or node references/);
 assert.match(finish(new ExecutionSession('f(A : T[n])\n  A[0] := A','f',{A:{structure:makeStructure('array','A',[1])}})).error,/nested containers/);
 const tree=makeStructure('bst','t',[1]);assert.match(finish(new ExecutionSession('f(a, b : Node*)\n  a→left := b','f',{a:{structure:tree},b:{structure:tree}})).error,/Cross-structure/);
});

test('comments stay inert across semicolons and numeric operations use mathematical mod',()=>{
 const source='f()\n  // a note; unsupported()\n  x := -1 mod 4\n  y := 1\n  if false ∧ missing = 1\n    y := 2\n  return x';
 const state=finish(new ExecutionSession(source,'f'));assert.equal(state.error,null);assert.equal(state.result,'3');assert.ok(state.variables.some(v=>v.name==='y'&&v.value==='1'));
});

test('declared scalars and local array cells cannot silently supply default values',()=>{
 assert.match(finish(new ExecutionSession('f()\n  n : N\n  return n','f')).error,/uninitialized/);
 assert.match(finish(new ExecutionSession('f()\n  A : T[2]\n  x := A[0]','f')).error,/not been initialized/);
 const ok=finish(new ExecutionSession('f()\n  A : T[2]\n  A[0] := 3\n  return A[0]','f'));assert.equal(ok.error,null);assert.equal(ok.result,'3');
});
