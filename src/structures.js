import { structureTypes, structureType, parseValues, makeStructure, validateStructure, analyseStructure, graphRepresentations, readStructureFile, writeStructureFile } from './structures-model.js';
import { renderStructure, structureNotation } from './structures-renderer.js';
const ds=id=>document.getElementById(id),dsKey='structogram.ads.structures.v1';
let dsItems=[],dsSelected=0,dsDirty=false,dsStored=true,dsUndo=[],dsRedo=[];
try{const saved=localStorage.getItem(dsKey);if(saved){const file=JSON.parse(saved);dsItems=readStructureFile(saved);dsSelected=Number.isInteger(file.selected)?Math.max(0,Math.min(dsItems.length-1,file.selected)):0;}}catch{dsStored=false;}
const dsStatus=(message,error=false)=>{ds('ds-status').textContent=message;ds('ds-status').dataset.error=String(error);};
function dsPersist(){try{const file=JSON.parse(writeStructureFile(dsItems));file.selected=dsSelected;localStorage.setItem(dsKey,JSON.stringify(file));dsStored=true;return true;}catch{dsStored=false;dsStatus('Local storage unavailable. Save all to keep a backup.',true);return false;}}
function dsSnapshot(){return JSON.stringify({items:dsItems,selected:dsSelected});}
function dsCommit(items,selected=dsSelected){const previous=dsSnapshot();const next=items.map(validateStructure);if(JSON.stringify({items:next,selected})!==previous){dsUndo.push(previous);if(dsUndo.length>50)dsUndo.shift();dsRedo=[];}dsItems=next;dsSelected=selected;dsDirty=false;const saved=dsPersist();dsRender();if(saved)dsStatus('Saved on this device. Use Save all for a file backup.');}
function dsAttempt(action){try{action();}catch(error){dsStatus(error.message,true);}}
function dsScalar(text){const values=parseValues(text.trim().startsWith('"')?'['+text+']':JSON.stringify([/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())?Number(text):text]));return values[0];}
function dsOption(select,value,label){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
function dsPointers(select,doc,value,empty=true){select.replaceChildren();if(empty)dsOption(select,'','∅');for(const n of doc.nodes)dsOption(select,n.id,`${n.id} · ${String(n.key).slice(0,18)}`);select.value=value||'';}
function dsNodeField(row,label,field,value,doc,pointer=false){const wrapper=document.createElement('label');wrapper.textContent=label;const input=document.createElement(pointer?'select':'input');input.dataset.field=field;if(pointer)dsPointers(input,doc,value);else{input.value=value;input.maxLength=600;}input.setAttribute('aria-label',`${row.dataset.id} ${label}`);wrapper.append(input);row.append(wrapper);}
function dsReadEditor(){
  const doc=structuredClone(dsItems[dsSelected]);if(!doc)return null;
  doc.name=ds('ds-name').value;doc.capacity=Number(ds('ds-capacity').value);doc.start=Number(ds('ds-start').value);
  const type=structureType(doc.kind);if(!['tree','graph'].includes(type.family))doc.values=parseValues(ds('ds-values').value);
  if(type.family==='tree')doc.root=ds('ds-root').value||null;
  for(const row of ds('ds-nodes').querySelectorAll('[data-id]')){
    const node=doc.nodes.find(n=>n.id===row.dataset.id);
    for(const field of row.querySelectorAll('[data-field]')){
      const name=field.dataset.field;
      node[name]=name==='key'?dsScalar(field.value):name==='keys'?parseValues(field.value):name==='children'?field.value.split(/[\s,;]+/).filter(Boolean):field.value||null;
    }
  }
  return validateStructure(doc);
}
function dsApplyDraft(){if(!dsDirty)return;const items=[...dsItems];items[dsSelected]=dsReadEditor();dsCommit(items);}
function dsEdit(transform){const items=[...dsItems];const doc=dsReadEditor();transform(doc);items[dsSelected]=doc;dsCommit(items);}
function dsRender(){
  const doc=dsItems[dsSelected];ds('ds-count').textContent=`${dsItems.length} / 30`;ds('ds-list').replaceChildren();
  dsItems.forEach((item,i)=>{const button=document.createElement('button');button.type='button';button.setAttribute('aria-current',String(i===dsSelected));button.textContent=item.name;const small=document.createElement('small');small.textContent=structureType(item.kind).label;button.append(small);button.addEventListener('click',()=>dsAttempt(()=>{dsApplyDraft();dsSelected=i;dsPersist();dsRender();}));ds('ds-list').append(button);});
  ds('ds-empty').hidden=Boolean(doc);ds('ds-editor').hidden=!doc;ds('ds-save').disabled=!dsItems.length;ds('ds-create').disabled=dsItems.length>=30;
  ds('ds-undo').disabled=!dsUndo.length;ds('ds-redo').disabled=!dsRedo.length;
  if(!doc)return;
  const type=structureType(doc.kind),isTree=type.family==='tree',isGraph=type.family==='graph';
  ds('ds-title').textContent=doc.name;ds('ds-type').textContent=type.label;ds('ds-name').value=doc.name;ds('ds-capacity').parentElement.hidden=!['stack','queue','heap','direct','chain','open'].includes(doc.kind);ds('ds-capacity').value=doc.capacity;ds('ds-start').value=doc.start;ds('ds-start-label').hidden=doc.kind!=='queue';ds('ds-values-label').hidden=isTree||isGraph;ds('ds-values').value=JSON.stringify(doc.values);
  ds('ds-root-label').hidden=!isTree;dsPointers(ds('ds-root'),doc,doc.root);ds('ds-node-label').hidden=!(isTree||isGraph);ds('ds-add-node').hidden=!(isTree||isGraph);ds('ds-add-node').disabled=doc.nodes.length>=64;ds('ds-nodes-section').hidden=!(isTree||isGraph);ds('ds-edges-section').hidden=!isGraph;
  ds('ds-undo').disabled=!dsUndo.length;ds('ds-redo').disabled=!dsRedo.length;
  ds('ds-guidance').textContent=doc.kind==='avl'?'AVL: b = h(right) − h(left), h(∅) = −1. Connections are edited manually. Balance is computed; imbalance is reported, not automatically rotated.':doc.kind==='bplus'?'B+ uses a standard keys/children/next representation. The supplied tree notes refer to a separate B+ PDF that was not included; this preview is not claimed to reproduce its exact notation. Build internal nodes and the leaf chain manually.':doc.kind==='general'?'General tree in the lecture representation: firstChild points to the first child; nextSibling points to its next sibling. The diagram shows these exact pointers.':isGraph?'Simple graphs: vertex indices start at 1; no self-loops or repeated edges. Undirected edges appear in both adjacency lists. The matrix and lists describe the same graph.':doc.kind==='open'?'Initial table built with integer keys and linear probing. Editing the keys rebuilds its layout. E means empty; in-place deletion with D markers are not implemented by this layout editor.':['bst','binary'].includes(doc.kind)?'Choose a root and edit left/right pointers. Node IDs identify objects; keys are their values. Warnings expose invalid topology or ordering.':type.family==='list'?'key values belong to nodes. next/prev and header/trailer connections are derived from the value order, matching the selected list variant.':doc.kind==='queue'?'Circular storage Z: k is the physical first index; n is the number of values. Values are entered in FIFO order and placed at Z[(k+i) mod Z.length].':'Edit the values and apply changes. This section creates data; use Run with algorithm to bind this structure to the written routine.';
  const analysis=analyseStructure(doc);ds('ds-issues').replaceChildren();ds('ds-issues').hidden=!analysis.issues.length;if(analysis.issues.length){const strong=document.createElement('strong');strong.textContent='Structure checks';const list=document.createElement('ul');for(const issue of analysis.issues){const li=document.createElement('li');li.textContent=issue;list.append(li);}ds('ds-issues').append(strong,list);}
  ds('ds-diagram').innerHTML=renderStructure(doc);ds('ds-notation').textContent=structureNotation(doc);
  ds('ds-nodes').replaceChildren();
  if(isTree||isGraph){
    const form=document.createElement('form');form.addEventListener('submit',event=>{event.preventDefault();dsAttempt(dsApplyDraft);});
    for(const n of doc.nodes){const row=document.createElement('div');row.className='ds-node-row';row.dataset.id=n.id;const name=document.createElement('strong');name.textContent=n.id;row.append(name);
      if(doc.kind==='bplus'){dsNodeField(row,'keys','keys',JSON.stringify(n.keys),doc);dsNodeField(row,'children (IDs)','children',n.children.join(', '),doc);dsNodeField(row,'next leaf','next',n.next,doc,true);}
      else{dsNodeField(row,'key','key',JSON.stringify(n.key),doc);if(isTree)for(const field of doc.kind==='general'?['firstChild','nextSibling']:['left','right'])dsNodeField(row,field,field,n[field],doc,true);}
      const remove=document.createElement('button');remove.type='button';remove.className='button';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+n.id);remove.addEventListener('click',()=>dsAttempt(()=>dsEdit(d=>{
        d.nodes=d.nodes.filter(node=>node.id!==n.id);d.edges=d.edges.filter(e=>e.from!==n.id&&e.to!==n.id);if(d.root===n.id)d.root=null;
        for(const node of d.nodes){for(const field of ['left','right','firstChild','nextSibling','next'])if(node[field]===n.id)node[field]=null;node.children=node.children.filter(id=>id!==n.id);}
      })));row.append(remove);form.append(row);
    }
    const apply=document.createElement('button');apply.type='submit';apply.className='button button-primary';apply.textContent='Apply node changes';form.append(apply);ds('ds-nodes').append(form);
  }
  if(isGraph){
    dsPointers(ds('ds-edge-from'),doc,null,false);dsPointers(ds('ds-edge-to'),doc,null,false);ds('ds-edges').replaceChildren();
    doc.edges.forEach((edge,index)=>{const row=document.createElement('div');row.className='ds-edge-row';const label=document.createElement('span');label.textContent=`${edge.from} ${doc.kind==='digraph'?'→':'—'} ${edge.to}`;const remove=document.createElement('button');remove.className='button';remove.textContent='Remove edge';remove.addEventListener('click',()=>dsAttempt(()=>dsEdit(d=>d.edges.splice(index,1))));row.append(label,remove);ds('ds-edges').append(row);});
    const table=document.createElement('table'),head=document.createElement('tr');for(const value of ['A',...doc.nodes.map((_,i)=>i+1)]){const th=document.createElement('th');th.textContent=value;head.append(th);}table.append(head);
    graphRepresentations(doc).matrix.forEach((cells,i)=>{const row=document.createElement('tr');const th=document.createElement('th');th.textContent=i+1;row.append(th);for(const value of cells){const td=document.createElement('td');td.textContent=value;row.append(td);}table.append(row);});ds('ds-matrix').replaceChildren(table);
  }
}
function dsMarkDirty(event){if(event.target.closest('#ds-settings,#ds-nodes')){dsDirty=true;dsStatus('Changes pending — apply changes to save them.');}}
ds('ds-editor').addEventListener('input',dsMarkDirty);ds('ds-editor').addEventListener('change',dsMarkDirty);
for(const type of structureTypes)dsOption(ds('ds-kind'),type.kind,type.label);
function dsCreationFields(){ds('ds-new-capacity').parentElement.hidden=!['stack','queue','heap','direct','chain','open'].includes(ds('ds-kind').value);}
ds('ds-kind').addEventListener('change',dsCreationFields);dsCreationFields();
function dsShowCreate(){dsAttempt(()=>{dsApplyDraft();ds('ds-create-error').textContent='';ds('ds-create-dialog').showModal();ds('ds-kind').focus();});}
ds('ds-create').addEventListener('click',dsShowCreate);ds('ds-create-empty').addEventListener('click',dsShowCreate);ds('ds-close-create').addEventListener('click',()=>ds('ds-create-dialog').close());
ds('ds-create-form').addEventListener('submit',event=>{event.preventDefault();try{if(dsItems.length>=30)throw Error('Store at most 30 structures.');const doc=makeStructure(ds('ds-kind').value,ds('ds-new-name').value,parseValues(ds('ds-new-values').value),Number(ds('ds-new-capacity').value));dsCommit([...dsItems,doc],dsItems.length);ds('ds-create-dialog').close();}catch(error){ds('ds-create-error').textContent=error.message;}});
ds('ds-settings').addEventListener('submit',event=>{event.preventDefault();dsAttempt(()=>{dsDirty=true;dsApplyDraft();});});
ds('ds-root').addEventListener('change',()=>dsAttempt(()=>{dsDirty=true;dsApplyDraft();}));
ds('ds-add-node').addEventListener('click',()=>dsAttempt(()=>dsEdit(doc=>{
  if(doc.nodes.length>=64)throw Error('Use at most 64 nodes.');const next=1+Math.max(0,...doc.nodes.map(n=>Number(n.id.slice(1))));
  const key=dsScalar(ds('ds-node-key').value);const node={id:'n'+next,key,left:null,right:null,firstChild:null,nextSibling:null,keys:doc.kind==='bplus'?[key]:[],children:[],next:null};doc.nodes.push(node);if(!doc.root)doc.root=node.id;
})));
ds('ds-add-edge').addEventListener('submit',event=>{event.preventDefault();dsAttempt(()=>dsEdit(doc=>{doc.edges.push({from:ds('ds-edge-from').value,to:ds('ds-edge-to').value});}));});
ds('ds-delete').addEventListener('click',()=>ds('ds-delete-dialog').showModal());ds('ds-cancel-delete').addEventListener('click',()=>ds('ds-delete-dialog').close());ds('ds-confirm-delete').addEventListener('click',()=>{const next=dsItems.filter((_,i)=>i!==dsSelected);dsCommit(next,Math.max(0,Math.min(dsSelected,next.length-1)));ds('ds-delete-dialog').close();});
function dsHistory(redo){dsAttempt(()=>{if(dsDirty)throw Error('Apply pending edits before using Undo or Redo.');const from=redo?dsRedo:dsUndo,to=redo?dsUndo:dsRedo;if(!from.length)return;to.push(dsSnapshot());const saved=JSON.parse(from.pop());dsItems=saved.items;dsSelected=saved.selected;dsPersist();dsRender();});}
ds('ds-undo').addEventListener('click',()=>dsHistory(false));ds('ds-redo').addEventListener('click',()=>dsHistory(true));
function dsDownload(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
ds('ds-save').addEventListener('click',()=>dsAttempt(()=>{dsApplyDraft();dsDownload(writeStructureFile(dsItems),'ADS-structures.json','application/json');dsStatus('Structure file downloaded.');}));
ds('ds-svg').addEventListener('click',()=>dsAttempt(()=>{dsApplyDraft();const doc=dsItems[dsSelected];dsDownload(renderStructure(doc),(doc.name.replace(/[^\p{L}\p{N}_-]/gu,'_')||'structure')+'.svg','image/svg+xml');}));
ds('ds-open').addEventListener('click',()=>ds('ds-file').click());ds('ds-file').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>500000)throw Error('Use a structure file smaller than 500 KB.');const incoming=readStructureFile(await file.text());dsApplyDraft();if(dsItems.length+incoming.length>30)throw Error('The combined collection would exceed 30 structures.');dsCommit([...dsItems,...incoming],incoming.length?dsItems.length:dsSelected);}catch(error){dsStatus(error.message,true);}});
window.addEventListener('beforeunload',event=>{if(dsDirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('structogram-before-update',event=>{if(dsDirty||!dsPersist())event.preventDefault();});
window.addEventListener('pagehide',dsPersist);
ds('ds-run').addEventListener('click',()=>dsAttempt(()=>{dsApplyDraft();dsPersist();location.href='./?run=1';}));
dsRender();if(!dsStored)dsStatus('Saved structures could not be loaded or local storage is unavailable. Import a backup if needed.',true);
