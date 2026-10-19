// Structure documents contain data only. They are never evaluated as code.
export const structureTypes = [
  ['array','Array','linear'], ['stack','Stack','linear'], ['queue','Circular queue','linear'],
  ['s1l','Singly linked list · S1L','list'], ['h1l','Header singly linked list · H1L','list'], ['t1l','Trailer singly linked list','list'],
  ['c1l','Circular singly linked list','list'], ['s2l','Doubly linked list · S2L','list'], ['c2l','Header circular doubly linked list · C2L','list'],
  ['binary','Binary tree','tree'], ['bst','Binary search tree','tree'], ['avl','AVL tree','tree'],
  ['heap','Max heap / priority queue','linear'], ['general','General tree · firstChild / nextSibling','tree'], ['bplus','B+ tree · manual construction','tree'],
  ['direct','Direct-address table','hash'], ['chain','Hash table · chaining','hash'], ['open','Hash table · open addressing','hash'],
  ['set','Set · T{}','linear'], ['sequence','Sequence · T⟨⟩','linear'], ['graph','Undirected graph','graph'], ['digraph','Directed graph','graph']
].map(([kind,label,family])=>({kind,label,family}));
export const structureLimit = 64;
export function structureType(kind) {
  const result=structureTypes.find(type=>type.kind===kind);
  if(!result) throw Error('Unknown structure type.');
  return result;
}
export function parseValues(text) {
  if(typeof text!=='string'||text.length>12000) throw Error('Use a value list shorter than 12,000 characters.');
  const source=text.trim();
  let values;
  if(!source) values=[];
  else if(source.startsWith('[')) { try{values=JSON.parse(source);}catch{throw Error('Invalid JSON value list. Example: [5, 3, "label"].');} }
  else values=source.split(/[\s,;]+/u).filter(Boolean).map(value=>/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)?Number(value):value);
  validateValues(values);
  return values;
}
function validateValues(values) {
  if(!Array.isArray(values)||values.length>structureLimit) throw Error(`Use at most ${structureLimit} values.`);
  for(const value of values) if(!((typeof value==='number'&&Number.isFinite(value))||(typeof value==='string'&&value.length<=80))) throw Error('Values must be finite numbers or text of at most 80 characters.');
}
function integer(value,min,max,label) { if(!Number.isInteger(value)||value<min||value>max) throw Error(`${label} must be an integer between ${min} and ${max}.`); }
export function makeStructure(kind,name,values=[],capacity=8) {
  const type=structureType(kind);validateValues(values);
  const doc={kind,name:name.trim()||'A',values:[...values],capacity,start:0,nodes:[],edges:[],root:null};
  if(type.family==='tree'||type.family==='graph'){
    doc.nodes=values.map((key,index)=>({id:'n'+(index+1),key,left:null,right:null,firstChild:null,nextSibling:null,keys:kind==='bplus'?[key]:[],children:[],next:null}));
    doc.values=[];doc.root=doc.nodes[0]?.id||null;
    if(kind==='bst'||kind==='avl') {
      doc.root=null;
      for(const node of doc.nodes){
        if(doc.root===null){doc.root=node.id;continue;}
        let current=doc.nodes.find(n=>n.id===doc.root);
        while(true){
          const field=node.key<current.key?'left':'right';
          if(current[field]===null){current[field]=node.id;break;}
          current=doc.nodes.find(n=>n.id===current[field]);
        }
      }
    }else if(kind==='binary'){
      doc.nodes.forEach((n,i)=>{n.left=doc.nodes[i*2+1]?.id||null;n.right=doc.nodes[i*2+2]?.id||null;});
    }else if(kind==='general'){
      if(doc.nodes[0])doc.nodes[0].firstChild=doc.nodes[1]?.id||null;
      doc.nodes.slice(1).forEach((n,i)=>{n.nextSibling=doc.nodes[i+2]?.id||null;});
    }else if(kind==='bplus'){
      // Start with one editable leaf; users explicitly construct internal nodes.
      doc.nodes=values.length?[{...doc.nodes[0],keys:[...values]}]:[];
    }
  }
  return validateStructure(doc);
}
export function validateStructure(raw) {
  if(!raw||typeof raw!=='object')throw Error('Invalid structure document.');
  const type=structureType(raw.kind);
  if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>60)throw Error('Give the structure a name of 1–60 characters.');
  validateValues(raw.values);integer(raw.capacity,1,64,'Capacity');integer(raw.start,0,raw.capacity-1,'Queue start k');
  if(!Array.isArray(raw.nodes)||raw.nodes.length>64||!Array.isArray(raw.edges)||raw.edges.length>512)throw Error('Use at most 64 nodes and 512 edges.');
  const ids=new Set();
  const nodes=raw.nodes.map(n=>{
    if(!n||typeof n.id!=='string'||!/^n[1-9]\d{0,5}$/.test(n.id)||ids.has(n.id))throw Error('Node IDs must be unique, e.g. n1, n2.');
    ids.add(n.id);validateValues([n.key]);validateValues(n.keys||[]);
    if(!Array.isArray(n.children||[])||(n.children||[]).length>64)throw Error('Invalid child list.');
    return {id:n.id,key:n.key,left:n.left??null,right:n.right??null,firstChild:n.firstChild??null,nextSibling:n.nextSibling??null,keys:[...(n.keys||[])],children:[...(n.children||[])],next:n.next??null};
  });
  for(const n of nodes)for(const ref of [n.left,n.right,n.firstChild,n.nextSibling,n.next,...n.children])if(ref!==null&&!ids.has(ref))throw Error(`Unknown pointer ${String(ref).slice(0,80)} in ${n.id}.`);
  if(raw.root!==null&&!ids.has(raw.root))throw Error('Root must reference an existing node or ∅.');
  const edges=raw.edges.map(e=>{if(!e||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)throw Error('An edge must join two distinct existing nodes.');return{from:e.from,to:e.to};});
  const seen=new Set();for(const e of edges){const key=type.kind==='graph'?[e.from,e.to].sort().join(':'):e.from+':'+e.to;if(seen.has(key))throw Error('Duplicate graph edge.');seen.add(key);}
  if(['stack','queue','heap'].includes(raw.kind)&&raw.values.length>raw.capacity)throw Error('The values exceed the storage capacity.');
  if(raw.kind==='set'&&new Set(raw.values).size!==raw.values.length)throw Error('A set cannot contain duplicate values.');
  if(['heap','direct','chain','open','bst','avl','bplus'].includes(raw.kind)){
    const keys=type.family==='tree'?nodes.flatMap(n=>raw.kind==='bplus'?n.keys:[n.key]):raw.values;
    if(keys.some(k=>typeof k!=='number'||!Number.isSafeInteger(k)))throw Error('This editor uses safe integer keys for ordered trees, heaps and hash tables.');
  }
  if(raw.kind==='direct'&&raw.values.some(v=>v<0||v>=raw.capacity))throw Error('Direct-address keys must be in 0..m−1.');
  if(['direct','chain','open'].includes(raw.kind)&&new Set(raw.values).size!==raw.values.length)throw Error('Hash-table keys must be unique.');
  if(raw.kind==='open'&&raw.values.length>raw.capacity)throw Error('The open-address table is full.');
  return{kind:raw.kind,name:raw.name.trim(),values:[...raw.values],capacity:raw.capacity,start:raw.start,nodes,edges,root:raw.root};
}
export function treeLinks(doc,node) {
  if(doc.kind==='general')return[node.firstChild,node.nextSibling].filter(Boolean);
  if(doc.kind==='bplus')return node.children;
  return[node.left,node.right].filter(Boolean);
}
export function analyseStructure(doc) {
  const issues=[];const metrics={};const type=structureType(doc.kind);
  if(doc.kind==='heap')doc.values.forEach((key,i)=>{if(i&&doc.values[Math.floor((i-1)/2)]<key)issues.push(`Max-heap order is violated at A[${i}].`);});
  if(type.family!=='tree')return{issues,metrics};
  const byId=new Map(doc.nodes.map(n=>[n.id,n])),active=new Set(),visited=new Set(),parents=new Map();
  let cyclic=false;
  function visit(id){if(!id)return -1;if(active.has(id)){cyclic=true;return -1;}if(visited.has(id))return metrics[id]?.height??-1;active.add(id);const n=byId.get(id);const links=treeLinks(doc,n);let height=-1;for(const child of links){parents.set(child,(parents.get(child)||0)+1);height=Math.max(height,visit(child));}active.delete(id);visited.add(id);const lh=metrics[n.left]?.height??-1,rh=metrics[n.right]?.height??-1;metrics[id]={height:height+1,balance:rh-lh};return height+1;}
  visit(doc.root);for(const n of doc.nodes)if(!visited.has(n.id)){issues.push(`${n.id} is disconnected from the root.`);visit(n.id);}
  if(doc.nodes.length&&!doc.root)issues.push('Choose a root.');
  if(cyclic)issues.push('Tree pointers contain a cycle.');
  for(const [id,n]of parents)if(n>1)issues.push(`${id} has more than one incoming tree pointer.`);
  if(!cyclic&&['bst','avl'].includes(doc.kind)){
    const check=(id,low,high)=>{if(!id)return;const n=byId.get(id);if(n.key<=low||n.key>=high)issues.push(`${id}: key ${n.key} violates strict BST ordering.`);check(n.left,low,Math.min(high,n.key));check(n.right,Math.max(low,n.key),high);};
    // Shared children can multiply paths, so report their topology before checking order.
    if([...parents.values()].every(n=>n<=1))check(doc.root,-Infinity,Infinity);
    if(doc.kind==='avl')for(const [id,m]of Object.entries(metrics))if(Math.abs(m.balance)>1)issues.push(`${id}: b = ${m.balance}; this node is not AVL-balanced.`);
  }
  if(!cyclic&&doc.kind==='bplus'){
    const depths=new Set(),seen=new Set();
    const check=(id,depth,lo,hi)=>{if(!id||seen.has(id))return;seen.add(id);const n=byId.get(id);if(n.keys.some((k,i)=>i>0&&n.keys[i-1]>=k))issues.push(`${id}: keys must be strictly increasing.`);if(n.keys.some(k=>k<lo||k>=hi))issues.push(`${id}: a key is outside its separator range.`);if(n.children.length){if(n.children.length!==n.keys.length+1)issues.push(`${id}: an internal node needs keys.length + 1 children.`);n.children.forEach((c,i)=>check(c,depth+1,i===0?lo:n.keys[i-1]??hi,i===n.keys.length?hi:n.keys[i]??hi));}else depths.add(depth);};
    check(doc.root,0,-Infinity,Infinity);if(depths.size>1)issues.push('B+ leaves are not at the same depth.');
    {
      for(const n of doc.nodes)if(n.children.length&&n.next)issues.push(`${n.id}: next belongs to leaves, not internal nodes.`);
      const leaves=[];const seenLeaves=new Set();const collect=id=>{if(!id||seenLeaves.has(id))return;seenLeaves.add(id);const n=byId.get(id);if(n.children.length)n.children.forEach(collect);else leaves.push(n);};collect(doc.root);
      leaves.forEach((n,i)=>{if(n.next!==(leaves[i+1]?.id||null))issues.push(`${n.id}: next should be ${leaves[i+1]?.id||'∅'} in the leaf chain.`);});
    }
  }
  if(doc.kind==='general'&&doc.root&&byId.get(doc.root).nextSibling)issues.push('The root must not have a nextSibling.');
  return{issues:[...new Set(issues)],metrics};
}
export function graphRepresentations(doc) {
  const ids=doc.nodes.map(n=>n.id),adj=ids.map(()=>[]),matrix=ids.map(()=>ids.map(()=>0));
  for(const e of doc.edges){const i=ids.indexOf(e.from),j=ids.indexOf(e.to);matrix[i][j]=1;adj[i].push(j+1);if(doc.kind==='graph'){matrix[j][i]=1;adj[j].push(i+1);}}
  return{matrix,adj:adj.map(a=>a.sort((a,b)=>a-b))};
}
export function hashBuckets(doc) {
  const slots=Array.from({length:doc.capacity},()=>[]);
  for(const key of doc.values){let j=doc.kind==='direct'?key:((key%doc.capacity)+doc.capacity)%doc.capacity;if(doc.kind==='open')while(slots[j].length)j=(j+1)%doc.capacity;slots[j].push(key);}
  return slots;
}
export function readStructureFile(text) {
  if(typeof text!=='string'||text.length>500000)throw Error('Open a structure file smaller than 500 KB.');
  let file;try{file=JSON.parse(text);}catch{throw Error('The file is not valid JSON.');}
  if(file?.format!=='ads-structures'||file.version!==1||!Array.isArray(file.structures)||file.structures.length>30)throw Error('Choose an ADS structures file (version 1, at most 30 structures).');
  return file.structures.map(validateStructure);
}
export function writeStructureFile(structures) {
  if(!Array.isArray(structures)||structures.length>30)throw Error('Store at most 30 structures.');
  return JSON.stringify({format:'ads-structures',version:1,structures:structures.map(validateStructure)},null,2);
}
