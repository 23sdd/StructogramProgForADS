import { notation } from './parser.js';

export function escapeXML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

/** All geometry is shared by the preview and exports. measure is a canvas text measurement in the browser. */
export function render(routines, { measure = text => [...text].length * 10, title = 'Structogram' } = {}) {
  const padding = 24, rail = 24, lineHeight = 25;
  const wrapped = (text, maxWidth = 440) => {
    const result = [];
    let current = '';
    for (const word of notation(text).split(/(\s+)/)) {
      if (measure(current + word) <= maxWidth) { current += word; continue; }
      if (current.trim()) { result.push(current.trim()); current = ''; }
      for (const char of word) {
        if (measure(current + char) > maxWidth && current) { result.push(current.trim()); current = ''; }
        current += char;
      }
    }
    if (current.trim() || !result.length) result.push(current.trim());
    return result;
  };
  const label = text => {
    const lines = wrapped(text);
    return { lines, width: Math.max(82, ...lines.map(measure).map(width => Math.ceil(width) + padding)), height: Math.max(33, lines.length * lineHeight + 8) };
  };
  function sequence(nodes) {
    const items = nodes.map(layout);
    return { items, width: Math.max(82, ...items.map(item => item.width)), height: items.reduce((sum, item) => sum + item.height, 0) };
  }
  function layout(node) {
    if (node.type === 'statement') return { ...label(node.text), node };
    if (node.type === 'loop') {
      const header = label(node.text), body = sequence(node.body);
      return { node, header, body, width: Math.max(header.width, body.width + rail), height: header.height + body.height };
    }
    if (node.type === 'if') {
      const header = label(node.text), yes = sequence(node.yes), no = sequence(node.no);
      return { node, header, yes, no, width: Math.max(header.width + 18, yes.width + no.width), height: header.height + Math.max(yes.height, no.height) };
    }
    const branches = node.branches.map(branch => {
      const header = label(branch.text), body = sequence(branch.body);
      return { branch, header, body, width: Math.max(header.width + 18, body.width) };
    });
    const headerHeight = Math.max(...branches.map(branch => branch.header.height));
    return { node, branches, headerHeight, width: branches.reduce((sum, branch) => sum + branch.width, 0), height: headerHeight + Math.max(...branches.map(branch => branch.body.height)) };
  }
  const documents = routines.map(routine => {
    const body = sequence(routine.body), signature = label(routine.signature);
    return { routine, body, signature, width: Math.max(280, body.width, signature.width), height: signature.height + 12 + body.height };
  });
  const width = Math.max(...documents.map(document => document.width)) + 60;
  const height = documents.reduce((sum, document) => sum + document.height, 0) + 60 + (documents.length - 1) * 40;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="diagram-title diagram-description"><title id="diagram-title">${escapeXML(title)}</title><desc id="diagram-description">Course-style structure diagram. ${routines.length} routine${routines.length === 1 ? '' : 's'}. Use the source editor for an accessible text version.</desc><style>text{font-family:"Times New Roman",Georgia,serif;font-size:18px;fill:#20251f} .rule{fill:none;stroke:#363c34;stroke-width:.85;stroke-linejoin:miter}.hit-area{fill:#fff;fill-opacity:0} .comment{fill:#858b80}</style><rect width="100%" height="100%" fill="white"/>`];
  const rect = (x, y, w, h, radius = 0) => parts.push(`<rect class="rule" x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}"/>`);
  const line = (x1, y1, x2, y2) => parts.push(`<path class="rule" d="M${x1} ${y1}L${x2} ${y2}"/>`);
  const hit = (sourceLine, x, y, w, h) => parts.push(`<g data-line="${sourceLine}"><rect class="hit-area" x="${x}" y="${y}" width="${w}" height="${h}"/>`);
  const text = (lines, x, y, w, h, { signature = false, comment = false } = {}) => {
    const start = y + h / 2 - (lines.length - 1) * lineHeight / 2;
    lines.forEach((value, i) => {
      const isSkip = value === 'SKIP';
      const content = /^return\b/.test(value)
        ? `<tspan font-weight="bold" font-style="normal">return</tspan>${escapeXML(value.slice(6))}`
        : escapeXML(value);
      parts.push(`<text x="${x + w / 2}" y="${start + i * lineHeight}" text-anchor="middle" dominant-baseline="central" font-style="${signature || isSkip ? 'normal' : 'italic'}"${comment ? ' class="comment"' : ''}>${content}</text>`);
    });
  };
  const diagonal = (x, y, w, h) => { line(x, y + h - 19, x + 8, y + h); line(x + w, y + h - 19, x + w - 8, y + h); };
  function drawSequence(seq, x, y, w, h = seq.height) {
    let position = y;
    seq.items.forEach((item, i) => {
      // Stretch the last row to fill a shorter selection branch, keeping all branches closed.
      const itemHeight = item.height + (i === seq.items.length - 1 ? h - seq.height : 0);
      draw(item, x, position, w, itemHeight);
      position += itemHeight;
    });
  }
  function draw(item, x, y, w, h) {
    const { node } = item;
    if (node.type === 'statement') {
      hit(node.line, x, y, w, h);
      rect(x, y, w, h);
      text(item.lines, x, y, w, h, { comment: node.text.startsWith('//') });
      parts.push('</g>');
    } else if (node.type === 'loop') {
      rect(x, y, w, h);
      hit(node.line, x, y, w, item.header.height);
      text(item.header.lines, x, y, w, item.header.height);
      line(x + rail, y + item.header.height, x + w, y + item.header.height);
      parts.push('</g>');
      drawSequence(item.body, x + rail, y + item.header.height, w - rail, h - item.header.height);
    } else if (node.type === 'if') {
      const headerH = item.header.height;
      hit(node.line, x, y, w, headerH);
      rect(x, y, w, headerH);
      diagonal(x, y, w, headerH);
      text(item.header.lines, x, y, w, headerH);
      parts.push('</g>');
      const split = Math.round(w * item.yes.width / (item.yes.width + item.no.width));
      drawSequence(item.yes, x, y + headerH, split, h - headerH);
      drawSequence(item.no, x + split, y + headerH, w - split, h - headerH);
    } else {
      let position = x;
      item.branches.forEach((branch, i) => {
        const branchW = i === item.branches.length - 1 ? x + w - position : Math.round(w * branch.width / item.width);
        hit(branch.branch.line, position, y, branchW, item.headerHeight);
        rect(position, y, branchW, item.headerHeight);
        diagonal(position, y, branchW, item.headerHeight);
        text(branch.header.lines, position, y, branchW, item.headerHeight);
        parts.push('</g>');
        drawSequence(branch.body, position, y + item.headerHeight, branchW, h - item.headerHeight);
        position += branchW;
      });
    }
  }
  let position = 30;
  for (const { routine, signature, body, width: documentWidth, height: documentHeight } of documents) {
    const x = (width - documentWidth) / 2, signatureWidth = Math.min(documentWidth, signature.width);
    hit(routine.line, (width - signatureWidth) / 2, position, signatureWidth, signature.height);
    rect((width - signatureWidth) / 2, position, signatureWidth, signature.height, 13);
    text(signature.lines, 0, position, width, signature.height, { signature: true });
    parts.push('</g>');
    drawSequence(body, x, position + signature.height + 12, documentWidth);
    position += documentHeight + 40;
  }
  parts.push('</svg>');
  return { svg: parts.join(''), width, height };
}
