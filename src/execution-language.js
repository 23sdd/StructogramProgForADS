// A small explicit grammar. User text is never passed to JavaScript evaluation.
export class ExecutionError extends Error {
  constructor(message, line = 0) { super(message); this.name = 'ExecutionError'; this.line = line; }
}
export function executionExpression(source) {
  if (source.length > 3000) throw new ExecutionError('Expression is too long.');
  const input = source.replace(/->/g, '→').replace(/!=|<>/g, '≠').replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/&&/g, '∧').replace(/\|\|/g, '∨');
  const tokens = []; let pos = 0;
  while (pos < input.length) {
    if (/\s/u.test(input[pos])) { pos++; continue; }
    const tail = input.slice(pos);
    const number = tail.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) { const value = Number(number[0]); if (!Number.isFinite(value)) throw new ExecutionError('Number is outside the finite range.'); tokens.push({ kind: 'number', value }); pos += number[0].length; }
    else if (input[pos] === '"' || input[pos] === "'") {
      const quote = input[pos++]; let value = '', closed = false;
      while (pos < input.length) { let ch = input[pos++]; if (ch === quote) { closed = true; break; } if (ch === '\\') { ch = input[pos++]; if (!['n','t','\\','"',"'"].includes(ch)) throw new ExecutionError('Unsupported string escape.'); ch = ch === 'n' ? '\n' : ch === 't' ? '\t' : ch; } value += ch; }
      if (!closed || value.length > 200) throw new ExecutionError('Invalid or oversized string.');
      tokens.push({ kind: 'string', value });
    } else {
      const id = tail.match(/^[\p{L}_][\p{L}\p{N}_]*/u);
      if (id) { const word = id[0]; tokens.push({ kind: ['and','or','not','mod','div'].includes(word) ? 'op' : 'id', value: ({ and:'∧',or:'∨',not:'¬' })[word] || word }); pos += word.length; }
      else if ('+-−*/%=≠<>≤≥∧∨¬!(),[].→∞∅⌊⌋⌈⌉'.includes(input[pos])) tokens.push({ kind:'op',value:input[pos++] === '−' ? '-' : input[pos-1] });
      else throw new ExecutionError(`Unsupported expression character: ${input[pos]}`);
    }
    if (tokens.length > 600) throw new ExecutionError('Expression has too many tokens.');
  }
  tokens.push({ kind:'end',value:'' }); let i = 0, depth = 0;
  const peek = () => tokens[i].value;
  const take = value => { if (peek() !== value) throw new ExecutionError(`Expected ${value}, found ${peek() || 'end of expression'}.`); i++; };
  const precedence = { '∨':1,'∧':2,'=':3,'≠':3,'<':3,'>':3,'≤':3,'≥':3,'+':4,'-':4,'*':5,'/':5,'%':5,mod:5,div:5 };
  function read(min = 0) {
    if (++depth > 48) throw new ExecutionError('Expression is nested too deeply.');
    const token = tokens[i++]; let node;
    if (token.kind === 'number' || token.kind === 'string') node = { kind:'literal',value:token.value };
    else if (['∞','∅'].includes(token.value)) node = { kind:'literal',value:token.value === '∞' ? Infinity : null };
    else if (['true','false','NULL','null'].includes(token.value)) node = { kind:'literal',value:token.value === 'true' ? true : token.value === 'false' ? false : null };
    else if (['-','+','¬','!'].includes(token.value)) node = { kind:'unary',op:token.value,arg:read(6) };
    else if (token.value === '(') { node = read(); take(')'); }
    else if (['⌊','⌈'].includes(token.value)) { node = { kind:'round',op:token.value,arg:read() }; take(token.value === '⌊' ? '⌋' : '⌉'); }
    else if (token.kind === 'id') {
      if (token.value === 'new') { const name = tokens[i++]; if (name.value !== 'Node') throw new ExecutionError('Only new Node(key) is supported.'); take('('); const arg = read(); take(')'); node = { kind:'new-node',arg }; }
      else node = { kind:'name',name:token.value };
    } else throw new ExecutionError(`Expected a value, found ${token.value || 'end of expression'}.`);
    while (true) {
      if (peek() === '.' || peek() === '→') { i++; const name = tokens[i++]; if (name.kind !== 'id') throw new ExecutionError('A field name must follow the pointer or dot.'); node = { kind:'field',object:node,name:name.value }; }
      else if (peek() === '[') { i++; const index = read(); take(']'); node = { kind:'index',object:node,index }; }
      else if (peek() === '(') { i++; const args = []; if (peek() !== ')') { do { if (args.length) take(','); args.push(read()); } while (peek() === ','); } take(')'); node = { kind:'call',target:node,args }; }
      else { const power = precedence[peek()]; if (!power || power < min) break; const op = tokens[i++].value; node = { kind:'binary',op,left:node,right:read(power+1) }; }
    }
    depth--; return node;
  }
  const tree = read(); if (tokens[i].kind !== 'end') throw new ExecutionError(`Unexpected token ${peek()}.`); return tree;
}
export function splitExecutionStatements(source) {
  const result = []; let start = 0, level = 0, quote = '', escaped = false;
  for (let i=0;i<source.length;i++) { const c=source[i]; if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='('||c==='[')level++;if(c===')'||c===']')level--;if(c===';'&&level===0){result.push(source.slice(start,i).trim());start=i+1;} }
  result.push(source.slice(start).trim()); return result.filter(Boolean);
}
export function executionSignature(signature) {
  const match = signature.match(/^([\p{L}_][\p{L}\p{N}_:]*)\s*\((.*)\)\s*(?::.*)?$/u);
  if (!match) throw new ExecutionError('Unsupported routine signature.');
  const params = []; let type = '';
  for (const group of match[2].split(';').filter(s=>s.trim())) {
    const colon = group.indexOf(':'); if (colon < 0) throw new ExecutionError('Parameters need a declared type.');
    type = group.slice(colon+1).trim();
    for (const raw of group.slice(0,colon).split(',')) { const name = raw.trim().replace(/^&/, ''); if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) throw new ExecutionError('Unsupported parameter name.'); if(params.some(p=>p.name===name))throw new ExecutionError('Duplicate parameter name.'); params.push({name,type,reference:raw.trim().startsWith('&')}); }
  }
  return { name:match[1],params };
}
export function compileExecution(routines, source) {
  const lines=source.replace(/\r\n?/g,'\n').split('\n');
  const expr = (text,line) => { try { return executionExpression(text); } catch(error){error.line=line;throw error;} };
  function statement(text,line) {
    if (text === 'SKIP' || text.startsWith('//')) return { kind:'skip' };
    if (/^return(?:\s|$)/.test(text)) return { kind:'return',value:text.slice(6).trim()?expr(text.slice(6).trim(),line):null };
    const assignment = text.match(/^(.*?)\s*:=\s*(.+)$/u);
    if (assignment) return { kind:'assign',target:expr(assignment[1],line),value:expr(assignment[2],line) };
    const inc=text.match(/^(.*?)\s*(\+\+|--)$/);if(inc)return{kind:'increment',target:expr(inc[1],line),delta:inc[2]==='++'?1:-1};
    const declaration=text.match(/^([\p{L}_][\p{L}\p{N}_]*(?:\s*,\s*[\p{L}_][\p{L}\p{N}_]*)*)\s*:\s*(.+)$/u);
    if(declaration){const type=declaration[2].trim();if(!/^(?:Queue|Stack|PrQueue)(?:\(.*\))?$|^(?:[A-Za-z]+\*?|[A-Za-z]+\[.*\])$/.test(type))throw new ExecutionError('Unsupported declaration type.',line);return{kind:'declare',names:declaration[1].split(',').map(s=>s.trim()),type};}
    const call=expr(text,line);if(call.kind!=='call')throw new ExecutionError('Use an assignment, declaration, return, SKIP or supported procedure call.',line);return{kind:'call',value:call};
  }
  function body(nodes){return nodes.map(node=>{const result={...node};
    if(node.type==='statement')result.commands=(node.text.startsWith('//')?[node.text]:splitExecutionStatements(node.text)).map(text=>({text,...statement(text,node.line)}));
    else if(node.type==='if'){result.condition=expr(node.text,node.line);result.yes=body(node.yes);result.no=body(node.no);}
    else if(node.type==='select'){result.branches=node.branches.map(b=>({...b,condition:b.text==='otherwise'?null:expr(b.text,b.line),body:body(b.body)}));}
    else{
      const raw=lines[node.line-1].trim();result.body=body(node.body);
      if(/^while\s/.test(raw)){result.loopKind='while';result.condition=expr(node.text,node.line);}
      else{
        const each=node.text.replace(/^∀/,'').match(/^([\p{L}_][\p{L}\p{N}_]*)\s+(?:∈|in)\s+(.+)$/u);
        const range=node.text.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*:=\s*(.+?)\s+(to|downto)\s+(.+)$/u);
        if(each){result.loopKind='each';result.variable=each[1];result.collection=expr(each[2],node.line);}
        else if(range){result.loopKind='range';result.variable=range[1];result.from=expr(range[2],node.line);result.to=expr(range[4],node.line);result.delta=range[3]==='to'?1:-1;}
        else throw new ExecutionError('For loops support collection membership or inclusive to/downto ranges.',node.line);
      }
    }
    return result;
  });}
  const compiled=routines.map(r=>({...r,...executionSignature(r.signature),body:body(r.body)}));
  if(new Set(compiled.map(r=>r.name)).size!==compiled.length)throw new ExecutionError('Routine names must be unique.');
  return compiled;
}
