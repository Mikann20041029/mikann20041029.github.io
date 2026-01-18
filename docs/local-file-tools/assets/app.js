(function(){
  const $ = (id)=>document.getElementById(id);
  const setStatus = (el,msg)=>{ el.textContent = msg || ""; };

  // tabs
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const panels = {
    merge: document.getElementById("tab-merge"),
    heic:  document.getElementById("tab-heic"),
    img:   document.getElementById("tab-img"),
    faq:   document.getElementById("tab-faq")
  };
  tabs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      tabs.forEach(b=>b.classList.remove("is-active"));
      Object.values(panels).forEach(p=>p.classList.remove("is-active"));
      btn.classList.add("is-active");
      panels[btn.dataset.tab].classList.add("is-active");
    });
  });

  const downloadBlob = (blob, filename)=>{
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  };

  const zipAndDownload = async (files, filename)=>{
    const zip = new JSZip();
    files.forEach(f=> zip.file(f.name, f.blob));
    const out = await zip.generateAsync({type:"blob"});
    downloadBlob(out, filename);
  };

  // PDF merge
  $("btnMerge").addEventListener("click", async ()=>{
    const status = $("mergeStatus");
    try{
      const files = Array.from(($("pdfFiles").files || []));
      if(files.length < 2){ setStatus(status, "Pick at least 2 PDFs."); return; }
      setStatus(status, "Merging...");
      const merged = await PDFLib.PDFDocument.create();
      for(const f of files){
        const bytes = await f.arrayBuffer();
        const doc = await PDFLib.PDFDocument.load(bytes);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach(p=> merged.addPage(p));
      }
      const outBytes = await merged.save();
      downloadBlob(new Blob([outBytes], {type:"application/pdf"}), "merged.pdf");
      setStatus(status, "Done.");
    }catch(e){
      console.error(e);
      setStatus(status, "Failed: " + (e && e.message ? e.message : "unknown"));
    }
  });

  // HEIC convert
  $("btnHeic").addEventListener("click", async ()=>{
    const status = $("heicStatus");
    try{
      const files = Array.from(($("heicFiles").files || []));
      if(files.length === 0){ setStatus(status, "Pick HEIC/HEIF files."); return; }
      const outType = $("heicOut").value;
      setStatus(status, "Converting...");
      const out = [];
      let idx = 0;
      for(const f of files){
        idx++;
        setStatus(status, `Converting... ${idx}/${files.length}`);
        const blob = await heic2any({blob:f, toType: outType, quality: 0.92});
        const ext = (outType==="image/png") ? "png" : "jpg";
        const base = f.name.replace(/\.[^/.]+$/, "");
        out.push({name: `${base}.${ext}`, blob: blob});
      }
      await zipAndDownload(out, "heic-converted.zip");
      setStatus(status, "Done.");
    }catch(e){
      console.error(e);
      setStatus(status, "Failed: " + (e && e.message ? e.message : "unknown"));
    }
  });

  // image convert
  $("btnImg").addEventListener("click", async ()=>{
    const status = $("imgStatus");
    try{
      const files = Array.from(($("imgFiles").files || []));
      if(files.length === 0){ setStatus(status, "Pick images."); return; }
      const outType = $("imgOut").value;
      setStatus(status, "Converting...");
      const out = [];
      let idx = 0;

      const toExt = (t)=>{
        if(t==="image/png") return "png";
        if(t==="image/webp") return "webp";
        return "jpg";
      };

      for(const f of files){
        idx++;
        setStatus(status, `Converting... ${idx}/${files.length}`);
        const url = URL.createObjectURL(f);
        const img = new Image();
        await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=url; });
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise((res)=> canvas.toBlob(res, outType, 0.92));
        URL.revokeObjectURL(url);
        const base = f.name.replace(/\.[^/.]+$/, "");
        out.push({name:`${base}.${toExt(outType)}`, blob});
      }
      await zipAndDownload(out, "images-converted.zip");
      setStatus(status, "Done.");
    }catch(e){
      console.error(e);
      setStatus(status, "Failed: " + (e && e.message ? e.message : "unknown"));
    }
  });
})();