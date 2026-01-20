(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function dbg(msg, isErr=false){
    const d = byId('dbg');
    if(!d) return;
    d.textContent = msg;
    d.classList.toggle('err', !!isErr);
  }

  async function loadSites(){
    const url = new URL('assets/sites.json', location.href);
    url.searchParams.set('cb', String(Date.now())); // cache bust
    const res = await fetch(url.href, { cache:'no-store' });
    if(!res.ok) throw new Error('sites.json HTTP ' + res.status);
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
    const cat  = (s.cat || s.category || '').trim();

    // “ボタンに出す短いタイトル（できるだけ1ワード）”
    let short = (s.short || '').trim();
    if(!short){
      short = String(title).split(/[|｜:：—–\-]/)[0].trim();
      short = short.split(/\s+/)[0].trim(); // まず1ワードに寄せる
    }
    if(short.length > 18) short = short.slice(0, 18) + '…';

    return { title, short, slug, href, tags, desc, cat };
  }

  function inferGenre(site){
    if(site.cat) return site.cat;

    const tset = new Set((site.tags || []).map(t => String(t).toLowerCase()));
    const pick = (arr) => arr.find(x => tset.has(x));
    const hit = pick(['tool','tools','guide','rank','site','utility','calc','calculator','video','image','pdf','sns']);
    if(hit){
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
      return map[hit] || hit;
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

    byId('miniCount').textContent = ACTIVE_TAG ? ('タグ：' + ACTIVE_TAG) : 'タグ：なし';
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
    for(const [, arr] of entries){
      arr.sort((x,y)=>String(x.title).localeCompare(String(y.title),'ja'));
    }
    return entries;
  }

  function renderGenres(){
    const wrap = byId('genres');
    if(!wrap) return;

    const filtered = SITES.filter(matches);
    byId('countText').textContent = '表示：' + filtered.length + ' 件';

    wrap.innerHTML = '';

    if(filtered.length === 0){
      const box = document.createElement('div');
      box.className = 'genreBox';
      box.style.gridColumn = '1 / -1';
      box.innerHTML = `
        <div class="genreTop">
          <div class="genreLabel"><span class="genrePill">ジャンル</span><span>該当なし</span></div>
          <div class="genreCount">0 件</div>
        </div>
      `;
      wrap.appendChild(box);
      return;
    }

    const groups = groupByGenre(filtered);

    for(const [genre, arr] of groups){
      const box = document.createElement('section');
      box.className = 'genreBox';

      const top = document.createElement('div');
      top.className = 'genreTop';
      top.innerHTML = `
        <div class="genreLabel">
          <span class="genrePill">ジャンル</span>
          <span>${escapeHtml(genre)}</span>
        </div>
        <div class="genreCount">${arr.length} 件</div>
      `;
      box.appendChild(top);

      arr.forEach(s => {
        const a = document.createElement('a');
        a.className = 'siteBtn';
        a.href = s.href;

        const tags = (s.tags || []).slice(0, 2).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
        a.innerHTML = `
          <div class="siteTitle">${escapeHtml(s.short || s.title)}</div>
          <div style="display:flex; gap:10px; align-items:center">
            <div class="siteTags">${tags}</div>
            <div class="arrow">→</div>
          </div>
        `;
        box.appendChild(a);
      });

      wrap.appendChild(box);
    }
  }

  function initMail(){
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
      sendBtn.disabled = true;
      note.textContent = '※ お便り機能は準備中（送信先フォーム未設定）。管理者のみ設定できます。';
      return;
    }

    sendBtn.addEventListener('click', async () => {
      const name = (byId('fromName').value || '').trim();
      const contact = (byId('fromContact').value || '').trim();
      const msg = (byId('message').value || '').trim();

      if(!msg){
        note.textContent = '※ 内容が空です。';
        return;
      }

      sendBtn.disabled = true;
      note.textContent = '送信中…';

      try{
        const payload = { name, contact, message: msg, page: location.href, ua: navigator.userAgent };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
          body: JSON.stringify(payload)
        });
        if(!res.ok) throw new Error('送信に失敗 (HTTP ' + res.status + ')');

        byId('fromName').value = '';
        byId('fromContact').value = '';
        byId('message').value = '';
        note.textContent = '送信しました。ありがとう🍊';
      }catch(e){
        note.textContent = '送信エラー：' + (e && e.message ? e.message : String(e));
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
      dbg('hub: sites.json loading…');
      const raw = await loadSites();
      SITES = raw.map(normSite);
      renderChips();
      setupKeys();
      renderGenres();
      initMail();
      dbg('hub: OK (' + SITES.length + ' sites)');
    }catch(e){
      console.error(e);
      dbg('hub: ERROR ' + (e && e.message ? e.message : String(e)), true);
      const wrap = byId('genres');
      if(wrap){
        wrap.innerHTML = `
          <div class="genreBox" style="grid-column:1/-1">
            <div class="genreTop">
              <div class="genreLabel"><span class="genrePill">エラー</span><span>読み込み失敗</span></div>
              <div class="genreCount">—</div>
            </div>
            <div style="font-size:12px; color:#b91c1c; padding:8px 2px;">
              ${escapeHtml(e && e.message ? e.message : String(e))}
            </div>
          </div>
        `;
      }
    }
  }

  // ★確実に起動（DOMContentLoadedが取りこぼされても動く）
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  }else{
    boot();
  }
})();