const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function toast(msg){
  const t = $('#toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1400);
}

function renderTable(rows){
  const tbody = $('#routesBody');
  if(!tbody) return;
  tbody.innerHTML = '';
  for(const r of rows){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${r.route}</b><br><small>${r.hint}</small></td>
      <td>${r.cancel}</td>
      <td>${r.refund}</td>
      <td>${r.notes.map(x=>`<div>• ${x}</div>`).join('')}</td>
    `;
    tbody.appendChild(tr);
  }
}

function fillTemplates(tpls){
  if($('#tpl_ja')) $('#tpl_ja').value = tpls.jp || '';
  if($('#tpl_en')) $('#tpl_en').value = tpls.en || '';
  if($('#tpl_short')) $('#tpl_short').value = tpls.short || '';
}

function bindCopy(){
  $$('.btn[data-copy]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-copy');
      const ta = document.getElementById(id);
      if(!ta) return;
      ta.select();
      try{
        document.execCommand('copy');
        toast('copied');
      }catch(e){
        toast('copy failed');
      }
    });
  });
}

async function main(){
  const res = await fetch('./assets/data.json', {cache:'no-store'});
  const data = await res.json();

  if($('#updated')) $('#updated').textContent = data.updated || '';
  renderTable(data.routes || []);
  fillTemplates(data.templates || {});
  bindCopy();

  const input = $('#filter');
  if(input){
    input.addEventListener('input', ()=>{
      const q = input.value.trim().toLowerCase();
      if(!q){ renderTable(data.routes || []); return; }
      const rows = (data.routes || []).filter(r=>{
        const blob = (r.route+' '+r.hint+' '+r.cancel+' '+r.refund+' '+(r.notes||[]).join(' ')).toLowerCase();
        return blob.includes(q);
      });
      renderTable(rows);
    });
  }

  $$('.aff-slot').forEach(div=>{
    const slot = div.dataset.slot || '';
    div.innerHTML = `<div class="muted">slot: <span class="kbd">${slot}</span>（ここにA8の広告HTMLを貼る）</div>`;
  });
}

main().catch(()=>{});