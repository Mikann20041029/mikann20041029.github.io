async function loadSites(){
  const res = await fetch('./assets/sites.json?cb=' + Date.now());
  if(!res.ok) throw new Error('sites.json load failed');
  return await res.json();
}

function el(tag, cls, txt){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(txt !== undefined) e.textContent = txt;
  return e;
}

function renderChips(allTags){
  const chips = document.getElementById('chips');
  chips.innerHTML = '';
  const tags = Array.from(new Set(allTags)).sort();
  tags.forEach(t=>{
    const c = el('div','chip',t);
    c.dataset.tag = t;
    c.addEventListener('click', ()=>{
      c.classList.toggle('on');
      applyFilter();
    });
    chips.appendChild(c);
  });
}

let SITES = [];
function applyFilter(){
  const q = (document.getElementById('q').value || '').trim().toLowerCase();
  const onTags = Array.from(document.querySelectorAll('.chip.on')).map(x=>x.dataset.tag);
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  const list = SITES.filter(s=>{
    const hay = (s.slug+' '+s.title+' '+(s.desc||'')+' '+(s.tags||[]).join(' ')).toLowerCase();
    const okQ = !q || hay.includes(q);
    const okT = onTags.length===0 || onTags.every(t => (s.tags||[]).includes(t));
    return okQ && okT;
  });

  list.forEach(s=>{
    const card = el('div','card');
    const h = el('div','h');
    const left = el('div');
    left.appendChild(el('div','name', s.title || s.slug));
    left.appendChild(el('div','slug', '/'+s.slug+'/'));
    h.appendChild(left);

    const btnrow = el('div','btnrow');
    const a = el('a','btn','開く');
    const entry = (s.entry && String(s.entry).trim()) ? ('/' + s.slug + '/' + String(s.entry).replace(/^\/+/,'')) : ('/' + s.slug + '/');
    a.href = entry;
    a.rel = 'noopener';
    btnrow.appendChild(a);
    h.appendChild(btnrow);

    card.appendChild(h);
    if(s.desc) card.appendChild(el('div','desc', s.desc));

    const tags = el('div','tags');
    (s.tags||[]).forEach(t=> tags.appendChild(el('div','tag',t)));
    card.appendChild(tags);

    grid.appendChild(card);
  });
}

(async ()=>{
  try{
    SITES = await loadSites();
    const allTags = SITES.flatMap(s=>s.tags||[]);
    renderChips(allTags);
    document.getElementById('q').addEventListener('input', applyFilter);
    applyFilter();
  }catch(e){
    const grid = document.getElementById('grid');
    grid.innerHTML = '<div class="card" style="grid-column:span 12">読み込みに失敗：sites.json</div>';
  }
})();