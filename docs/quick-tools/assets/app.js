(function(){
  const $ = (id)=>document.getElementById(id);

  function num(v){
    const n = Number(String(v||"").replace(/,/g,""));
    return Number.isFinite(n) ? n : null;
  }

  pctBtn.addEventListener("click", ()=>{
    const v = num(pctValue.value);
    const r = num(pctRate.value);
    if(v===null || r===null){ pctOut.textContent = "Enter valid numbers."; return; }
    const res = v * (r/100);
    pctOut.textContent = ${r}% of  = ;
  });

  uBtn.addEventListener("click", ()=>{
    const v = num(uVal.value);
    if(v===null){ uOut.textContent="Enter a valid number."; return; }
    const t = uType.value;
    let a,b;
    if(t==="km_mi"){ a = ${v} km =  miles; b = ${v} miles =  km; }
    if(t==="kg_lb"){ a = ${v} kg =  lb; b = ${v} lb =  kg; }
    if(t==="c_f"){ a = ${v} °C =  °F; b = ${v} °F =  °C; }
    uOut.textContent = a + "  |  " + b;
  });

  dBtn.addEventListener("click", ()=>{
    const d1 = d1.value ? new Date(d1.value) : null;
    const d2 = d2.value ? new Date(d2.value) : null;
    if(!d1 || !d2){ dOut.textContent="Pick two dates."; return; }
    const ms = d2.getTime() - d1.getTime();
    const days = Math.round(ms / 86400000);
    dOut.textContent = Difference:  day(s);
  });

  // meta
  const now = new Date();
  year.textContent = String(now.getFullYear());
  lastUpdated.textContent = now.toISOString().slice(0,10);
})();