(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  async function loadSites(){
    const url = new URL('assets/sites.json', location.href).href;
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error('sites.json HTTP ' + res.status + ' @ ' + url);
    const data = await res.json();
    if(Array.isArray(data)) return data;
    if(data && Array.isArray(data.sites)) return data.sites;
    return data ? [data] : [];
  }

  function normSite(s){
    const title = s.title || s.name || s.slug || '(no title)';
    const slug  = s.slug || (title || '').toLowerCase().replace(/\s+/g,'-');

    let href = s.href || s.url || s.path || s.link || '';
    if(!href){
      const clean = String(slug || '').replace(/^\/+|\/+$/g,'');
      href = clean ? ('/' + clean + '/') : '#';
    }

    const tags = Array.isArray(s.tags) ? s.tags.map(String) : (s.tags ? [String(s.tags)] : []);
    const desc = s.desc || s.description || '';
    const cat  = s.cat || s.category || '';

    return { title, slug, href, tags, desc, cat };
  }

  let SITES = [];
  let ACTIVE_TAG = '';

  function renderChips(){
    const chips = byId('chips');
    if(!chips) return;

    const set = new Set();
    SITES.forEach(s => (s.tags || []).forEach(t => set.add(t)));

    const arr = [...set].sort((a,b)=>String(a).localeCompare(String(b),'ja'));
    chips.innerHTML = '';
    if(arr.length === 0) return;

    arr.forEach(t => {
      const d = document.createElement('div');
      d.className = 'chip' + (t === ACTIVE_TAG ? ' active' : '');
      d.textContent = t;
      d.addEventListener('click', () => {
        ACTIVE_TAG = (ACTIVE_TAG === t) ? '' : t;
        renderChips();
        renderGrid();
      });
      chips.appendChild(d);
    });
  }

  function matches(site, q){
    if(!q) return true;
    q = q.toLowerCase();
    const hay = [
      site.title, site.slug, site.desc, site.cat,
      ...(site.tags || [])
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function renderGrid(){
    const grid = byId('grid');
    if(!grid) return;

    const q = (byId('q') ? byId('q').value : '').trim();
    const list = SITES
      .filter(s => matches(s, q))
      .filter(s => !ACTIVE_TAG || (s.tags || []).includes(ACTIVE_TAG));

    grid.innerHTML = '';

    if(list.length === 0){
      grid.innerHTML = '<div class="card" style="grid-column:span 12">該当なし</div>';
      return;
    }

    list.forEach(s => {
      const a = document.createElement('a');
      a.className = 'card';
      a.href = s.href;

      let html = '<div class="title">' + escapeHtml(s.title) + '</div>';
      if(s.desc) html += '<div class="desc">' + escapeHtml(s.desc) + '</div>';

      if(s.tags && s.tags.length){
        html += '<div class="tags">' + s.tags.map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('') + '</div>';
      }

      a.innerHTML = html;
      grid.appendChild(a);
    });
  }

  async function boot(){
    const grid = byId('grid');
    try{
      const raw = await loadSites();
      SITES = raw.map(normSite);

      renderChips();
      renderGrid();

      const qEl = byId('q');
      if(qEl){
        qEl.addEventListener('input', renderGrid);
        qEl.addEventListener('keydown', (e) => {
          if(e.key === 'Escape'){
            qEl.value = '';
            renderGrid();
          }
        });
      }
    }catch(e){
      console.error(e);
      if(grid){
        const msg = (e && e.message) ? e.message : String(e);
        grid.innerHTML = '<div class="card" style="grid-column:span 12">読み込みに失敗：' + escapeHtml(msg) + '</div>';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();