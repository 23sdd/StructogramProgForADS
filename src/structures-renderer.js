import { structureType, analyseStructure, graphRepresentations, hashBuckets } from './structures-model.js';
export function escapeStructure(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
export function renderStructure(doc,{runtimeBalances=false}={}){
  const type=structureType(doc.kind),{metrics}=analyseStructure(doc),parts=[];
  let width=900,height=280;
  const text=(x,y,value,size=16)=>`<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle">${escapeStructure(value)}</text>`;
  const box=(x,y,w,h,label)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="white" stroke="#263b32"/>${text(x+w/2,y+h/2+6,label)}`;
  const arrow=(x1,y1,x2,y2,label='',dashed=false)=>`<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="#607c70" ${dashed?'stroke-dasharray="5 3"':''} marker-end="url(#ds-arrow)"/>${label?text((x1+x2)/2,(y1+y2)/2-9,label,11):''}`;
  if(type.family==='linear'||type.family==='list'){
    const values=doc.values;
    if(['set','sequence'].includes(doc.kind)){
      width=Math.max(700,values.length*85);parts.push(text(width/2,115,`${doc.name} = ${doc.kind==='set'?'{':'⟨'} ${values.join(', ')} ${doc.kind==='set'?'}':'⟩'}`,22));
    }else if(type.family==='list'){
      const header=['h1l','c2l'].includes(doc.kind),trailer=doc.kind==='t1l',cyclic=['c1l','c2l'].includes(doc.kind),doubly=['s2l','c2l'].includes(doc.kind);
      const entries=[...(header?['H']:[]),...values,...(trailer?['T']:[])];
      width=Math.max(750,entries.length*132+150);height=320;
      parts.push(text(60,155,doc.name));
      if(entries.length)parts.push(arrow(85,150,120,150));else parts.push(text(140,155,'∅'));
      entries.forEach((value,i)=>{
        const x=120+i*132;parts.push(box(x,120,96,60,value));parts.push(text(x+48,105,header&&i===0?'H':trailer&&i===entries.length-1?'T':'p'+(i+(header?0:1)),12));
        if(i<entries.length-1){parts.push(arrow(x+96,140,x+132,140,'next'));if(doubly)parts.push(arrow(x+132,170,x+96,170,'prev'));}
      });
      if(entries.length){const end=120+(entries.length-1)*132+96;
        if(cyclic){parts.push(`<path d="M ${end} 150 L ${end+25} 150 L ${end+25} 230 L 145 230 L 145 185" fill="none" stroke="#607c70" marker-end="url(#ds-arrow)"/>`);parts.push(text(width/2,250,'next → '+(header?'H':entries.length?'p1':'∅'),13));if(doubly)parts.push(text(width/2,280,'H→prev → '+(values.length?'p'+values.length:'H'),13));}
        else{parts.push(arrow(end,150,end+35,150));parts.push(text(end+55,155,'∅'));if(doubly)parts.push(text(155,205,'prev = ∅',12));}
      }
    }else{
      const storage=['stack','queue','heap'].includes(doc.kind),count=storage?doc.capacity:values.length;
      width=Math.max(750,count*78+100);height=doc.kind==='stack'?Math.max(300,count*55+100):280;
      parts.push(text(65,85,doc.kind==='queue'?'Z':'A',20));
      for(let i=0;i<count;i++){
        const logical=doc.kind==='queue'?(i-doc.start+doc.capacity)%doc.capacity:i;
        const value=logical<values.length?values[logical]:'·';
        const x=doc.kind==='stack'?140:80+i*78,y=doc.kind==='stack'?65+(count-1-i)*55:110;
        parts.push(box(x,y,70,48,value).replace('<rect ','<rect data-array-index="'+i+'" '),text(x+35,y-8,i,12));
        if(doc.kind==='stack'&&i===values.length-1)parts.push(text(x+140,y+30,'← top',14));
        if(doc.kind==='queue'&&i===doc.start)parts.push(text(x+35,y+75,'↑ k',13));
      }
      if(!count)parts.push(text(300,140,'Empty array · length = 0'));
      parts.push(text(width/2,height-22,`n = ${values.length}${storage?' · capacity = '+doc.capacity:''}${doc.kind==='queue'?' · k = '+doc.start:''}`));
      if(doc.kind==='heap'){
        const positions=values.map((_,i)=>{const depth=Math.floor(Math.log2(i+1)),slot=i-(2**depth-1),slots=2**depth;return{x:width*(slot+0.5)/slots,y:250+depth*85};});
        for(let i=1;i<values.length;i++){const p=positions[Math.floor((i-1)/2)],q=positions[i];parts.push(arrow(p.x,p.y+18,q.x,q.y-20));}
        positions.forEach((p,i)=>parts.push(`<circle cx="${p.x}" cy="${p.y}" r="23" fill="white" stroke="#263b32"/>`,text(p.x,p.y+6,values[i]),text(p.x,p.y+42,`A[${i}]`,11)));
        height=values.length?positions.at(-1).y+80:300;
      }
    }
  }else if(type.family==='hash'){
    const buckets=hashBuckets(doc);width=Math.max(760,...buckets.map(b=>b.length*100+220));height=Math.max(280,doc.capacity*54+110);
    buckets.forEach((bucket,i)=>{const y=80+i*54;parts.push(text(45,y+27,i,13),box(75,y,65,42,bucket.length&&doc.kind!=='chain'?bucket[0]:bucket.length?'→':doc.kind==='open'?'E':'∅'));
      if(doc.kind==='chain')bucket.forEach((key,j)=>{const x=185+j*100;parts.push(arrow(x-45,y+21,x-3,y+21),box(x,y,75,42,key));if(j===bucket.length-1)parts.push(text(x+100,y+27,'∅'));});
    });
  }else if(type.family==='tree'){
    const byId=new Map(doc.nodes.map(n=>[n.id,n])),positions=new Map(),seen=new Set();let leaf=0,maxDepth=0;
    function layout(id,depth){if(!id||seen.has(id))return;seen.add(id);maxDepth=Math.max(maxDepth,depth);const node=byId.get(id);
      const children=doc.kind==='general'?[node.firstChild,node.nextSibling]:doc.kind==='bplus'?node.children:[node.left,node.right];
      const before=leaf;children.filter(Boolean).forEach(child=>layout(child,depth+1));if(leaf===before)leaf++;
      positions.set(id,{x:(before+leaf)/2*155+55,y:100+depth*110});
    }
    layout(doc.root,0);doc.nodes.forEach(n=>{if(!seen.has(n.id))layout(n.id,0);});width=Math.max(750,leaf*155+110);height=Math.max(280,maxDepth*110+210);
    for(const n of doc.nodes){const p=positions.get(n.id),refs=doc.kind==='general'?[[n.firstChild,'firstChild'],[n.nextSibling,'nextSibling']]:doc.kind==='bplus'?n.children.map((id,i)=>[id,'c'+i]):[[n.left,'left'],[n.right,'right']];
      refs.forEach(([id,label])=>{if(id){const q=positions.get(id);parts.push(arrow(p.x,p.y+22,q.x,q.y-25,label,label==='nextSibling'));}else if(doc.kind!=='bplus')parts.push(text(p.x+(label==='left'||label==='firstChild'?-33:33),p.y+52,'∅',12));});
      if(doc.kind==='bplus'&&n.next){const q=positions.get(n.next);parts.push(arrow(p.x+45,p.y,q.x-45,q.y,'next',true));}
    }
    for(const n of doc.nodes){const p=positions.get(n.id);
      if(doc.kind==='bplus'){const w=Math.max(90,n.keys.length*35);parts.push(box(p.x-w/2,p.y-24,w,48,n.keys.join(' | ')||'∅'));}
      else parts.push(`<circle data-node-id="${escapeStructure(n.id)}" cx="${p.x}" cy="${p.y}" r="26" fill="white" stroke="#263b32"/>`,text(p.x,p.y+6,n.key));
      parts.push(text(p.x,p.y-38,n.id===doc.root?`${n.id} ← ${doc.name}`:n.id,12));
      if(doc.kind==='avl'&&(n.left||n.right)){const b=runtimeBalances?(n.b??0):(metrics[n.id]?.balance??0);parts.push(text(p.x+43,p.y+5,b===0?'◦':b===1?'+':b===-1?'−':b===2?'++':b===-2?'−−':b,15));}
    }
    if(!doc.nodes.length)parts.push(text(250,130,`${doc.name} = ∅`));
  }else{
    const n=doc.nodes.length;const radius=Math.max(110,n*13);width=Math.max(760,radius*2+160);height=Math.max(350,radius*2+150);
    const positions=doc.nodes.map((_,i)=>({x:width/2+radius*Math.cos(i*2*Math.PI/n-Math.PI/2),y:height/2+radius*Math.sin(i*2*Math.PI/n-Math.PI/2)}));
    for(const edge of doc.edges){const p=positions[doc.nodes.findIndex(n=>n.id===edge.from)],q=positions[doc.nodes.findIndex(n=>n.id===edge.to)],angle=Math.atan2(q.y-p.y,q.x-p.x);parts.push(`<line x1="${p.x+27*Math.cos(angle)}" y1="${p.y+27*Math.sin(angle)}" x2="${q.x-29*Math.cos(angle)}" y2="${q.y-29*Math.sin(angle)}" stroke="#607c70" ${doc.kind==='digraph'?'marker-end="url(#ds-arrow)"':''}/>`);}
    positions.forEach((p,i)=>parts.push(`<circle cx="${p.x}" cy="${p.y}" r="25" fill="white" stroke="#263b32"/>`,text(p.x,p.y+6,doc.nodes[i].key),text(p.x,p.y+45,`v${i+1} · ${doc.nodes[i].id}`,11)));
    if(!n)parts.push(text(width/2,height/2,'G.V = {} · G.E = {}'));
  }
  const title=`${doc.name} · ${type.label}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeStructure(title)}"><title>${escapeStructure(title)}</title><defs><marker id="ds-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#607c70"/></marker></defs><rect width="100%" height="100%" fill="white"/><g font-family="Georgia,serif" fill="#263b32">${text(width/2,35,title,20)}${parts.join('')}</g></svg>`;
}
export function structureNotation(doc){
  const type=structureType(doc.kind),out=[`${doc.name} : ${type.label}`];
  if(type.family==='list'){
    const header=['h1l','c2l'].includes(doc.kind),trailer=doc.kind==='t1l',cyclic=['c1l','c2l'].includes(doc.kind),two=['s2l','c2l'].includes(doc.kind),n=doc.values.length;
    out.push(`${doc.name} → ${header?'H':n?'p1':trailer?'T':'∅'}`);
    if(header)out.push(`H→next = ${n?'p1':doc.kind==='c2l'?'H':'∅'}`);
    doc.values.forEach((v,i)=>out.push(`p${i+1}→key = ${JSON.stringify(v)}; next = ${i+1<n?'p'+(i+2):cyclic?header?'H':'p1':trailer?'T':'∅'}${two?'; prev = '+(i?'p'+i:header?'H':'∅'):''}`));
    if(doc.kind==='c2l')out.push(`H→prev = ${n?'p'+n:'H'}`);if(trailer)out.push('T→next = ∅; T→key is undefined');
  }else if(type.family==='tree'){
    out.push(`${doc.name} = ${doc.root||'∅'}`);
    const {metrics}=analyseStructure(doc);
    for(const n of doc.nodes)out.push(doc.kind==='general'?`${n.id}→key = ${JSON.stringify(n.key)}; firstChild = ${n.firstChild||'∅'}; nextSibling = ${n.nextSibling||'∅'}`:doc.kind==='bplus'?`${n.id}: keys = [${n.keys.join(', ')}]; children = [${n.children.join(', ')}]; next = ${n.next||'∅'}`:`${n.id}→key = ${JSON.stringify(n.key)}; left = ${n.left||'∅'}; right = ${n.right||'∅'}${doc.kind==='avl'?'; b = '+(metrics[n.id]?.balance??'?'):''}`);
    if(doc.kind==='avl')out.push('h(∅) = −1; p→b = h(p→right) − h(p→left)');
  }else if(type.family==='graph'){
    const {adj}=graphRepresentations(doc);out.push(`G.V = {${doc.nodes.map((n,i)=>`v${i+1}=${JSON.stringify(n.key)}`).join(', ')}}`);
    adj.forEach((a,i)=>out.push(`A[${i+1}] → ${a.map(j=>'v = '+j).join(' → ')}${a.length?' → ':''}∅`));out.push('A/1 : Edge*[n]; Edge { v : N; next : Edge* }');
  }else if(type.family==='hash'){
    out.push(`T[0..${doc.capacity}) · m = ${doc.capacity} · n = ${doc.values.length}`,doc.kind==='direct'?'T[k] stores key k':`h(k) = ((k mod m) + m) mod m${doc.kind==='open'?'; linear probing h(k,i) = (h(k) + i) mod m':''}`);
    hashBuckets(doc).forEach((b,i)=>out.push(`T[${i}] = ${b.length?b.join(' → ')+(doc.kind==='chain'?' → ∅':''):doc.kind==='open'?'E':'∅'}`));
    if(doc.kind==='open')out.push('E = empty. Editing the value list rebuilds the table; this editor rebuilds layouts rather than performing in-place D-marker deletion.');
  }else{
    const stored=doc.kind==='queue'?Array.from({length:doc.capacity},(_,i)=>{const logical=(i-doc.start+doc.capacity)%doc.capacity;return logical<doc.values.length?JSON.stringify(doc.values[logical]):'·';}):doc.values.map(v=>JSON.stringify(v));
    out.push(`${doc.kind==='queue'?'Z':'A'} = [${stored.join(', ')}]`, `n = ${doc.values.length}`);
    if(doc.kind==='stack')out.push(`top = ${doc.values.length?'A['+(doc.values.length-1)+']':'∅'}; A.length = ${doc.capacity}`);
    if(doc.kind==='queue')out.push(`Z.length = ${doc.capacity}; k = ${doc.start}; logical items: ⟨Z[k], Z[(k+1) mod Z.length], …⟩`);
    if(doc.kind==='heap')out.push('left(i) = 2i+1; right(i) = 2i+2; parent(j) = ⌊(j−1)/2⌋; parent key ≥ child keys');
    if(doc.kind==='set')out.push(`${doc.name} = {${doc.values.join(', ')}}`);
    if(doc.kind==='sequence')out.push(`${doc.name} = ⟨${doc.values.join(', ')}⟩; indices start at 1`);
  }
  return out.join('\n');
}
