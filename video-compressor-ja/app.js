import { FFmpeg } from "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { toBlobURL } from "https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js";
const $=(id)=>document.getElementById(id);
function fmtBytes(b){if(!Number.isFinite(b)||b<=0)return"—";const u=["B","KB","MB","GB","TB"];let i=0,n=b;while(n>=1024&&i<u.length-1){n/=1024;i++;}const dp=(i<=1)?0:2;return`${n.toFixed(dp)} ${u[i]}`;}
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function pickAutoVideoKbps({w,h,fps}){const base=(w*h>=1920*1080)?4500:(w*h>=1280*720)?2500:(w*h>=854*480)?1400:(w*h>=640*360)?900:650;const f=clamp((fps||30)/30,0.5,2.2);return Math.round(base*f);}
function getRes(mw,mh,v){if(v==="keep")return{w:mw,h:mh};const th=parseInt(v,10);if(!Number.isFinite(th)||th<=0)return{w:mw,h:mh};const a=mw/mh;const w=Math.max(2,Math.round(th*a/2)*2);const h=Math.max(2,Math.round(th/2)*2);return{w,h};}
function getFps(mfps,v){if(v==="keep")return mfps;const f=parseInt(v,10);if(!Number.isFinite(f)||f<=0)return mfps;return f;}
async function getVideoMeta(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file);
    const v=document.createElement("video");
    v.preload="metadata";v.muted=true;v.playsInline=true;v.src=url;
    v.onloadedmetadata=()=>{
      const d=v.duration,w=v.videoWidth,h=v.videoHeight;
      const fallback=()=>{URL.revokeObjectURL(url);res({duration:d,width:w,height:h,fps:30});};
      if(typeof v.requestVideoFrameCallback!=="function")return fallback();
      let frames=0;const start=performance.now();const sample=600;
      const cb=(now)=>{frames++; if(now-start<sample){v.requestVideoFrameCallback(cb);}else{const fps=clamp(Math.round(frames*1000/(now-start)),1,240);URL.revokeObjectURL(url);res({duration:d,width:w,height:h,fps});}};
      v.play().then(()=>v.requestVideoFrameCallback(cb)).catch(()=>fallback());
    };
    v.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("Failed to read video metadata."));};
  });
}
function estBytes({dur,vK,aK}){const kb=Math.max(1,(vK||0)+(aK||0));return Math.round(dur*kb*1000/8);}
function settings(meta){
  const r=getRes(meta.width,meta.height,$("resolution").value);
  const fps=getFps(meta.fps,$("fps").value);
  const a=parseInt($("audio").value,10);
  let vK; const mode=$("vbitmode").value;
  if(mode==="auto"){vK=pickAutoVideoKbps({w:r.w,h:r.h,fps});} else {vK=parseInt($("vbit").value,10);}
  vK=clamp(vK,150,50000);
  const crf=clamp(parseInt($("crf").value,10),18,40);
  return{r,fps,vK,a,crf};
}
function refresh(meta,file){
  const s=settings(meta);
  $("metaIn").textContent=`${meta.width}×${meta.height}, ~${meta.fps}fps, ${meta.duration.toFixed(2)}s`;
  $("sizeIn").textContent=fmtBytes(file.size);
  $("sizeEst").textContent=fmtBytes(estBytes({dur:meta.duration,vK:s.vK,aK:s.a}));
  $("videoKbps").textContent=`${s.vK} kbps`;
  $("audioKbps").textContent=`${s.a} kbps`;
  $("targetRes").textContent=`${s.r.w}×${s.r.h}`;
  $("targetFps").textContent=`${Math.round(s.fps)} fps`;
  $("crfVal").textContent=`${s.crf}`;
}
function addLog(t){const el=$("log");el.textContent+=(el.textContent?"\n":"")+t;el.scrollTop=el.scrollHeight;}
async function main(){
  const lang=document.documentElement.dataset.lang||"en";
  const T={en:{loading:"Loading FFmpeg…",ready:"Ready.",choose:"Choose an MP4 first.",running:"Compressing… (runs in your browser)",done:"Done. Download is ready.",failed:"Failed. Lower fps/bitrate or try a smaller file.",memory:"Tip: big videos can fail on mobile (memory)."},
           ja:{loading:"FFmpegを読み込み中…",ready:"準備OK。",choose:"先にMP4を選んでください。",running:"圧縮中…（ブラウザ内で処理）",done:"完了。ダウンロードできます。",failed:"失敗。fps/ビットレートを下げるか動画を小さくして試してください。",memory:"注意：スマホは大きい動画が失敗しやすいです（メモリ）。"}}[lang];
  let file=null, meta=null;
  const sync=()=>{const m=$("vbitmode").value; $("vbit").disabled=(m!=="manual"); $("vbitWrap").style.opacity=(m!=="manual")?"0.6":"1"; if(meta&&file)refresh(meta,file);};
  $("vbitmode").addEventListener("change",sync);
  ["resolution","fps","audio","vbit","crf"].forEach(id=>{$(id).addEventListener("input",()=>{if(meta&&file)refresh(meta,file);});$(id).addEventListener("change",()=>{if(meta&&file)refresh(meta,file);});});
  $("file").addEventListener("change",async(e)=>{
    const f=e.target.files?.[0]; if(!f)return;
    file=f; meta=null; $("download").style.display="none"; $("run").disabled=true; $("progress").value=0; $("pText").textContent="0%"; $("log").textContent="";
    addLog(T.loading);
    try{meta=await getVideoMeta(file);}catch(err){addLog(String(err?.message||err));return;}
    refresh(meta,file); $("run").disabled=false; addLog(T.ready);
  });
  let ff=null, loaded=false;
  async function ensure(){
    if(loaded)return;
    ff=new FFmpeg();
    ff.on("progress",({progress})=>{const p=clamp(Math.round(progress*100),0,100); $("progress").value=p; $("pText").textContent=`${p}%`;});
    const base="https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    const coreURL=await toBlobURL(`${base}/ffmpeg-core.js`,"text/javascript");
    const wasmURL=await toBlobURL(`${base}/ffmpeg-core.wasm`,"application/wasm");
    await ff.load({coreURL, wasmURL});
    loaded=true;
  }
  $("run").addEventListener("click",async()=>{
    if(!file||!meta){addLog(T.choose);return;}
    $("run").disabled=true; $("download").style.display="none"; $("progress").value=0; $("pText").textContent="0%";
    addLog(T.running); addLog(T.memory);
    try{
      await ensure();
      const s=settings(meta);
      const inN="input.mp4", outN="output.mp4";
      try{await ff.deleteFile(inN);}catch{} try{await ff.deleteFile(outN);}catch{}
      await ff.writeFile(inN, new Uint8Array(await file.arrayBuffer()));
      const args=["-i",inN,"-vf",`scale=${s.r.w}:${s.r.h}`];
      if($("fps").value!=="keep"){args.push("-r",String(Math.round(s.fps)));}
      args.push("-c:v","libx264","-preset","veryfast","-b:v",`${s.vK}k`,"-maxrate",`${Math.round(s.vK*1.25)}k`,"-bufsize",`${Math.round(s.vK*2)}k`,"-crf",String(s.crf),"-pix_fmt","yuv420p","-c:a","aac","-b:a",`${s.a}k`,"-movflags","+faststart",outN);
      await ff.exec(args);
      const data=await ff.readFile(outN);
      const blob=new Blob([data.buffer],{type:"video/mp4"});
      const url=URL.createObjectURL(blob);
      $("download").href=url;
      const baseName=file.name.replace(/\.[^.]+$/,"");
      $("download").download=`${baseName}.compressed.mp4`;
      $("download").style.display="inline-flex";
      $("sizeOut").textContent=fmtBytes(blob.size);
      addLog(T.done);
    }catch(err){
      addLog("----"); addLog(T.failed); addLog(String(err?.message||err));
    }finally{
      $("run").disabled=false;
    }
  });
  sync();
}
main();