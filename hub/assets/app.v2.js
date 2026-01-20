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
    const slug  = (s.slug || '').trim() || String(title).toLowerCase().replace(/\s+/g,'-');

    let href = s.href || s.url || s.path || s.link || '';
    if(!href){
      const clean = String(slug || '').replace(/^\/+|\/+$/g,'');
      href = clean ? ('/' + clean + '/') : '#';
    }

    const tags = Array.isArray(s.tags) ? s.tags.map(String) : (s.tags ? [String(s.tags)] : []);
    const desc = s.desc || s.description || '';
    const cat  = s.cat || s.category || '';

    // 窶懊・繧ｿ繝ｳ縺ｫ蜃ｺ縺咏洒縺・ち繧､繝医Ν窶・(縺ｧ縺阪ｋ縺縺・繝ｯ繝ｼ繝峨▲縺ｽ縺・
    const short = (s.short || '').trim() || String(title).split(/[|・・・壺披貼-]/)[0].trim();

    return { title, short, slug, href, tags, desc, cat };
  }

  // 譁ｰ繧ｵ繧､繝医′譚･縺ｦ繧り・蜍輔〒縲後ず繝｣繝ｳ繝ｫ邂ｱ縲阪ｒ菴懊ｌ繧九ｈ縺・↓・喞at/tags/slug/title 縺九ｉ謗ｨ螳・  function inferGenre(site){
    const cat = (site.cat || '').trim();
    if(cat) return cat;

    const tset = new Set((site.tags || []).map(t => String(t).toLowerCase()));
    const pick = (arr) => arr.find(x => tset.has(x));
    const hitTag =
      pick(['tool','tools','guide','rank','site','utility','calc','calculator','video','image','pdf','sns']);
    if(hitTag){
      const map = {
        tool:'Tool', tools:'Tool',
        guide:'Guide',
        rank:'Rank',
        site:'Site',
        utility:'Utility',
        calc:'Calculator', calculator:'Calculator',
        video:'Video',
        image:'Image',
        pdf:'PDF',
        sns:'SNS'
      };
      return map[hitTag] || hitTag;
    }

    const hay = (site.slug + ' ' + site.title).toLowerCase();
    const rules = [
      ['Rank', ['rank','ranking','growth']],
      ['Tool', ['tool','tools','toolbox/calc.html','utils','utility','local-file-tools']],
      ['Calculator', ['calc','calculator','pv','rpm','adsense']],
      ['Video', ['video','mp4','compress','compression']],
      ['PDF', ['pdf','merge','heic']],
      ['Guide', ['guide','how','manual','docs']]
    ];
    for(const [g, keys] of rules){
      if(keys.some(k => hay.includes(k))) return g;
    }

    return 'Other';
  }

  let SITES = [];
  let ACTIVE_TAG = '';
  let QUERY = '';

  function allTags(){
    const set = new Set();
    for(const s of SITES){
      (s.tags || []).forEach(t => set.add(String(t)));
    }
    return [...set].sort((a,b)=>String(a).localeCompare(String(b),'ja'));
  }

  function renderChips(){
    const chips = byId('chips');
    if(!chips) return;

    const tags = allTags();
    chips.innerHTML = '';

    tags.forEach(t => {
      const d = document.createElement('div');
      d.className = 'chip' + (t === ACTIVE_TAG ? ' active' : '');
      d.textContent = t;
      d.addEventListener('click', () => {
        ACTIVE_TAG = (ACTIVE_TAG === t) ? '' : t;
        renderChips();
        renderGenres();
      });
      chips.appendChild(d);
    });

    byId('miniCount').textContent = ACTIVE_TAG ? ('繧ｿ繧ｰ・・ + ACTIVE_TAG) : '繧ｿ繧ｰ・壹↑縺・;
  }

  function matches(site){
    if(ACTIVE_TAG && !(site.tags || []).includes(ACTIVE_TAG)) return false;
    if(!QUERY) return true;
    const q = QUERY.toLowerCase();
    const hay = [
      site.title, site.short, site.slug, site.desc, site.cat,
      ...(site.tags || [])
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function groupByGenre(list){
    const map = new Map();
    for(const s of list){
      const g = inferGenre(s);
      if(!map.has(g)) map.set(g, []);
      map.get(g).push(s);
    }
    // genre sort: Tool/Guide/Rank/Site/Calculator/Other 繧剃ｸ翫↓
    const order = ['Tool','Guide','Rank','Site','Calculator','Video','PDF','Utility','SNS','Other'];
    const entries = [...map.entries()];
    entries.sort((a,b)=>{
      const ai = order.indexOf(a[0]); const bi = order.indexOf(b[0]);
      if(ai !== -1 || bi !== -1){
        if(ai === -1) return 1;
        if(bi === -1) return -1;
        if(ai !== bi) return ai - bi;
      }
      return String(a[0]).localeCompare(String(b[0]), 'ja');
    });
    // sites inside: title sort
    for(const [, arr] of entries){
      arr.sort((x,y)=>String(x.title).localeCompare(String(y.title),'ja'));
    }
    return entries;
  }

  function renderGenres(){
    const wrap = byId('genres');
    if(!wrap) return;

    const filtered = SITES.filter(matches);
    const total = filtered.length;
    byId('countText').textContent = '陦ｨ遉ｺ・・ + total + ' 莉ｶ';

    wrap.innerHTML = '';

    if(total === 0){
      const d = document.createElement('div');
      d.className = 'genreCard';
      d.style.gridColumn = 'span 12';
      d.innerHTML = '<div class="genreHead"><div class="genreName">隧ｲ蠖薙↑縺・/div></div>';
      wrap.appendChild(d);
      return;
    }

    const groups = groupByGenre(filtered);

    for(const [genre, arr] of groups){
      const card = document.createElement('section');
      card.className = 'genreCard';

      const head = document.createElement('div');
      head.className = 'genreHead';
      head.innerHTML =
        '<div class="genreName">' +
          '<span class="genreBadge">繧ｸ繝｣繝ｳ繝ｫ</span>' +
          '<span>' + escapeHtml(genre) + '</span>' +
        '</div>' +
        '<div class="genreCount">' + arr.length + ' 莉ｶ</div>';

      card.appendChild(head);

      arr.forEach(s => {
        const a = document.createElement('a');
        a.className = 'siteBtn';
        a.href = s.href;

        const left =
          '<div>' +
            '<div class="siteTitle">' + escapeHtml(s.short || s.title) + '</div>' +
          '</div>';

        const tags = (s.tags || []).slice(0, 3).map(t => '<span class="pillTag">' + escapeHtml(t) + '</span>').join('');
        const right =
          '<div style="display:flex;gap:10px;align-items:center">' +
            '<div class="siteMeta">' + tags + '</div>' +
            '<div class="arrow">竊・/div>' +
          '</div>';

        a.innerHTML = left + right;
        card.appendChild(a);
      });

      wrap.appendChild(card);
    }
  }

  // 縺贋ｾｿ繧奇ｼ医Γ繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺ｯ荳蛻・・縺輔↑縺・ｼ・  function initMail(){
    const fab = byId('fab');
    const mask = byId('mask');
    const closeBtn = byId('closeBtn');
    const cancelBtn = byId('cancelBtn');
    const sendBtn = byId('sendBtn');
    const note = byId('note');

    const endpoint = (window.__MIKANN_FORM_ENDPOINT__ || '').trim();

    function open(){
      mask.style.display = 'flex';
      byId('message').focus();
    }
    function close(){
      mask.style.display = 'none';
    }

    fab.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    mask.addEventListener('click', (e)=>{ if(e.target === mask) close(); });

    if(!endpoint){
      // 騾∽ｿ｡蜈医′譛ｪ險ｭ螳壹↑繧蔚I縺縺大・縺励※縲梧ｺ門ｙ荳ｭ縲崎｡ｨ遉ｺ
      sendBtn.disabled = true;
      note.textContent = '窶ｻ 縺贋ｾｿ繧頑ｩ溯・縺ｯ貅門ｙ荳ｭ・磯∽ｿ｡蜈医ヵ繧ｩ繝ｼ繝譛ｪ險ｭ螳夲ｼ峨らｮ｡逅・・・縺ｿ險ｭ螳壹〒縺阪∪縺吶・;
      return;
    }

    sendBtn.addEventListener('click', async () => {
      const name = (byId('fromName').value || '').trim();
      const contact = (byId('fromContact').value || '').trim();
      const msg = (byId('message').value || '').trim();

      if(!msg){
        note.textContent = '窶ｻ 蜀・ｮｹ縺檎ｩｺ縺ｧ縺吶・;
        return;
      }

      sendBtn.disabled = true;
      note.textContent = '騾∽ｿ｡荳ｭ窶ｦ';

      try{
        const payload = {
          name, contact, message: msg,
          page: location.href,
          ua: navigator.userAgent
        };

        // 莉｣陦ｨ逧・↑繝輔か繝ｼ繝繧ｵ繝ｼ繝薙せ縺ｯ JSON POST 縺ｧ蜿励￠繧峨ｌ繧具ｼ・ormspree遲会ｼ・        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
          body: JSON.stringify(payload)
        });

        if(!res.ok){
          throw new Error('騾∽ｿ｡縺ｫ螟ｱ謨励＠縺ｾ縺励◆ (HTTP ' + res.status + ')');
        }

        byId('fromName').value = '';
        byId('fromContact').value = '';
        byId('message').value = '';
        note.textContent = '騾∽ｿ｡縺励∪縺励◆縲ゅ≠繧翫′縺ｨ縺・沚・;
      }catch(e){
        note.textContent = '騾∽ｿ｡繧ｨ繝ｩ繝ｼ・・ + (e && e.message ? e.message : String(e));
      }finally{
        sendBtn.disabled = false;
      }
    });
  }

  function setupKeys(){
    const qEl = byId('q');
    qEl.addEventListener('input', () => {
      QUERY = (qEl.value || '').trim();
      renderGenres();
    });
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        QUERY = '';
        ACTIVE_TAG = '';
        qEl.value = '';
        renderChips();
        renderGenres();
      }
    });
  }

  async function boot(){
    try{
      // endpoint 豕ｨ蜈･・・ndex.html蛛ｴ縺ｯ遨ｺ竊単S蛛ｴ縺ｧ蟾ｮ縺玲崛縺茨ｼ・      // 縺薙％縺ｯ蠕後〒遒ｺ螳溘↓荳頑嶌縺阪＆繧後ｋ
      // window.__MIKANN_FORM_ENDPOINT__ 縺ｯ index.html 縺ｮ script 縺ｧ險ｭ螳・      const raw = await loadSites();
      SITES = raw.map(normSite);
      renderChips();
      setupKeys();
      renderGenres();
      initMail();
    }catch(e){
      console.error(e);
      const wrap = byId('genres');
      if(wrap){
        wrap.innerHTML = '<div class="genreCard" style="grid-column:span 12">隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨暦ｼ・ + escapeHtml(e && e.message ? e.message : String(e)) + '</div>';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();