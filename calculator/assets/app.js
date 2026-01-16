function qs(s){return document.querySelector(s);}
function renderUnitOptions(cat,sel){const u=UNITS[cat].units;sel.innerHTML=u.map(x=>`<option value="${x.k}">${x.n}</option>`).join("");}
function init(){const cat=document.body.dataset.cat;const fromSel=qs("#fromUnit");const toSel=qs("#toUnit");const valIn=qs("#val");const outEl=qs("#out");
renderUnitOptions(cat,fromSel);renderUnitOptions(cat,toSel);
fromSel.value=document.body.dataset.from;toSel.value=document.body.dataset.to;
const calc=()=>{const v=parseFloat(valIn.value);if(Number.isNaN(v)){outEl.textContent="数値を入力";return;}
const r=convert(cat,fromSel.value,toSel.value,v);outEl.textContent=`${v} ${fromSel.value} = ${r} ${toSel.value}`;};
qs("#swap").addEventListener("click",()=>{const a=fromSel.value;fromSel.value=toSel.value;toSel.value=a;calc();});
[fromSel,toSel,valIn].forEach(el=>el.addEventListener("input",calc));calc();}
document.addEventListener("DOMContentLoaded",()=>{if(document.body.dataset.page==="convert")init();});
