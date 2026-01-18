const MAIN_URL = "https://mikann20041029.github.io/hub/";
const links = [
    {
        "name":  "Hub (入口)",
        "url":  "https://mikann20041029.github.io/hub/"
    },
    {
        "name":  "Toolbox",
        "url":  "https://mikann20041029.github.io/toolbox/index.html"
    },
    {
        "name":  "Toolbox Calc",
        "url":  "https://mikann20041029.github.io/toolbox/calc.html"
    },
    {
        "name":  "AI Subscription Trouble Guide",
        "url":  "https://mikann20041029.github.io/ai-subscription-trouble-guide/"
    },
    {
        "name":  "SNS Growth Rank",
        "url":  "https://mikann20041029.github.io/sns-growth-rank/"
    }
];

function openUrl(url){
  chrome.tabs.create({ url });
  window.close();
}

document.getElementById("openMain").addEventListener("click", ()=>openUrl(MAIN_URL));
document.addEventListener("keydown", (e)=>{
  if(e.key === "Enter"){ openUrl(MAIN_URL); }
});

const wrap = document.getElementById("links");
for(const item of links){
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.innerHTML = "<span>"+item.name+"</span><span>→</span>";
  btn.addEventListener("click", ()=>openUrl(item.url));
  wrap.appendChild(btn);
}