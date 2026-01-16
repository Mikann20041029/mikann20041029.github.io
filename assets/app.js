function qs(s){return document.querySelector(s);}
function renderUnitOptions(cat, sel){
  const u = UNITS[cat].units;
  sel.innerHTML = u.map(x => <option value=""></option>).join("");
}
function initConverterPage(){
  const cat = document.body.dataset.cat;
  const fromSel = qs("#fromUnit");
  const toSel   = qs("#toUnit");
  const valIn   = qs("#val");
  const outEl   = qs("#out");
  renderUnitOptions(cat, fromSel);
  renderUnitOptions(cat, toSel);
  fromSel.value = document.body.dataset.from;
  toSel.value = document.body.dataset.to;

  const doCalc = () => {
    const v = parseFloat(valIn.value);
    if(Number.isNaN(v)){ outEl.textContent = "数値を入力してください"; return; }
    const r = convert(cat, fromSel.value, toSel.value, v);
    if(!Number.isFinite(r)){ outEl.textContent = "変換できません"; return; }
    outEl.textContent = ${v}  ＝  ;
  };
  qs("#swap").addEventListener("click", () => {
    const a = fromSel.value; fromSel.value = toSel.value; toSel.value = a; doCalc();
  });
  [fromSel,toSel,valIn].forEach(el => el.addEventListener("input", doCalc));
  doCalc();
}
document.addEventListener("DOMContentLoaded", () => {
  if(document.body.dataset.page==="convert"){ initConverterPage(); }
});