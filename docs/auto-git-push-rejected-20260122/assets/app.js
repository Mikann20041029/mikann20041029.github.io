(async function(){
  const $ = (sel)=>document.querySelector(sel);

  async function loadData(){
    const res = await fetch("assets/data.json?cb="+Date.now(), {cache:"no-store"});
    if(!res.ok) throw new Error("data.json load failed: "+res.status);
    return await res.json();
  }

  function setText(el, text){ if(el) el.textContent = text ?? ""; }

  function renderList(el, items){
    if(!el) return;
    el.innerHTML = "";
    (items||[]).forEach(it=>{
      const li = document.createElement("li");
      li.textContent = it;
      el.appendChild(li);
    });
  }

  function renderRefs(el, refs){
    if(!el) return;
    el.innerHTML = "";
    (refs||[]).forEach(r=>{
      const p = document.createElement("p");
      p.className="note";
      const a = document.createElement("a");
      a.href = r.url;
      a.target="_blank";
      a.rel="noopener noreferrer";
      a.textContent = r.title ? `${r.title} — ${r.url}` : r.url;
      p.appendChild(a);
      el.appendChild(p);
    });
  }

  // Small real tool: image resize/compress + ffmpeg command generator
  function setupTools(topic){
    // Image tool
    const file = $("#imgFile");
    const q = $("#imgQuality");
    const w = $("#imgWidth");
    const btn = $("#imgGo");
    const out = $("#imgOut");

    async function compressImage(){
      if(!file.files || !file.files[0]){ out.textContent="画像ファイルを選んでください。"; return; }
      const f = file.files[0];
      const quality = Math.max(0.1, Math.min(0.95, parseFloat(q.value||"0.82")));
      const maxW = Math.max(64, Math.min(4096, parseInt(w.value||"1600",10)));

      const img = new Image();
      img.decoding="async";
      const url = URL.createObjectURL(f);
      img.src = url;
      await img.decode();

      const scale = Math.min(1, maxW / img.width);
      const cw = Math.round(img.width * scale);
      const ch = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (f.name.replace(/\.[^.]+$/,"") || "image") + `-compressed-q${Math.round(quality*100)}.jpg`;
      a.textContent = `ダウンロード: ${a.download}（${Math.round(blob.size/1024)} KB）`;
      a.onclick = ()=>setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
      out.innerHTML="";
      out.appendChild(a);
    }
    if(btn) btn.addEventListener("click", compressImage);

    // ffmpeg command helper (for mp4 etc.)
    const inName = $("#ffIn");
    const preset = $("#ffPreset");
    const crf = $("#ffCrf");
    const cmd = $("#ffCmd");
    function updateCmd(){
      const input = (inName.value||"input.mp4").trim();
      const pre = (preset.value||"medium").trim();
      const c = Math.max(18, Math.min(40, parseInt(crf.value||"28",10)));
      const outName = input.replace(/\.[^.]+$/,"") + `-crf${c}.mp4`;
      const s = `ffmpeg -i "${input}" -c:v libx264 -preset ${pre} -crf ${c} -c:a aac -b:a 128k "${outName}"`;
      cmd.textContent = s;
    }
    ["input","change"].forEach(ev=>{
      if(inName) inName.addEventListener(ev, updateCmd);
      if(preset) preset.addEventListener(ev, updateCmd);
      if(crf) crf.addEventListener(ev, updateCmd);
    });
    updateCmd();
  }

  try{
    const data = await loadData();
    document.title = data.title || data.slug || "site";
    setText($("#title"), data.title || data.slug);
    setText($("#desc"), data.desc || "");
    setText($("#badge"), data.badge || "まとめて解決");
    const tags = $("#tags"); if(tags){
      tags.innerHTML="";
      (data.tags||[]).slice(0,8).forEach(t=>{
        const s=document.createElement("span");
        s.className="tag";
        s.textContent=t;
        tags.appendChild(s);
      });
    }

    renderList($("#problems"), data.problem_summaries);
    renderList($("#conclusion"), data.conclusion_steps);
    renderList($("#causes"), data.cause_patterns);
    renderList($("#steps"), data.checklist_steps);
    renderList($("#fails"), data.common_mistakes);
    renderList($("#alts"), data.fallbacks);
    renderList($("#faqs"), (data.faqs||[]).map(x=>`${x.q}：${x.a}`));
    renderRefs($("#refs"), data.refs);

    setupTools(data.topic || "");

    // AdSense script is included in HTML head (no heavy ads above content).
  }catch(e){
    const err = document.createElement("pre");
    err.className="mono";
    err.textContent = "ERROR: " + (e && e.message ? e.message : String(e));
    document.body.prepend(err);
  }
})();