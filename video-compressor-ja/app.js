import { FFmpeg } from "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { toBlobURL } from "https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js";

const $ = (id)=>document.getElementById(id);

function fmtBytes(bytes){
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B","KB","MB","GB","TB"];
  let i=0, n=bytes;
  while (n>=1024 && i<units.length-1){ n/=1024; i++; }
  const dp = (i<=1)?0:2;
  return `${n.toFixed(dp)} ${units[i]}`;
}
function clamp(n,min,max){ return Math.min(max, Math.max(min, n)); }

function pickAutoVideoKbps({w,h,fps}){
  // ざっくりの目安（過剰に攻めすぎない）
  const baseByRes = (w*h >= 1920*1080) ? 4500
                 : (w*h >= 1280*720 ) ? 2500
                 : (w*h >= 854*480  ) ? 1400
                 : (w*h >= 640*360  ) ? 900
                 : 650;
  // FPSが高いほどビットレート上げ、低いほど下げ
  const fpsFactor = clamp((fps||30)/30, 0.5, 2.2);
  return Math.round(baseByRes * fpsFactor);
}

function getSelectedResolution(metaW, metaH, v){
  if (v === "keep") return { w: metaW, h: metaH, keep:true };
  const targetH = parseInt(v,10);
  if (!Number.isFinite(targetH) || targetH<=0) return { w: metaW, h: metaH, keep:true };
  const aspect = metaW / metaH;
  const w = Math.max(2, Math.round(targetH * aspect / 2) * 2);
  const h = Math.max(2, Math.round(targetH / 2) * 2);
  return { w, h, keep:false };
}

function getSelectedFps(metaFps, v){
  if (v === "keep") return { fps: metaFps, keep:true };
  const fps = parseInt(v,10);
  if (!Number.isFinite(fps) || fps<=0) return { fps: metaFps, keep:true };
  return { fps, keep:false };
}

async function getVideoMeta(file){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;

      // FPS推定：requestVideoFrameCallbackがあれば使う（なければ30で妥協）
      const fallback = ()=> {
        URL.revokeObjectURL(url);
        resolve({duration, width, height, fps: 30});
      };

      if (typeof video.requestVideoFrameCallback !== "function") return fallback();

      let frames = 0;
      const start = performance.now();
      const sampleMs = 600;

      const cb = (now)=>{
        frames++;
        if (now - start < sampleMs){
          video.requestVideoFrameCallback(cb);
        } else {
          const fps = clamp(Math.round(frames * 1000 / (now - start)), 1, 240);
          URL.revokeObjectURL(url);
          resolve({duration, width, height, fps});
        }
      };

      video.play().then(()=>{
        video.requestVideoFrameCallback(cb);
      }).catch(()=>fallback());
    };
    video.onerror = ()=> {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read video metadata."));
    };
  });
}

function estimateSizeBytes({durationSec, vKbps, aKbps}){
  // size ≈ duration * (video + audio) / 8
  const totalKbps = Math.max(1, (vKbps||0) + (aKbps||0));
  return Math.round(durationSec * totalKbps * 1000 / 8);
}

function deriveSettingsFromUI(meta){
  const res = getSelectedResolution(meta.width, meta.height, $("resolution").value);
  const fpsSel = getSelectedFps(meta.fps, $("fps").value);

  const audioKbps = parseInt($("audio").value,10);

  let videoKbps;
  const vMode = $("vbitmode").value;
  if (vMode === "auto"){
    videoKbps = pickAutoVideoKbps({w: res.w, h: res.h, fps: fpsSel.fps});
  } else {
    videoKbps = parseInt($("vbit").value,10);
  }

  videoKbps = clamp(videoKbps, 150, 50000);

  const crf = clamp(parseInt($("crf").value,10), 18, 40);

  return { res, fpsSel, videoKbps, audioKbps, crf };
}

function refreshEstimate(meta, file){
  const s = deriveSettingsFromUI(meta);
  const outBytes = estimateSizeBytes({ durationSec: meta.duration, vKbps: s.videoKbps, aKbps: s.audioKbps });
  $("metaIn").textContent = `${meta.width}×${meta.height}, ~${meta.fps}fps, ${meta.duration.toFixed(2)}s`;
  $("sizeIn").textContent = fmtBytes(file.size);
  $("sizeEst").textContent = fmtBytes(outBytes);

  $("videoKbps").textContent = `${s.videoKbps} kbps`;
  $("audioKbps").textContent = `${s.audioKbps} kbps`;
  $("targetRes").textContent = `${s.res.w}×${s.res.h}${s.res.keep ? "" : ""}`;
  $("targetFps").textContent = `${Math.round(s.fpsSel.fps)}${s.fpsSel.keep ? "" : ""} fps`;
  $("crfVal").textContent = `${s.crf}`;
}

function setLog(line){
  const el = $("log");
  el.textContent = line;
  el.scrollTop = el.scrollHeight;
}
function appendLog(line){
  const el = $("log");
  el.textContent += (el.textContent ? "\n" : "") + line;
  el.scrollTop = el.scrollHeight;
}

async function main(){
  const lang = document.documentElement.dataset.lang || "en";
  const T = {
    en: {
      loading:"Loading video engine (FFmpeg)…",
      ready:"Ready.",
      choose:"Choose an MP4 first.",
      running:"Compressing… (this runs in your browser)",
      done:"Done. Download is ready.",
      failed:"Failed. Try smaller settings (lower fps / lower bitrate) or a smaller file.",
      memory:"Tip: Big videos can crash on mobile due to memory limits."
    },
    ja: {
      loading:"動画エンジン(FFmpeg)を読み込み中…",
      ready:"準備OK。",
      choose:"先にMP4を選んでください。",
      running:"圧縮中…（ブラウザ内で処理します）",
      done:"完了。ダウンロードできます。",
      failed:"失敗。fps/ビットレートを下げるか、動画を小さくして試してください。",
      memory:"注意：スマホだと大きい動画はメモリ不足で落ちることがあります。"
    }
  }[lang];

  let file = null;
  let meta = null;

  // UI: bitrate mode
  const syncVbitUi = ()=>{
    const mode = $("vbitmode").value;
    $("vbit").disabled = (mode !== "manual");
    $("vbitWrap").style.opacity = (mode !== "manual") ? "0.6" : "1";
    if (meta && file) refreshEstimate(meta, file);
  };
  $("vbitmode").addEventListener("change", syncVbitUi);

  // controls change -> update estimate
  ["resolution","fps","audio","vbit","crf"].forEach(id=>{
    $(id).addEventListener("input", ()=>{ if(meta && file) refreshEstimate(meta, file); });
    $(id).addEventListener("change", ()=>{ if(meta && file) refreshEstimate(meta, file); });
  });

  // file select
  $("file").addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;
    file = f;
    $("download").style.display = "none";
    $("run").disabled = true;
    $("progress").value = 0;
    setLog("");

    appendLog(T.loading);
    try{
      meta = await getVideoMeta(file);
    }catch(err){
      meta = null;
      appendLog(String(err?.message || err));
      return;
    }
    refreshEstimate(meta, file);
    $("run").disabled = false;
    appendLog(T.ready);
  });

  // ffmpeg init (lazy)
  let ffmpeg = null;
  let ffmpegLoaded = false;

  async function ensureFfmpeg(){
    if (ffmpegLoaded) return;
    ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      // 昔のログが多すぎるので程よく
      if (message?.toLowerCase?.().includes("error")) appendLog("ERR: " + message);
    });
    ffmpeg.on("progress", ({ progress })=>{
      const p = clamp(Math.round(progress * 100), 0, 100);
      $("progress").value = p;
      $("pText").textContent = `${p}%`;
    });

    const coreBase = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    const coreURL = await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm");

    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegLoaded = true;
  }

  async function compress(){
    if (!file || !meta){
      appendLog(T.choose);
      return;
    }

    $("run").disabled = true;
    $("download").style.display = "none";
    $("progress").value = 0;
    $("pText").textContent = "0%";
    appendLog(T.running);
    appendLog(T.memory);

    try{
      await ensureFfmpeg();

      const s = deriveSettingsFromUI(meta);
      const inName = "input.mp4";
      const outName = "output.mp4";

      // clean any previous files
      try{ await ffmpeg.deleteFile(inName); }catch{}
      try{ await ffmpeg.deleteFile(outName); }catch{}

      await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()));

      const args = [];
      args.push("-i", inName);

      // video
      const scale = `scale=${s.res.w}:${s.res.h}`;
      args.push("-vf", scale);

      if (!$("fps").value || $("fps").value !== "keep"){
        args.push("-r", String(Math.round(s.fpsSel.fps)));
      }

      // codec + quality
      args.push("-c:v", "libx264");
      args.push("-preset", "veryfast");
      // bitrate + CRF (両方指定：ざっくり上限＆品質調整)
      args.push("-b:v", `${s.videoKbps}k`);
      args.push("-maxrate", `${Math.round(s.videoKbps*1.25)}k`);
      args.push("-bufsize", `${Math.round(s.videoKbps*2)}k`);
      args.push("-crf", String(s.crf));
      args.push("-pix_fmt", "yuv420p");

      // audio
      args.push("-c:a", "aac");
      args.push("-b:a", `${s.audioKbps}k`);

      // fast start for web
      args.push("-movflags", "+faststart");

      args.push(outName);

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);

      $("download").href = url;
      const base = file.name.replace(/\.[^.]+$/, "");
      $("download").download = `${base}.compressed.mp4`;
      $("download").style.display = "inline-flex";
      $("sizeOut").textContent = fmtBytes(blob.size);

      appendLog(T.done);
    }catch(err){
      appendLog("----");
      appendLog(T.failed);
      appendLog(String(err?.message || err));
    }finally{
      $("run").disabled = false;
    }
  }

  $("run").addEventListener("click", compress);

  // initial
  syncVbitUi();
}
main();