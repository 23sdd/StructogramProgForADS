import { escapeXML } from './renderer.js';
import { renderStructure } from './structures-renderer.js';
import { structureType } from './structures-model.js';
export function renderExecutionStructure(snapshot) {
  const {doc,nodes,edge,activeIndices}=snapshot;
  const family=structureType(doc.kind).family;
  if(family==='hash')return renderStructure({...doc,kind:'array',name:doc.name+' · physical table',values:snapshot.storage||[]});
  if(family==='list'){
    const width=Math.max(620,nodes.length*140+120),height=260,positions=new Map(nodes.map((n,i)=>[n.id,{x:80+i*140,y:100}]));
    const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Runtime list pointers">`];
    for(const n of nodes){const p=positions.get(n.id);if(n.next&&positions.has(n.next)){const q=positions.get(n.next);parts.push(`<path d="M ${p.x+40} ${p.y+22} L ${p.x+60} ${p.y+22} L ${p.x+60} 200 L ${q.x-40} 200 L ${q.x-40} ${q.y+22}" fill="none" stroke="#768d7f"/><text x="${p.x+55}" y="${p.y+12}" font-size="11">next</text>`);}}
    for(const n of nodes){const p=positions.get(n.id);parts.push(`<g data-node-id="${escapeXML(n.id)}" class="${n.active?'run-node-active':''}"><rect x="${p.x-40}" y="${p.y}" width="80" height="45" fill="${n.active?'#ffdc92':'white'}" stroke="#6d897b"/><text x="${p.x}" y="${p.y+28}" text-anchor="middle">${escapeXML(String(n.key).slice(0,12))}</text><text x="${p.x}" y="${p.y-12}" text-anchor="middle" font-size="12">${escapeXML(n.id)}</text></g>`);}
    parts.push('</svg>');return parts.join('');
  }
  if(family==='graph'){
    const count=nodes.length,radius=Math.max(120,count*14),width=Math.max(620,radius*2+140),height=Math.max(390,radius*2+130);
    const positions=new Map(nodes.map((n,i)=>[n.id,{x:width/2+radius*Math.cos(i*2*Math.PI/count-Math.PI/2),y:height/2+radius*Math.sin(i*2*Math.PI/count-Math.PI/2)}]));
    const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Execution graph"><defs><marker id="run-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#789185"/></marker></defs>`];
    for(const link of doc.edges){const a=positions.get(link.from),b=positions.get(link.to),angle=Math.atan2(b.y-a.y,b.x-a.x),highlight=edge&&((edge.from===link.from&&edge.to===link.to)||(doc.kind==='graph'&&edge.from===link.to&&edge.to===link.from));
      parts.push(`<line class="${highlight?'run-edge-active':''}" x1="${a.x+29*Math.cos(angle)}" y1="${a.y+29*Math.sin(angle)}" x2="${b.x-31*Math.cos(angle)}" y2="${b.y-31*Math.sin(angle)}" stroke="${highlight?'#cf8b20':'#a5b5aa'}" stroke-width="${highlight?4:1.5}" ${doc.kind==='digraph'?'marker-end="url(#run-arrow)"':''}/>`);
    }
    for(const n of nodes){const p=positions.get(n.id),discovered=(n.d!=='∞'&&n.d!=='—')||['gray','grey','black'].includes(n.color),processed=n.processed||n.color==='black',fill=n.active?'#ffdc92':processed?'#c5e3ce':discovered?'#dceaf8':'#fff';
      parts.push(`<g class="run-node ${n.active?'run-node-active':''}" data-node-id="${escapeXML(n.id)}"><title>${escapeXML(`${n.id}: key=${n.key}; d=${n.d}; π=${n.pi||'∅'}`)}</title><circle cx="${p.x}" cy="${p.y}" r="27" fill="${fill}" stroke="${n.active?'#bc7b16':'#6d897b'}" stroke-width="${n.active?3:1.5}"/><text x="${p.x}" y="${p.y+5}" text-anchor="middle" font-family="Georgia,serif" font-size="16">${escapeXML((String(n.key).length>8?String(n.key).slice(0,7)+'…':n.key))}</text><text x="${p.x}" y="${p.y+47}" text-anchor="middle" font-size="12" fill="#62766a">${escapeXML(`${n.id} · d=${n.d}`)}</text></g>`);
    }
    if(!nodes.length)parts.push('<text x="50" y="80">Empty graph</text>');parts.push('</svg>');return parts.join('');
  }
  // Use the course renderer for geometry, and mark the exact runtime nodes/indices.
  let svg=renderStructure(doc,{runtimeBalances:true});
  if(family==='tree'){
    for(const n of nodes.filter(n=>n.active)){
      const label=escapeXML(n.id===doc.root?`${n.id} ← ${doc.name}`:n.id);
      svg=svg.replace(new RegExp(`(<text[^>]*>)${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(</text>)`,'g'),`$1▶ ${label}$2`);
    }
  }
  if(activeIndices?.length)svg=svg.replace('</svg>',`<text x="20" y="60" font-size="14" fill="#a16b12">${escapeXML('Active indices: '+activeIndices.join(', '))}</text></svg>`);
  return svg;
}
