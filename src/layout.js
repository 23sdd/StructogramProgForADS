export function initWorkspaceLayout(onResize) {
  const workspace = document.querySelector('.editor-workspace');
  const divider = document.getElementById('panel-divider');
  const panels = { algorithm: document.getElementById('algorithm-panel'), structogram: document.getElementById('structogram-panel') };
  const buttons = Object.fromEntries(Object.keys(panels).map(name => [name, document.getElementById('expand-' + name)]));
  const key = 'structogram.ads.layout.v1';
  const desktopLayout = matchMedia('(min-width: 861px)');
  let ratio = 44, expanded = null, dragging = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (typeof saved?.ratio === 'number' && Number.isFinite(saved.ratio)) ratio = Math.max(20, Math.min(80, saved.ratio));
  } catch { /* Layout remains usable when storage is unavailable. */ }
  function bounds() {
    const available = Math.max(1, workspace.clientWidth - divider.offsetWidth);
    const min = Math.max(20, Math.min(45, 280 / available * 100));
    return [min, 100 - min];
  }
  function apply() {
    if (desktopLayout.matches && !expanded) {
      const [min, max] = bounds();
      const displayed = Math.max(min, Math.min(max, ratio));
      workspace.style.setProperty('--algorithm-share', displayed + 'fr');
      workspace.style.setProperty('--structogram-share', (100 - displayed) + 'fr');
      divider.setAttribute('aria-valuemin', Math.ceil(min));
      divider.setAttribute('aria-valuemax', Math.floor(max));
      divider.setAttribute('aria-valuenow', Math.round(displayed));
      divider.setAttribute('aria-valuetext', `Algorithm ${Math.round(displayed)}%, structogram ${Math.round(100 - displayed)}%`);
    }
    onResize();
  }
  function save() { try { localStorage.setItem(key, JSON.stringify({ ratio })); } catch { /* Optional preference. */ } }
  function change(value) {
    const [min, max] = bounds();
    ratio = Math.max(min, Math.min(max, value));
    apply();
  }
  function endDrag() {
    if (dragging === null) return;
    const pointer = dragging;
    dragging = null;
    if (divider.hasPointerCapture(pointer)) divider.releasePointerCapture(pointer);
    document.body.classList.remove('resizing-panels');
    save();
  }
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0 || expanded || !desktopLayout.matches) return;
    event.preventDefault();
    divider.focus();
    dragging = event.pointerId;
    divider.setPointerCapture(dragging);
    document.body.classList.add('resizing-panels');
  });
  divider.addEventListener('pointermove', event => {
    if (event.pointerId !== dragging) return;
    const rect = workspace.getBoundingClientRect();
    change((event.clientX - rect.left - workspace.clientLeft - divider.offsetWidth / 2) / (workspace.clientWidth - divider.offsetWidth) * 100);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(name, endDrag);
  window.addEventListener('blur', endDrag);
  divider.addEventListener('dblclick', () => { ratio = 44; apply(); save(); });
  divider.addEventListener('keydown', event => {
    const [min, max] = bounds(), current = Number(divider.getAttribute('aria-valuenow'));
    const step = event.shiftKey ? 10 : 2;
    const next = { ArrowLeft: current - step, ArrowRight: current + step, Home: min, End: max, Enter: 44 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); change(next); save();
  });
  function expand(name) {
    endDrag();
    expanded = expanded === name ? null : name;
    workspace.dataset.expanded = expanded || '';
    document.body.classList.toggle('panel-expanded', Boolean(expanded));
    for (const [id, button] of Object.entries(buttons)) {
      const active = id === expanded;
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'Restore split view' : `Expand ${id} panel`);
      button.title = active ? 'Restore split view (Esc)' : `Expand ${id} panel`;
      button.textContent = active ? '↙ Restore' : '⛶';
    }
    // Keep focus in the visible panel; collapsing returns it to the same control.
    buttons[name].focus({ preventScroll: true });
    requestAnimationFrame(apply);
  }
  for (const name of Object.keys(panels)) buttons[name].addEventListener('click', () => expand(name));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded && !event.defaultPrevented && !document.querySelector('dialog[open]')) {
      event.preventDefault(); expand(expanded);
    }
  });
  new ResizeObserver(apply).observe(workspace);
  desktopLayout.addEventListener('change', () => { endDrag(); apply(); });
  apply();
}
