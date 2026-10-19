import { parse } from './parser.js';
import { compileExecution, executionExpression, ExecutionError } from './execution-language.js';
import { validateStructure, structureType, hashBuckets } from './structures-model.js';

const executionUninitialized = Symbol('uninitialized');

export class ExecutionSession {
  constructor(source, entryName, bindings = {}, { maxSteps = 10000 } = {}) {
    this.routines = compileExecution(parse(source), source);
    this.entry = this.routines.find(r => r.name === entryName);
    if (!this.entry) throw new ExecutionError('Choose a routine to execute.');
    this.maxSteps = Math.max(1, Math.min(20000, maxSteps));
    this.steps = 0; this.operations = 0; this.line = this.entry.line; this.frames = [];
    this.origins = []; this.output = []; this.activeNodes = new Set(); this.activeIndices = new Set();
    this.activeEdge = null; this.lastVertex = null; this.result = undefined; this.done = false; this.error = null;
    this.bindings = new Map();
    // Structures are copied before binding scalars/vertices, so references share their graph.
    for (const parameter of this.entry.params) {
      const binding = bindings[parameter.name];
      if (binding && typeof binding === 'object' && binding.structure) this.bindings.set(parameter.name, this.loadStructure(binding.structure, parameter.name, parameter.type));
    }
    for (const parameter of this.entry.params) {
      if (this.bindings.has(parameter.name)) continue;
      const binding = bindings[parameter.name];
      if (binding && typeof binding === 'object' && binding.vertex) {
        const graph = this.bindings.get(binding.graphParam);
        const vertex = graph?.tag === 'graph' ? graph.vertices.find(v => v.id === binding.vertex) : null;
        if (!vertex) throw new ExecutionError(`Choose a vertex from the graph bound to ${binding.graphParam}.`);
        this.bindings.set(parameter.name, vertex);
      } else if (binding === null || typeof binding === 'string' || typeof binding === 'boolean' || (typeof binding === 'number' && Number.isFinite(binding))) this.bindings.set(parameter.name, binding);
      else throw new ExecutionError(`Bind a value or structure to ${parameter.name}.`);
    }
    this.iterator = this.program();
  }
  loadStructure(input, parameter, declaredType = '') {
    const doc = validateStructure(input), family = structureType(doc.kind).family;
    const origin = { doc, parameter, nodes:[], root:null, value:null };
    const node = (id,key,tag='node') => ({ tag,id,key,origin,left:null,right:null,firstChild:null,nextSibling:null,next:null,prev:null,parent:null,b:0,d:Infinity,pi:null,color:'white' });
    if (family === 'graph') {
      origin.nodes = doc.nodes.map((n,i) => ({...node(n.id,n.key,'vertex'),index:i+1,initialized:new Set()}));
      const graph = {tag:'graph',origin,vertices:origin.nodes,adj:new Map(origin.nodes.map(n=>[n,[]]))};
      for (const edge of doc.edges) { const a=origin.nodes.find(n=>n.id===edge.from),b=origin.nodes.find(n=>n.id===edge.to);graph.adj.get(a).push(b);if(doc.kind==='graph')graph.adj.get(b).push(a); }
      for(const neighbours of graph.adj.values())neighbours.sort((a,b)=>a.index-b.index);
      origin.value=graph;
    } else if (family === 'tree') {
      origin.nodes = doc.nodes.map(n => ({...node(n.id,n.key),keys:[...n.keys],children:[]}));
      const map=new Map(origin.nodes.map(n=>[n.id,n]));
      for(const source of doc.nodes){const n=map.get(source.id);for(const field of ['left','right','firstChild','nextSibling','next'])n[field]=map.get(source[field])||null;n.children=source.children.map(id=>map.get(id));for(const child of [n.left,n.right,...n.children])if(child)child.parent=n;}
      origin.root=map.get(doc.root)||null;origin.value=origin.root;
    } else if (family === 'list') {
      origin.nodes=doc.values.map((key,i)=>node('p'+(i+1),key));
      const header=['h1l','c2l'].includes(doc.kind)?node('H','H'):null;
      const trailer=doc.kind==='t1l'?node('T','T'):null;
      const list=[...(header?[header]:[]),...origin.nodes,...(trailer?[trailer]:[])];
      list.forEach((n,i)=>{n.next=list[i+1]||(['c1l','c2l'].includes(doc.kind)?list[0]||null:null);n.prev=i?list[i-1]:doc.kind==='c2l'?list.at(-1):null;});
      origin.nodes=list;origin.root=header||origin.nodes[0]||trailer;origin.value=origin.root;
    } else if (doc.kind==='heap'&&declaredType.includes('[')) {
      origin.value={tag:'array',values:[...doc.values],base:0,origin};
    } else if (['stack','queue','heap'].includes(doc.kind)) {
      origin.value={tag:'queue',kind:doc.kind,items:[...doc.values],capacity:doc.capacity,start:doc.start,origin};
    } else if (family==='hash') {
      const buckets=hashBuckets(doc);
      const values=buckets.map((bucket,i)=>{
        if(doc.kind!=='chain')return bucket[0]??(doc.kind==='open'?'E':null);
        let head=null;for(let j=bucket.length-1;j>=0;j--){const n=node('h'+i+'_'+j,bucket[j]);n.next=head;head=n;origin.nodes.push(n);}return head;
      });origin.value={tag:'array',values,base:0,origin};
    } else origin.value={tag:doc.kind==='set'?'collection':'array',values:[...doc.values],base:doc.kind==='sequence'?1:0,origin};
    this.origins.push(origin); return origin.value;
  }
  fail(message) { throw new ExecutionError(message,this.line); }
  charge() { if(++this.operations>1000000)this.fail('Operation limit reached. Check for non-termination.'); }
  cell(value,origin=value?.origin) { return {origin,peek:()=>value,get:()=>{if(value===executionUninitialized)this.fail('Read of an uninitialized local variable.');return value;},set:next=>{value=next;}}; }
  lookup(env,name) { if(!env.has(name))this.fail(`Unknown variable ${name}.`);return env.get(name).get(); }
  touch(value) { if(value?.tag==='node'||value?.tag==='vertex')this.activeNodes.add(value);return value; }
  numeric(value) { if(typeof value!=='number'||Number.isNaN(value))this.fail('A numeric value is required.');return value; }
  finite(value) { this.numeric(value);if(!Number.isFinite(value))this.fail('A finite numeric value is required.');return value; }
  scalar(value) { if(value!==null&&!['number','string','boolean'].includes(typeof value))this.fail('Expected a scalar value.');return value; }
  noteVertex(value) {
    if(value?.tag!=='vertex')return;
    if(this.lastVertex&&this.lastVertex!==value&&this.lastVertex.origin===value.origin){const graph=value.origin.value;if(graph.adj.get(this.lastVertex).includes(value))this.activeEdge={origin:value.origin,from:this.lastVertex.id,to:value.id};}
    this.touch(value);
  }
  *evaluate(ast,env) {
    this.charge();
    if(ast.kind==='literal')return ast.value;
    if(ast.kind==='name'){
      if(['white','gray','grey','black','E','D'].includes(ast.name)&&!env.has(ast.name))return ast.name;
      return this.touch(this.lookup(env,ast.name));
    }
    if(ast.kind==='unary'){const arg=yield* this.evaluate(ast.arg,env);return ast.op==='¬'||ast.op==='!'?!Boolean(arg):ast.op==='-'?-this.numeric(arg):this.numeric(arg);}
    if(ast.kind==='round'){const value=this.finite(yield* this.evaluate(ast.arg,env));return ast.op==='⌊'?Math.floor(value):Math.ceil(value);}
    if(ast.kind==='binary'){
      const a=yield* this.evaluate(ast.left,env);
      if(ast.op==='∧'&&!a)return false;if(ast.op==='∨'&&a)return true;
      const b=yield* this.evaluate(ast.right,env);
      if(ast.op==='∧'||ast.op==='∨')return Boolean(b);
      if(ast.op==='=')return a===b;if(ast.op==='≠')return a!==b;
      if(['<','>','≤','≥'].includes(ast.op)){if(typeof a!==typeof b||!['number','string'].includes(typeof a))this.fail('Compare two numbers or two strings.');return ast.op==='<'?a<b:ast.op==='>'?a>b:ast.op==='≤'?a<=b:a>=b;}
      this.numeric(a);this.numeric(b);
      if(['/', '%','mod','div'].includes(ast.op)&&b===0)this.fail('Division by zero.');
      const value=ast.op==='+'?a+b:ast.op==='-'?a-b:ast.op==='*'?a*b:ast.op==='/'?a/b:ast.op==='div'?Math.floor(a/b):ast.op==='mod'?a-Math.floor(a/b)*b:a%b;
      if(Number.isNaN(value))this.fail('Undefined numeric result.');return value;
    }
    if(ast.kind==='field'||ast.kind==='index')return (yield* this.reference(ast,env,false)).get();
    if(ast.kind==='new-node'){
      const key=this.scalar(yield* this.evaluate(ast.arg,env));const contextual=[...env.values()].map(cell=>cell.origin||(cell.peek?cell.peek():cell.get())?.origin).find(o=>o&&structureType(o.doc.kind).family==='tree');const trees=this.origins.filter(o=>structureType(o.doc.kind).family==='tree');const origin=contextual||(trees.length===1?trees[0]:null);
      if(!origin)this.fail('new Node needs a bound tree.');if(origin.nodes.length>=128)this.fail('Runtime node limit reached (128).');
      const id='r'+(origin.nodes.length+1);const value={tag:'node',id,key,origin,left:null,right:null,parent:null,firstChild:null,nextSibling:null,next:null,prev:null,b:0,d:Infinity,pi:null,color:'white',keys:[],children:[]};origin.nodes.push(value);this.touch(value);return value;
    }
    if(ast.kind==='call')return yield* this.callExpression(ast,env);
    this.fail('Unsupported expression.');
  }
  *reference(ast,env,create=true) {
    if(ast.kind==='name') { if(!env.has(ast.name)){if(!create)this.fail(`Unknown variable ${ast.name}.`);env.set(ast.name,this.cell(0));}return env.get(ast.name); }
    if(ast.kind==='call'&&ast.target.kind==='name'&&['d','π','pi','color'].includes(ast.target.name)){
      if(ast.args.length!==1)this.fail('Vertex attributes need one vertex argument.');
      const vertex=yield* this.evaluate(ast.args[0],env);if(vertex?.tag!=='vertex')this.fail('d(v), π(v) and color(v) need a graph vertex.');
      const field=['π','pi'].includes(ast.target.name)?'pi':ast.target.name;return{get:()=>{if(!vertex.initialized.has(field))this.fail(`${field}(${vertex.id}) has not been initialized.`);return vertex[field];},set:value=>{if(field==='d')this.numeric(value);if(field==='pi'&&value?.origin&&value.origin!==vertex.origin)this.fail('A predecessor must belong to the same graph.');if(field==='pi'&&value!==null&&value?.tag!=='vertex')this.fail('π(v) must be ∅ or a vertex.');if(field==='color'&&typeof value!=='string')this.fail('A color must be text.');vertex[field]=value;vertex.initialized.add(field);this.noteVertex(vertex);}};
    }
    if(ast.kind==='index'){
      const array=yield* this.evaluate(ast.object,env),index=this.finite(yield* this.evaluate(ast.index,env));
      if(array?.tag!=='array'&&array?.tag!=='collection')this.fail('Only a bound array or sequence supports indexing.');
      const i=index-(array.base||0);if(!Number.isInteger(i)||i<0||i>=array.values.length)this.fail(`Index ${index} is outside ${array.base||0}..${(array.base||0)+array.values.length-1}.`);
      this.activeIndices.add((array.origin?.parameter||'array')+':'+i);
      return{peek:()=>array.values[i],get:()=>{if(array.values[i]===executionUninitialized)this.fail(`Array index ${index} has not been initialized.`);return this.touch(array.values[i]);},set:value=>{if(value&&typeof value==='object'&&!['node','vertex'].includes(value.tag))this.fail('Array cells support scalar values or node references, not nested containers.');array.values[i]=value;}};
    }
    if(ast.kind==='field'){
      const object=yield* this.evaluate(ast.object,env),field=ast.name==='π'?'pi':ast.name;
      if(object===null)this.fail(`Cannot read ${field} through ∅.`);
      if(object?.tag==='node'||object?.tag==='vertex'){
        if(!['key','left','right','parent','firstChild','nextSibling','next','prev','b','d','pi','color','index'].includes(field))this.fail(`Unsupported node field ${field}.`);
        this.touch(object);return{origin:object.origin,peek:()=>object[field]??null,get:()=>{if(object.tag==='vertex'&&['d','pi','color'].includes(field)&&!object.initialized.has(field))this.fail(`${object.id}→${field} has not been initialized.`);return object[field]??null;},set:value=>{
          if(['left','right','parent','firstChild','nextSibling','next','prev','pi'].includes(field)&&value!==null&&!['node','vertex'].includes(value?.tag))this.fail('A pointer must be ∅ or a node.');
          if(field==='index')this.fail('Vertex indices are read-only.');if(['left','right','parent','firstChild','nextSibling','next','prev','pi'].includes(field)&&value?.origin&&value.origin!==object.origin)this.fail('Cross-structure pointers are not supported in this runner yet.');if(field==='key')this.scalar(value);if(['b','d'].includes(field))this.numeric(value);if(field==='color'&&typeof value!=='string')this.fail('A color must be text.');object[field]=value;if(object.tag==='vertex')object.initialized.add(field);
        }};
      }
      let value;
      if((object?.tag==='array'||object?.tag==='collection')&&field==='length')value=object.values.length;
      else if(object?.tag==='graph'&&field==='V')value={tag:'collection',values:object.vertices,base:1};
      else if(object?.tag==='queue'&&field==='n')value=object.items.length;
      else if(object?.tag==='queue'&&field==='k')value=object.start;
      else if(object?.tag==='queue'&&field==='length')value=object.items.length;
      else this.fail(`Unsupported field ${field}.`);
      return{get:()=>value,set:()=>this.fail(`${field} is read-only; use the supported operations.`)};
    }
    this.fail('This expression cannot be assigned to.');
  }
  *callExpression(ast,env){
    if(ast.target.kind==='name'){
      const name=ast.target.name;
      if(['d','π','pi','color'].includes(name))return(yield* this.reference(ast,env,false)).get();
      const routine=this.routines.find(r=>r.name===name);
      if(routine){if(ast.args.length!==routine.params.length)this.fail(`Wrong number of arguments for ${name}.`);const args=[];
        for(let i=0;i<ast.args.length;i++)args.push(routine.params[i].reference?yield* this.reference(ast.args[i],env):this.cell(yield* this.evaluate(ast.args[i],env)));
        return yield* this.invoke(routine,args);
      }
      if(name==='swap'){
        if(ast.args.length!==2)this.fail('swap needs two writable arguments.');const a=yield* this.reference(ast.args[0],env),b=yield* this.reference(ast.args[1],env),old=a.get();a.set(b.get());b.set(old);return null;
      }
      const args=[];for(const arg of ast.args)args.push(yield* this.evaluate(arg,env));
      if(['max','min'].includes(name)){if(args.length<1||args.length>16)this.fail(`${name} needs 1–16 arguments.`);args.forEach(a=>this.numeric(a));return name==='max'?Math.max(...args):Math.min(...args);}
      if(['abs','floor','ceil','half','Half'].includes(name)){if(args.length!==1)this.fail(`${name} needs one argument.`);const a=this.finite(args[0]);return name==='abs'?Math.abs(a):name==='floor'?Math.floor(a):name==='ceil'?Math.ceil(a):name==='half'?Math.ceil(a/2):Math.floor(a/2);}
      if(name==='process'||name==='write') {if(args.length!==1)this.fail(`${name} needs one argument.`);if(this.output.length>=1000)this.fail('Output limit reached.');this.output.push(this.format(args[0]));this.noteVertex(args[0]);return null;}
      this.fail(`Unsupported procedure ${name}.`);
    }
    if(ast.target.kind!=='field')this.fail('Only named routines and supported object operations can be called.');
    const object=yield* this.evaluate(ast.target.object,env),name=ast.target.name,args=[];
    for(const arg of ast.args)args.push(yield* this.evaluate(arg,env));
    if(object?.tag==='graph'&&name==='A'){
      if(args.length!==1||!object.adj.has(args[0]))this.fail('G.A(u) needs a vertex belonging to G.');
      this.lastVertex=args[0];return{tag:'collection',values:[...object.adj.get(args[0])],base:1,sourceVertex:args[0]};
    }
    if(object?.tag!=='queue')this.fail(`Unsupported operation ${name}.`);
    const queue=object,heap=queue.kind==='heap',stack=queue.kind==='stack';
    const allowed=['isEmpty','isFull','length','setEmpty',...(stack?['push','pop','top']:heap?['add','remMax','max']:['add','rem','first'])];if(!allowed.includes(name))this.fail(`Unsupported ${queue.kind} operation ${name}.`);
    if(['isEmpty','isFull','length','first','top','max','rem','pop','remMax','setEmpty'].includes(name)&&args.length)this.fail(`${name} takes no arguments.`);
    if(name==='isEmpty')return !queue.items.length;if(name==='isFull')return queue.items.length===queue.capacity;if(name==='length')return queue.items.length;
    if(name==='setEmpty'){queue.items=[];queue.start=0;return null;}
    if(name==='add'||name==='push'){
      if(args.length!==1)this.fail(`${name} needs one value.`);if(queue.items.length>=queue.capacity)this.fail(`${stack?'Stack':'Queue'}Overflow.`);
      if((stack&&name!=='push')||(!stack&&name==='push'))this.fail('Use push/pop for Stack and add/rem for Queue.');
      if(args[0]&&typeof args[0]==='object'&&!['node','vertex'].includes(args[0].tag))this.fail('Queue/stack items must be scalar values or node references.');queue.items.push(args[0]);if(heap){queue.items.forEach(v=>this.numeric(v));queue.items.sort((a,b)=>b-a);}this.noteVertex(args[0]);return null;
    }
    if(['first','top','max','rem','pop','remMax'].includes(name)){
      if(!queue.items.length)this.fail(`${stack?'Stack':'Queue'}Underflow.`);
      if(stack&&!['top','pop'].includes(name))this.fail('Use top/pop for Stack.');if(!stack&&['top','pop'].includes(name))this.fail('Use first/rem for Queue.');
      const value=stack?queue.items.at(-1):queue.items[0];
      if(['rem','pop','remMax'].includes(name)){stack?queue.items.pop():queue.items.shift();if(!stack&&!heap)queue.start=(queue.start+1)%queue.capacity;}
      this.noteVertex(value);if(value?.tag==='vertex'&&['rem','pop'].includes(name))this.lastVertex=value;return value;
    }
    this.fail(`Unsupported queue/stack operation ${name}.`);
  }
  format(value,depth=0){
    if(depth>4)return '…';
    if(value===executionUninitialized)return '—';if(value===null)return '∅';if(value===undefined)return '—';if(value===Infinity)return '∞';if(value===-Infinity)return '−∞';
    if(value?.tag==='node'||value?.tag==='vertex')return`${value.id} (${String(value.key)})`;
    if(value?.tag==='array'||value?.tag==='collection')return '['+value.values.slice(0,64).map(v=>this.format(v,depth+1)).join(', ')+']';
    if(value?.tag==='queue')return`${value.kind} ⟨${value.items.map(v=>this.format(v,depth+1)).join(', ')}⟩`;
    if(value?.tag==='graph')return`${value.vertices.length} vertices, ${value.origin.doc.edges.length} edges`;
    return String(value);
  }
  record(text,line=this.line){
    if(++this.steps>this.maxSteps)this.fail(`Step limit reached (${this.maxSteps}). Possible infinite loop.`);
    this.line=line;
    return this.snapshot(text);
  }
  snapshot(text='Ready to execute'){
    const env=this.frames.at(-1)?.env||this.lastEnv;
    const variables=env?[...env.entries()].map(([name,cell])=>({name,value:this.format(cell.peek?cell.peek():cell.get())})):[];
    const structures=this.origins.map(origin=>{
      const nodes=origin.nodes.map(n=>({id:n.id,key:n.key,left:n.left?.id||null,right:n.right?.id||null,firstChild:n.firstChild?.id||null,nextSibling:n.nextSibling?.id||null,next:n.next?.id||null,prev:n.prev?.id||null,keys:n.keys||[],children:n.children?.map(c=>c.id)||[],b:n.b,d:n.tag==='vertex'&&!n.initialized.has('d')?'—':this.format(n.d),pi:n.pi?.id||null,piInitialized:n.tag!=='vertex'||n.initialized.has('pi'),color:n.color,processed:Boolean(n.processed),active:this.activeNodes.has(n)}));
      const doc={...origin.doc,nodes:structureType(origin.doc.kind).family==='tree'||structureType(origin.doc.kind).family==='graph'?nodes:origin.doc.nodes};
      const value=origin.value;
      if((value?.tag==='array'||value?.tag==='collection')&&structureType(doc.kind).family!=='hash')doc.values=value.values.map(v=>v?.tag?this.format(v):v);
      if(value?.tag==='queue'){doc.values=value.items.map(v=>v?.tag?this.format(v):v);doc.start=value.start;}
      if(structureType(doc.kind).family==='tree')doc.root=origin.root?.id||null;
      return{parameter:origin.parameter,doc,nodes,storage:value?.tag==='array'?value.values.map(v=>v?.tag?this.format(v):v):null,activeIndices:[...this.activeIndices].filter(key=>key.startsWith(origin.parameter+':')).map(key=>Number(key.split(':').at(-1))),edge:this.activeEdge?.origin===origin?{from:this.activeEdge.from,to:this.activeEdge.to}:null};
    });
    const queues=env?[...env.entries()].filter(([,cell])=>(cell.peek?cell.peek():cell.get())?.tag==='queue').map(([name,cell])=>{const q=cell.get();return{name,kind:q.kind,items:q.items.map(v=>({id:v?.tag==='vertex'?v.id:null,label:this.format(v)})),capacity:q.capacity,start:q.start};}):[];
    return{step:this.steps,line:this.line,text,variables,structures,queues,output:[...this.output],stack:this.frames.map(f=>f.name),result:this.format(this.result),done:this.done,error:this.error?.message||null};
  }
  *invoke(routine,args){
    if(this.frames.length>=64)this.fail('Call-depth limit reached (64).');
    const env=new Map();routine.params.forEach((p,i)=>env.set(p.name,args[i]));
    for(const [name,cell]of env){const value=cell.peek?cell.peek():cell.get();if(value?.tag==='array'){const p=routine.params.find(p=>p.name===name),lengthName=p.type.match(/\[([\p{L}_][\p{L}\p{N}_]*)\]/u)?.[1];if(lengthName&&!env.has(lengthName))env.set(lengthName,this.cell(value.values.length));}}
    this.frames.push({name:routine.name,env});this.line=routine.line;
    yield this.record('Enter '+routine.name,routine.line);
    const completion=yield* this.executeBody(routine.body,env);
    if(this.frames.length===1)this.lastEnv=env;this.frames.pop();return completion?.value??null;
  }
  *executeBody(nodes,env){
    for(const node of nodes){this.line=node.line;
      if(node.type==='statement'){
        for(const command of node.commands){this.activeNodes.clear();this.activeIndices.clear();this.activeEdge=null;this.line=node.line;
          if(command.kind==='assign'){const ref=yield* this.reference(command.target,env);const value=yield* this.evaluate(command.value,env);ref.set(value);this.noteVertex(value);}
          else if(command.kind==='increment'){const ref=yield* this.reference(command.target,env);ref.set(this.numeric(ref.get())+command.delta);}
          else if(command.kind==='declare'){
            for(const name of command.names){let value=executionUninitialized;const queue=command.type.match(/^(Queue|Stack|PrQueue)(?:\((.*)\))?$/),array=command.type.match(/^[A-Za-z]+\[(.*)\]$/);
              if(queue){const capacity=queue[2]?this.finite(yield* this.evaluate(executionExpression(queue[2]),env)):Math.max(64,...this.origins.map(o=>o.nodes.length));if(!Number.isInteger(capacity)||capacity<1||capacity>256)this.fail('Queue/stack capacity must be 1–256.');value={tag:'queue',kind:queue[1]==='Stack'?'stack':queue[1]==='PrQueue'?'heap':'queue',items:[],capacity,start:0};}
              else if(array){const length=array[1]?this.finite(yield* this.evaluate(executionExpression(array[1]),env)):0;if(!Number.isInteger(length)||length<0||length>256)this.fail('Local array size must be 0–256.');value={tag:'array',values:Array(length).fill(executionUninitialized),base:0};}
              // Scalar and pointer declarations stay uninitialized until assigned.

              env.set(name,this.cell(value));
            }
          }
          else if(command.kind==='call')yield* this.evaluate(command.value,env);
          else if(command.kind==='return'){
            const value=command.value?yield* this.evaluate(command.value,env):null;this.line=node.line;yield this.record(command.text,node.line);return{returned:true,value};
          }
          this.line=node.line;yield this.record(command.text,node.line);
        }
      }else if(node.type==='if'){
        this.activeNodes.clear();this.activeIndices.clear();this.activeEdge=null;const condition=Boolean(yield* this.evaluate(node.condition,env));yield this.record(`if ${node.text} → ${condition}`,node.line);
        const completion=yield* this.executeBody(condition?node.yes:node.no,env);if(completion?.returned)return completion;
      }else if(node.type==='select'){
        for(const branch of node.branches){this.line=branch.line;this.activeNodes.clear();this.activeIndices.clear();this.activeEdge=null;const chosen=!branch.condition||Boolean(yield* this.evaluate(branch.condition,env));yield this.record(`case ${branch.text} → ${chosen}`,branch.line);if(chosen){const completion=yield* this.executeBody(branch.body,env);if(completion?.returned)return completion;break;}}
      }else if(node.loopKind==='while'){
        while(true){this.line=node.line;this.activeNodes.clear();this.activeIndices.clear();this.activeEdge=null;const condition=Boolean(yield* this.evaluate(node.condition,env));yield this.record(`while ${node.text} → ${condition}`,node.line);if(!condition)break;const completion=yield* this.executeBody(node.body,env);if(completion?.returned)return completion;}
      }else{
        let values,sourceVertex=null;
        if(node.loopKind==='each'){const collection=yield* this.evaluate(node.collection,env);if(collection?.tag!=='collection'&&collection?.tag!=='array')this.fail('A collection loop needs G.V, G.A(u), a set or a sequence.');values=[...collection.values];sourceVertex=collection.sourceVertex||null;}
        else{const from=this.finite(yield* this.evaluate(node.from,env)),to=this.finite(yield* this.evaluate(node.to,env));if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||Math.abs(to-from)>20000)this.fail('Numeric range must use safe integers and at most 20,000 iterations.');values=[];for(let i=from;node.delta>0?i<=to:i>=to;i+=node.delta)values.push(i);}
        if(!env.has(node.variable))env.set(node.variable,this.cell(0));
        for(const value of values){this.line=node.line;this.activeNodes.clear();this.activeIndices.clear();this.activeEdge=null;env.get(node.variable).set(value);this.noteVertex(value);yield this.record(`${node.variable} := ${this.format(value)}`,node.line);const completion=yield* this.executeBody(node.body,env);if(completion?.returned)return completion;}
        if(sourceVertex)sourceVertex.processed=true;this.line=node.line;yield this.record('Loop finished',node.line);
      }
    }
    return null;
  }
  *program(){
    const args=this.entry.params.map(parameter=>{
      const value=this.bindings.get(parameter.name),origin=this.origins.find(o=>o.parameter===parameter.name),cell=this.cell(value,origin);
      if(parameter.reference){const origin=this.origins.find(o=>o.parameter===parameter.name);if(origin&&structureType(origin.doc.kind).family==='tree')return{origin,get:cell.get,set:next=>{if(next!==null&&next?.origin!==origin)this.fail('A tree root must refer to a node in its working copy.');cell.set(next);origin.root=next;origin.value=next;}};}
      return cell;
    });
    this.result=yield* this.invoke(this.entry,args);this.done=true;yield this.snapshot('Execution finished');
  }
  step(){
    if(this.done||this.error)return this.snapshot(this.error?'Execution stopped':'Execution finished');
    try{const next=this.iterator.next();if(next.done)this.done=true;return next.value||this.snapshot('Execution finished');}
    catch(error){this.error=error instanceof ExecutionError?error:new ExecutionError(error.message,this.line);this.error.line||=this.line;this.line=this.error.line;return this.snapshot('Execution stopped');}
  }
}
