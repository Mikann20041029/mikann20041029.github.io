(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  async function loadSites(){
    const url = new URL('assets/sites.json', location.href).href; // 末尾スラッシュ問題回避
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
    const cat  = s.cat || s.category || '';
    const desc = s.desc || s.description || '';

    // バッジに使う文字（タイトル先頭）
    const badge = (String(title).trim().slice(0,1) || 'M').toUpperCase();

    return { title, slug, href, tags, cat, desc, badge };
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
        renderList();
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

  function setCount(n){
    const el = byId('count');
    if(!el) return;
    el.textContent = '表示：' + n + ' 件';
  }

  function renderList(){
    const grid = byId('grid');
    if(!grid) return;

    const q = (byId('q') ? byId('q').value : '').trim();
    const list = SITES
      .filter(s => matches(s, q))
      .filter(s => !ACTIVE_TAG || (s.tags || []).includes(ACTIVE_TAG));

    setCount(list.length);

    grid.innerHTML = '';

    if(list.length === 0){
      grid.innerHTML = '<div class="help"><h2>該当なし</h2><div style="color:#475569;font-size:13px">検索ワードを短くするか、タグを解除してみて。</div></div>';
      return;
    }

    const frag = document.createDocumentFragment();

    list.forEach(s => {
      const a = document.createElement('a');
      a.className = 'siteBtn';
      a.href = s.href;

      const left = document.createElement('div');
      left.className = 'siteLeft';

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = s.badge;

      const textWrap = document.createElement('div');
      textWrap.style.minWidth = '0';

      const title = document.createElement('div');
      title.className = 'siteTitle';
      title.textContent = s.title;

      const tags = document.createElement('div');
      tags.className = 'siteTags';

      const showTags = (s.tags || []).slice(0,3);
      showTags.forEach(t => {
        const sp = document.createElement('span');
        sp.textContent = t;
        tags.appendChild(sp);
      });

      textWrap.appendChild(title);
      if(showTags.length) textWrap.appendChild(tags);

      left.appendChild(badge);
      left.appendChild(textWrap);

      const chev = document.createElement('div');
      chev.className = 'chev';
      chev.innerHTML = '&rsaquo;';

      a.appendChild(left);
      a.appendChild(chev);

      frag.appendChild(a);
    });

    grid.appendChild(frag);
  }

  async function boot(){
    const grid = byId('grid');
    try{
      const raw = await loadSites();
      SITES = raw.map(normSite);

      renderChips();
      renderList();

      const qEl = byId('q');
      const clearBtn = byId('clear');

      if(qEl){
        qEl.addEventListener('input', renderList);
        qEl.addEventListener('keydown', (e) => {
          if(e.key === 'Escape'){
            qEl.value = '';
            ACTIVE_TAG = '';
            renderChips();
            renderList();
          }
        });
      }

      if(clearBtn && qEl){
        clearBtn.addEventListener('click', () => {
          qEl.value = '';
          ACTIVE_TAG = '';
          renderChips();
          renderList();
          qEl.focus();
        });
      }
    }catch(e){
      console.error(e);
      if(grid){
        const msg = (e && e.message) ? e.message : String(e);
        grid.innerHTML = '<div class="help"><h2>読み込みに失敗</h2><div style="color:#475569;font-size:13px">' + escapeHtml(msg) + '</div></div>';
      }
      setCount(0);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();