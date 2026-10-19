import { parse } from './parser.js';
import { render } from './renderer.js';
import { compileExecution } from './execution-language.js';
import { ExecutionSession } from './execution-runtime.js';
import { readStructureFile, structureType } from './structures-model.js';
import { renderExecutionStructure } from './execution-view.js';

export function initExecutionUI({ getSource, highlight }) {
  const el=id=>document.getElementById(id),dialog=el('execution-dialog');
  let captured='',routines=[],structures=[],preferred=0,fields=new Map(),session=null,history=[],cursor=0,timer=null,playing=false;
  const message=(text,error=false)=>{el('run-message').textContent=text;el('run-message').dataset.error=String(error);};
  const option=(select,value,label)=>{const node=document.createElement('option');node.value=value;node.textContent=label;select.append(node);};
  const pause=()=>{clearTimeout(timer);timer=null;playing=false;controls();};
  function controls(){
    const state=history[cursor],atEnd=cursor===history.length-1,finished=atEnd&&(state?.done||state?.error);
    el('run-play').disabled=!routines.length||playing||finished;el('run-next').disabled=!routines.length||playing||finished;
    el('run-pause').disabled=!playing;el('run-back').disabled=playing||cursor===0;el('run-reset').disabled=!routines.length;
    el('run-entry').disabled=playing;el('run-bindings').querySelectorAll('input,select').forEach(input=>input.disabled=playing);
  }
  function invalidate(){pause();session=null;history=[];cursor=0;el('run-step-label').textContent='Ready';message('Choose inputs, then Run or Next step.');controls();}
  function compatible(parameter,doc){
    const type=parameter.type,family=structureType(doc.kind).family;
    if(type==='G')return family==='graph';
    if(type.endsWith('*'))return family==='tree'||family==='list';
    if(type.includes('['))return ['array','sequence','heap','direct','chain','open'].includes(doc.kind);
    if(type.startsWith('Queue'))return doc.kind==='queue';if(type.startsWith('Stack'))return doc.kind==='stack';if(type.startsWith('PrQueue'))return doc.kind==='heap';
    if(type.includes('{}'))return doc.kind==='set';if(type.includes('⟨'))return doc.kind==='sequence';return false;
  }
  function isStructure(parameter){return parameter.type==='G'||parameter.type.endsWith('*')||/[\[{}⟨]/.test(parameter.type)||/^(Queue|Stack|PrQueue)/.test(parameter.type);}
  function readStructures(){
    const raw=localStorage.getItem('structogram.ads.structures.v1');structures=raw?readStructureFile(raw):[];
    try{preferred=raw?JSON.parse(raw).selected||0:0;}catch{preferred=0;}
  }
  function bindingsUI(){
    const previous=Object.fromEntries([...fields].map(([name,field])=>[name,field.input.value]));fields=new Map();el('run-bindings').replaceChildren();
    const entry=routines.find(r=>r.name===el('run-entry').value);if(!entry)return;
    const add=(parameter,input,kind)=>{const label=document.createElement('label');label.textContent=`${parameter.name} : ${parameter.type}`;input.id='run-input-'+parameter.name;input.setAttribute('aria-label',`${parameter.name} input`);label.append(input);el('run-bindings').append(label);fields.set(parameter.name,{input,kind,parameter});input.addEventListener('change',()=>{invalidate();if(kind==='structure'&&parameter.type==='G')bindingsUI();});};
    for(const parameter of entry.params.filter(p=>p.type!=='V')){
      if(isStructure(parameter)){
        const input=document.createElement('select'),matches=structures.map((doc,index)=>({doc,index})).filter(({doc})=>compatible(parameter,doc));
        if(!matches.length)option(input,'','Create a compatible structure first');
        for(const {doc,index}of matches)option(input,String(index),`${doc.name} · ${structureType(doc.kind).label}`);
        if(matches.some(m=>String(m.index)===previous[parameter.name]))input.value=previous[parameter.name];else if(matches.some(m=>m.index===preferred))input.value=String(preferred);
        add(parameter,input,'structure');
      }else{const input=document.createElement('input');input.maxLength=200;input.value=previous[parameter.name]??'0';add(parameter,input,'scalar');}
    }
    for(const parameter of entry.params.filter(p=>p.type==='V')){
      const input=document.createElement('select');
      for(const [name,field]of fields){if(field.kind!=='structure')continue;const index=field.input.value,doc=index!==''?structures[Number(index)]:null;if(!doc||!['graph','digraph'].includes(doc.kind))continue;for(const node of doc.nodes)option(input,name+'|'+node.id,`${name}: ${node.id} · ${node.key}`);}
      if(!input.options.length)option(input,'','Choose a non-empty graph first');if([...input.options].some(o=>o.value===previous[parameter.name]))input.value=previous[parameter.name];add(parameter,input,'vertex');
    }
    controls();
  }
  function readBindings(){
    const result={};for(const [name,field]of fields){const value=field.input.value;
      if(field.kind==='structure'){if(value==='')throw Error(`Create and select a structure for ${name}.`);result[name]={structure:structures[Number(value)]};}
      else if(field.kind==='vertex'){const [graphParam,vertex]=value.split('|');if(!vertex)throw Error(`Choose a start vertex for ${name}.`);result[name]={graphParam,vertex};}
      else{let scalar;try{scalar=JSON.parse(value);}catch{scalar=value;}if(scalar!==null&&!['string','number','boolean'].includes(typeof scalar))throw Error(`Enter a scalar value for ${name}.`);result[name]=scalar;}
    }return result;
  }
  function prepare(){
    if(session)return true;
    try{session=new ExecutionSession(captured,el('run-entry').value,readBindings());history=[session.snapshot()];cursor=0;show();return true;}
    catch(error){message(`${error.line?'Line '+error.line+': ':''}${error.message}`,true);return false;}
  }
  function table(target,head,rows){target.replaceChildren();const t=document.createElement('table'),header=document.createElement('tr');for(const name of head){const cell=document.createElement('th');cell.scope='col';cell.textContent=name;header.append(cell);}t.append(header);for(const row of rows){const tr=document.createElement('tr');for(const value of row){const cell=document.createElement('td');cell.textContent=String(value);tr.append(cell);}t.append(tr);}target.append(t);}
  function show(){
    const state=history[cursor];if(!state)return;
    el('run-step-label').textContent=`Step ${state.step}${history[0]?.step>0?' · last 500 steps retained':''}`;
    message(`${state.error?'Line '+state.line+': '+state.error:state.text}`,Boolean(state.error));
    el('run-code').querySelectorAll('li').forEach((row,index)=>row.classList.toggle('run-line-current',index+1===state.line));
    el('run-code').children[state.line-1]?.scrollIntoView({block:'nearest'});
    el('run-structogram').querySelectorAll('[data-line]').forEach(row=>row.classList.toggle('run-current',Number(row.dataset.line)===state.line));
    highlight(state.line);
    const selected=el('run-structure').value;el('run-structure').replaceChildren();state.structures.forEach((s,i)=>option(el('run-structure'),String(i),`${s.parameter}: ${s.doc.name}`));if([...el('run-structure').options].some(o=>o.value===selected))el('run-structure').value=selected;
    showStructure(state);
    el('run-queues').replaceChildren();for(const queue of state.queues){const card=document.createElement('div');card.className='run-queue';const title=document.createElement('strong');title.textContent=`${queue.name} · ${queue.kind} · n=${queue.items.length}, capacity=${queue.capacity}${queue.kind==='queue'?', k='+queue.start:''}`;card.append(title);const note=document.createElement('small');note.textContent=queue.kind==='stack'?'Bottom → top':'Front → back';card.append(note);if(!queue.items.length)card.append(document.createTextNode(' ⟨⟩'));for(const value of queue.items){const item=document.createElement('span');item.textContent=value.label;card.append(item);}el('run-queues').append(card);}
    table(el('run-variables'),['Variable','Value'],state.variables.map(v=>[v.name,v.value]));
    el('run-stack').textContent='Call stack: '+(state.stack.join(' → ')||'finished')+(state.done?' · Return: '+state.result:'');el('run-output').textContent=state.output.length?state.output.join(' → '):'No process/write output yet.';
    controls();
  }
  function showStructure(state=history[cursor]){
    const selected=state?.structures[Number(el('run-structure').value)||0];
    if(!selected){el('run-graph').textContent='No structure parameter is bound. Scalar variables are shown below.';table(el('run-node-state'),['Node','State'],[]);return;}
    el('run-graph').innerHTML=renderExecutionStructure(selected);
    for(const node of selected.nodes.filter(n=>n.active))el('run-graph').querySelectorAll(`[data-node-id="${node.id}"]`).forEach(element=>element.classList.add('run-node-active'));
    for(const index of selected.activeIndices)el('run-graph').querySelectorAll(`[data-array-index="${index}"]`).forEach(element=>element.classList.add('run-array-active'));
    const graph=['graph','digraph'].includes(selected.doc.kind);el('run-legend').textContent=graph?'Orange: accessed this step · Blue: finite d / gray · Green: adjacency iteration completed / black · White: undiscovered':'Highlighted nodes and indices were accessed by the current step.';
    table(el('run-node-state'),graph?['Node / key','d','π']:['Node / key','b','Pointers'],selected.nodes.map(n=>graph?[`${n.id} (${n.key})`,n.d,n.piInitialized?(n.pi||'∅'):'—']:[`${n.id} (${n.key})`,n.b,`left=${n.left||'∅'}, right=${n.right||'∅'}, next=${n.next||'∅'}`]));
  }
  function advance(){
    if(cursor<history.length-1){cursor++;show();if(history[cursor].done||history[cursor].error)pause();return;}
    if(!prepare())return;
    const state=session.step();history.push(state);cursor=history.length-1;if(history.length>500){history.shift();cursor--;}
    show();if(state.error||state.done)pause();
  }
  function tick(){if(!playing)return;advance();if(playing)timer=setTimeout(tick,Number(el('run-speed').value));}
  function open(){
    pause();session=null;history=[];cursor=0;
    try{
      captured=getSource();routines=compileExecution(parse(captured),captured);readStructures();
      el('run-entry').replaceChildren();for(const routine of routines)option(el('run-entry'),routine.name,routine.signature);
      el('run-code').replaceChildren();captured.split('\n').forEach(text=>{const li=document.createElement('li');li.textContent=text||' ';el('run-code').append(li);});
      el('run-structogram').innerHTML=render(parse(captured)).svg;
      bindingsUI();message('Choose inputs, then Run or Next step.');
      el('run-graph').textContent=structures.length?'Ready to bind your saved structures.':'Create a structure using Data structures, then return here.';
      el('run-queues').replaceChildren();el('run-variables').replaceChildren();el('run-node-state').replaceChildren();el('run-output').textContent='';el('run-stack').textContent='';el('run-step-label').textContent='Ready';
    }catch(error){routines=[];message(`${error.line?'Line '+error.line+': ':''}${error.message}`,true);}
    controls();dialog.showModal();
  }
  el('open-execution').addEventListener('click',open);el('close-execution').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{pause();highlight(null);});
  el('run-entry').addEventListener('change',()=>{invalidate();bindingsUI();});el('run-refresh').addEventListener('click',()=>{try{readStructures();invalidate();bindingsUI();}catch(error){message(error.message,true);}});
  el('run-next').addEventListener('click',()=>{pause();advance();});el('run-back').addEventListener('click',()=>{pause();if(cursor>0){cursor--;show();}});
  el('run-reset').addEventListener('click',()=>{invalidate();prepare();});
  el('run-play').addEventListener('click',()=>{if(!prepare())return;playing=true;controls();tick();});el('run-pause').addEventListener('click',pause);
  el('run-structure').addEventListener('change',()=>showStructure());
  for(const tab of ['source','diagram'])el('run-tab-'+tab).addEventListener('click',()=>{el('run-code').hidden=tab!=='source';el('run-structogram').hidden=tab!=='diagram';for(const other of ['source','diagram']){el('run-tab-'+other).setAttribute('aria-selected',String(tab===other));el('run-tab-'+other).tabIndex=tab===other?0:-1;}});
  for(const tab of ['source','diagram'])el('run-tab-'+tab).addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const other=el('run-tab-'+(tab==='source'?'diagram':'source'));other.click();other.focus();}});
  if(new URL(location.href).searchParams.get('run')==='1'){const url=new URL(location.href);url.searchParams.delete('run');historyReplace(url);open();}
  function historyReplace(url){window.history.replaceState(null,'',url);}
}
