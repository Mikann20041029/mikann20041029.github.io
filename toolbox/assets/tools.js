/* Toolbox tools catalog (client-only, no tracking) */
window.TOOLBOX_TOOLS = [
  // --- Finance / Money ---
  {
    id:"mortgage", cat:"お金", icon:"🏠",
    name:"住宅ローン（月返済）", desc:"金利・年数から月返済と総返済",
    fields:[
      {k:"principal", l:"借入額（円）", t:"number", v:30000000, step:"1"},
      {k:"rate", l:"年利（%）", t:"number", v:1.2, step:"0.01"},
      {k:"years", l:"返済年数（年）", t:"number", v:35, step:"1"}
    ],
    compute:(v)=>{
      const P=+v.principal, r=(+v.rate/100)/12, n=(+v.years)*12;
      if(r===0){ const m=P/n; return {main:m, sub:`総返済：${fmt(P)}円（利息0円）`, extra:[`月返済：${fmt(m)}円`,`総返済：${fmt(P)}円`]}; }
      const m = P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
      const total = m*n; const interest = total-P;
      return {main:m, sub:`総返済：${fmt(total)}円（利息：${fmt(interest)}円）`, extra:[`月返済：${fmt(m)}円`,`総返済：${fmt(total)}円`,`利息：${fmt(interest)}円`]};
    }
  },
  {
    id:"loan", cat:"お金", icon:"💳",
    name:"ローン（月返済）", desc:"借入・年利・月数 → 月返済",
    fields:[
      {k:"principal", l:"借入額（円）", t:"number", v:500000, step:"1"},
      {k:"rate", l:"年利（%）", t:"number", v:5.0, step:"0.01"},
      {k:"months", l:"返済月数（月）", t:"number", v:36, step:"1"}
    ],
    compute:(v)=>{
      const P=+v.principal, r=(+v.rate/100)/12, n=+v.months;
      if(r===0){ const m=P/n; return {main:m, sub:`総返済：${fmt(P)}円`, extra:[`月返済：${fmt(m)}円`,`総返済：${fmt(P)}円`]}; }
      const m = P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
      const total = m*n; const interest = total-P;
      return {main:m, sub:`総返済：${fmt(total)}円（利息：${fmt(interest)}円）`, extra:[`月返済：${fmt(m)}円`,`総返済：${fmt(total)}円`,`利息：${fmt(interest)}円`]};
    }
  },
  {
    id:"amortization", cat:"お金", icon:"📆",
    name:"返済内訳（簡易）", desc:"1ヶ月目の利息/元金をざっくり",
    fields:[
      {k:"principal", l:"借入額（円）", t:"number", v:3000000, step:"1"},
      {k:"rate", l:"年利（%）", t:"number", v:3.0, step:"0.01"},
      {k:"months", l:"返済月数（月）", t:"number", v:60, step:"1"}
    ],
    compute:(v)=>{
      const P=+v.principal, r=(+v.rate/100)/12, n=+v.months;
      const m = (r===0) ? (P/n) : (P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1));
      const interest1 = P*r;
      const principal1 = m - interest1;
      const remain = P - principal1;
      return {main:m, sub:`1ヶ月目：利息${fmt(interest1)}円 / 元金${fmt(principal1)}円 / 残高${fmt(remain)}円`, extra:[`月返済：${fmt(m)}円`,`利息(1ヶ月目)：${fmt(interest1)}円`,`元金(1ヶ月目)：${fmt(principal1)}円`,`残高(1ヶ月目後)：${fmt(remain)}円`]};
    }
  },
  {
    id:"compound", cat:"お金", icon:"📈",
    name:"複利（積立あり）", desc:"元本＋毎月積立で将来額",
    fields:[
      {k:"principal", l:"元本（円）", t:"number", v:300000, step:"1"},
      {k:"monthly", l:"毎月積立（円）", t:"number", v:30000, step:"1"},
      {k:"rate", l:"年利（%）", t:"number", v:5.0, step:"0.01"},
      {k:"years", l:"期間（年）", t:"number", v:5, step:"1"}
    ],
    compute:(v)=>{
      let P=+v.principal, m=+v.monthly, r=(+v.rate/100)/12, n=(+v.years)*12;
      let fv = P;
      for(let i=0;i<n;i++){ fv = fv*(1+r) + m; }
      const invested = P + m*n;
      const gain = fv - invested;
      return {main:fv, sub:`投下：${fmt(invested)}円 / 増加：${fmt(gain)}円`, extra:[`将来額：${fmt(fv)}円`,`投下：${fmt(invested)}円`,`増加：${fmt(gain)}円`]};
    }
  },
  {
    id:"roi", cat:"お金", icon:"🧮",
    name:"ROI（投資対効果）", desc:"(利益-コスト)/コスト",
    fields:[
      {k:"cost", l:"コスト（円）", t:"number", v:100000, step:"1"},
      {k:"profit", l:"利益（円）", t:"number", v:150000, step:"1"}
    ],
    compute:(v)=>{
      const c=+v.cost, p=+v.profit;
      const roi = (c===0) ? 0 : ((p-c)/c)*100;
      return {main:roi, unit:"%", sub:`純利益：${fmt(p-c)}円`, extra:[`ROI：${roi.toFixed(2)}%`,`純利益：${fmt(p-c)}円`]};
    }
  },
  {
    id:"salary", cat:"お金", icon:"💰",
    name:"年収→月収/時給（概算）", desc:"税は無視のラフ換算",
    fields:[
      {k:"annual", l:"年収（円）", t:"number", v:4500000, step:"1"},
      {k:"hours", l:"月の労働時間（h）", t:"number", v:160, step:"1"}
    ],
    compute:(v)=>{
      const a=+v.annual, h=+v.hours;
      const monthly=a/12;
      const hourly=(h===0)?0:(monthly/h);
      return {main:monthly, sub:`時給目安：${fmt(hourly)}円`, extra:[`月収目安：${fmt(monthly)}円`,`時給目安：${fmt(hourly)}円`]};
    }
  },
  {
    id:"savings-goal", cat:"お金", icon:"🎯",
    name:"貯金ゴール（何ヶ月？）", desc:"目標額を毎月いくらで達成",
    fields:[
      {k:"target", l:"目標（円）", t:"number", v:300000, step:"1"},
      {k:"monthly", l:"毎月の貯金（円）", t:"number", v:30000, step:"1"}
    ],
    compute:(v)=>{
      const t=+v.target, m=+v.monthly;
      const months=(m<=0)?0:Math.ceil(t/m);
      return {main:months, unit:"ヶ月", sub:`合計：${fmt(t)}円 / 毎月：${fmt(m)}円`, extra:[`必要月数：${months}ヶ月`,`毎月：${fmt(m)}円`,`目標：${fmt(t)}円`]};
    }
  },

  // --- Health ---
  {
    id:"bmi", cat:"健康", icon:"🧍",
    name:"BMI", desc:"身長と体重でBMI",
    fields:[
      {k:"height", l:"身長（cm）", t:"number", v:172, step:"0.1"},
      {k:"weight", l:"体重（kg）", t:"number", v:60, step:"0.1"}
    ],
    compute:(v)=>{
      const h=(+v.height)/100, w=+v.weight;
      const bmi=(h<=0)?0:(w/(h*h));
      return {main:bmi, sub:`身長${v.height}cm / 体重${v.weight}kg`, extra:[`BMI：${bmi.toFixed(2)}`]};
    }
  },
  {
    id:"bmr", cat:"健康", icon:"🔥",
    name:"BMR（基礎代謝）", desc:"Mifflin-St Jeor（概算）",
    fields:[
      {k:"sex", l:"性別", t:"select", v:"male", options:[["male","男性"],["female","女性"]]},
      {k:"age", l:"年齢", t:"number", v:21, step:"1"},
      {k:"height", l:"身長（cm）", t:"number", v:172, step:"0.1"},
      {k:"weight", l:"体重（kg）", t:"number", v:60, step:"0.1"}
    ],
    compute:(v)=>{
      const s=v.sex, a=+v.age, h=+v.height, w=+v.weight;
      const base=10*w+6.25*h-5*a + (s==="male"?5:-161);
      return {main:base, unit:"kcal/日", sub:`性別：${s==="male"?"男性":"女性"}`, extra:[`BMR：${Math.round(base)}kcal/日`]};
    }
  },
  {
    id:"tdee", cat:"健康", icon:"⚡",
    name:"消費カロリー（TDEE）", desc:"BMR×活動係数",
    fields:[
      {k:"bmr", l:"BMR（kcal/日）", t:"number", v:1500, step:"1"},
      {k:"activity", l:"活動量", t:"select", v:"1.55", options:[
        ["1.2","低い（ほぼ座り）1.2"],
        ["1.375","軽い（週1-3）1.375"],
        ["1.55","普通（週3-5）1.55"],
        ["1.725","高い（週6-7）1.725"],
        ["1.9","超高い（ハード）1.9"]
      ]}
    ],
    compute:(v)=>{
      const t=(+v.bmr)*(+v.activity);
      return {main:t, unit:"kcal/日", sub:`活動係数：${v.activity}`, extra:[`TDEE：${Math.round(t)}kcal/日`]};
    }
  },
  {
    id:"ideal-weight", cat:"健康", icon:"🎈",
    name:"標準体重（BMI22）", desc:"身長から標準体重",
    fields:[{k:"height", l:"身長（cm）", t:"number", v:172, step:"0.1"}],
    compute:(v)=>{
      const h=(+v.height)/100;
      const w=22*h*h;
      return {main:w, unit:"kg", sub:`BMI22基準`, extra:[`標準体重：${w.toFixed(1)}kg`]};
    }
  },
  {
    id:"bodyfat-usnavy", cat:"健康", icon:"📏",
    name:"体脂肪率（US Navy）", desc:"首/腹/身長（女性は腰も）",
    fields:[
      {k:"sex", l:"性別", t:"select", v:"male", options:[["male","男性"],["female","女性"]]},
      {k:"height", l:"身長（cm）", t:"number", v:172, step:"0.1"},
      {k:"neck", l:"首周り（cm）", t:"number", v:35, step:"0.1"},
      {k:"waist", l:"腹囲（cm）", t:"number", v:78, step:"0.1"},
      {k:"hip", l:"腰囲（cm・女性のみ）", t:"number", v:90, step:"0.1"}
    ],
    compute:(v)=>{
      const sex=v.sex, h=+v.height, n=+v.neck, w=+v.waist, hip=+v.hip;
      // Using cm inputs with log10; classic US Navy formulas use inches; we convert via cm->inch.
      const cm2in = (x)=>x/2.54;
      const H=cm2in(h), N=cm2in(n), W=cm2in(w), HIP=cm2in(hip);
      let bf=0;
      if(sex==="male"){
        bf = 86.010*Math.log10(W-N) - 70.041*Math.log10(H) + 36.76;
      }else{
        bf = 163.205*Math.log10(W+HIP-N) - 97.684*Math.log10(H) - 78.387;
      }
      if(!isFinite(bf)) bf=0;
      return {main:bf, unit:"%", sub:`推定（測定誤差あり）`, extra:[`体脂肪率：${bf.toFixed(1)}%`]};
    }
  },

  // --- Math / Everyday ---
  {
    id:"percentage", cat:"数学", icon:"％",
    name:"パーセント", desc:"基準値×% を計算",
    fields:[
      {k:"base", l:"基準値", t:"number", v:1000, step:"any"},
      {k:"pct", l:"%（パーセント）", t:"number", v:10, step:"any"}
    ],
    compute:(v)=>{
      const ans=(+v.base)*(+v.pct/100);
      return {main:ans, sub:`${v.base}の${v.pct}%`, extra:[`答え：${fmt(ans)}`]};
    }
  },
  {
    id:"percent-change", cat:"数学", icon:"📊",
    name:"増減率", desc:"(新-旧)/旧",
    fields:[
      {k:"old", l:"旧値", t:"number", v:100, step:"any"},
      {k:"now", l:"新値", t:"number", v:130, step:"any"}
    ],
    compute:(v)=>{
      const o=+v.old, n=+v.now;
      const pct=(o===0)?0:((n-o)/o)*100;
      return {main:pct, unit:"%", sub:`差分：${fmt(n-o)}`, extra:[`増減率：${pct.toFixed(2)}%`,`差分：${fmt(n-o)}`]};
    }
  },
  {
    id:"discount", cat:"生活", icon:"🏷️",
    name:"割引後価格", desc:"定価と割引% → 支払額",
    fields:[
      {k:"price", l:"定価（円）", t:"number", v:10000, step:"1"},
      {k:"pct", l:"割引（%）", t:"number", v:20, step:"0.1"}
    ],
    compute:(v)=>{
      const p=+v.price, pct=+v.pct;
      const pay=p*(1-pct/100);
      const off=p-pay;
      return {main:pay, sub:`割引額：${fmt(off)}円`, extra:[`支払：${fmt(pay)}円`,`割引：${fmt(off)}円`]};
    }
  },
  {
    id:"tip", cat:"生活", icon:"🍽️",
    name:"チップ（海外）", desc:"金額×% → チップと合計",
    fields:[
      {k:"bill", l:"会計", t:"number", v:50, step:"0.01"},
      {k:"pct", l:"チップ（%）", t:"number", v:15, step:"0.1"}
    ],
    compute:(v)=>{
      const b=+v.bill, p=+v.pct/100;
      const tip=b*p; const total=b+tip;
      return {main:tip, sub:`合計：${round2(total)}`, extra:[`チップ：${round2(tip)}`,`合計：${round2(total)}`]};
    }
  },
  {
    id:"split-bill", cat:"生活", icon:"🧾",
    name:"割り勘", desc:"合計÷人数（端数調整なし）",
    fields:[
      {k:"total", l:"合計（円）", t:"number", v:12000, step:"1"},
      {k:"people", l:"人数", t:"number", v:4, step:"1"}
    ],
    compute:(v)=>{
      const t=+v.total, p=+v.people;
      const each=(p<=0)?0:(t/p);
      return {main:each, sub:`1人あたり（概算）`, extra:[`1人：${fmt(each)}円`,`合計：${fmt(t)}円`]};
    }
  },
  {
    id:"age", cat:"日付", icon:"🎂",
    name:"年齢", desc:"生年月日→年齢",
    fields:[{k:"birth", l:"生年月日", t:"date", v:"2004-10-29"}],
    compute:(v)=>{
      const b=new Date(v.birth+"T00:00:00");
      const now=new Date();
      let age=now.getFullYear()-b.getFullYear();
      const m=now.getMonth()-b.getMonth();
      if(m<0 || (m===0 && now.getDate()<b.getDate())) age--;
      return {main:age, unit:"歳", sub:`${v.birth}`, extra:[`年齢：${age}歳`]};
    }
  },
  {
    id:"date-diff", cat:"日付", icon:"🗓️",
    name:"日数差", desc:"2つの日付の差",
    fields:[
      {k:"from", l:"開始日", t:"date", v:"2026-01-01"},
      {k:"to", l:"終了日", t:"date", v:"2026-02-01"}
    ],
    compute:(v)=>{
      const a=new Date(v.from+"T00:00:00");
      const b=new Date(v.to+"T00:00:00");
      const diff=Math.round((b-a)/(1000*60*60*24));
      return {main:diff, unit:"日", sub:`${v.from} → ${v.to}`, extra:[`差：${diff}日`]};
    }
  },
  {
    id:"sleep", cat:"健康", icon:"🛌",
    name:"睡眠サイクル（目安）", desc:"90分サイクルで起床候補",
    fields:[
      {k:"bed", l:"就寝時刻", t:"time", v:"23:30"},
      {k:"cycles", l:"サイクル数（3-6）", t:"number", v:5, step:"1"}
    ],
    compute:(v)=>{
      const [hh,mm]=String(v.bed).split(":").map(x=>+x);
      const base=hh*60+mm;
      const c=+v.cycles;
      const mins=base + c*90 + 15; // 入眠15分仮定
      const H=((Math.floor(mins/60))%24+24)%24;
      const M=((mins%60)+60)%60;
      const out=String(H).padStart(2,"0")+":"+String(M).padStart(2,"0");
      return {main:out, sub:`入眠15分＋${c}サイクル`, extra:[`起床目安：${out}`]};
    }
  },

  // --- Travel / Utility ---
  {
    id:"data", cat:"旅", icon:"📶",
    name:"必要GB（旅行/留学）", desc:"日数×1日使用量",
    fields:[
      {k:"days", l:"日数", t:"number", v:30, step:"1"},
      {k:"perday", l:"1日（GB）", t:"number", v:2, step:"0.1"}
    ],
    compute:(v)=>{
      const g=(+v.days)*(+v.perday);
      return {main:g, unit:"GB", sub:`${v.days}日 × ${v.perday}GB`, extra:[`合計：${g.toFixed(1)}GB`]};
    }
  },
  {
    id:"fuel", cat:"旅", icon:"⛽",
    name:"車の燃料代", desc:"距離・燃費・単価から概算",
    fields:[
      {k:"km", l:"距離（km）", t:"number", v:200, step:"0.1"},
      {k:"kpl", l:"燃費（km/L）", t:"number", v:15, step:"0.1"},
      {k:"yen", l:"単価（円/L）", t:"number", v:170, step:"1"}
    ],
    compute:(v)=>{
      const km=+v.km, kpl=+v.kpl, yen=+v.yen;
      const L=(kpl<=0)?0:(km/kpl);
      const cost=L*yen;
      return {main:cost, sub:`必要燃料：${L.toFixed(2)}L`, extra:[`燃料：${L.toFixed(2)}L`,`費用：${fmt(cost)}円`]};
    }
  },

  // --- Study ---
  {
    id:"gpa", cat:"学業", icon:"🎓",
    name:"GPA（簡易）", desc:"(合計GP)/(合計単位)",
    fields:[
      {k:"gp", l:"合計GP（例: A=4等で計算済み）", t:"number", v:48, step:"0.01"},
      {k:"credits", l:"合計単位", t:"number", v:16, step:"0.5"}
    ],
    compute:(v)=>{
      const g=+v.gp, c=+v.credits;
      const ans=(c<=0)?0:(g/c);
      return {main:ans, sub:`GP${g} / 単位${c}`, extra:[`GPA：${ans.toFixed(3)}`]};
    }
  },

  // --- Creator / Ads ---
  {
    id:"ads", cat:"副業", icon:"🟣",
    name:"広告収益（PV×RPM）", desc:"RPM=1000PVあたり円",
    fields:[
      {k:"pv", l:"月PV", t:"number", v:30000, step:"1"},
      {k:"rpm", l:"RPM（円/1000PV）", t:"number", v:200, step:"1"}
    ],
    compute:(v)=>{
      const pv=+v.pv, rpm=+v.rpm;
      const rev=(pv/1000)*rpm;
      return {main:rev, sub:`式：${pv}/1000×${rpm}`, extra:[`推定：${fmt(rev)}円/月`]};
    }
  },
  {
    id:"engagement", cat:"副業", icon:"📣",
    name:"エンゲージ率", desc:"(いいね+コメ)/フォロワー",
    fields:[
      {k:"likes", l:"いいね", t:"number", v:500, step:"1"},
      {k:"comments", l:"コメント", t:"number", v:40, step:"1"},
      {k:"followers", l:"フォロワー", t:"number", v:10000, step:"1"}
    ],
    compute:(v)=>{
      const e=(+v.likes)+(+v.comments);
      const f=+v.followers;
      const pct=(f<=0)?0:(e/f*100);
      return {main:pct, unit:"%", sub:`合計反応：${fmt(e)}`, extra:[`ER：${pct.toFixed(2)}%`,`反応：${fmt(e)}`]};
    }
  }
];

function fmt(x){
  const n = (typeof x==="number") ? x : Number(x);
  if(!isFinite(n)) return "0";
  return Math.round(n).toLocaleString("ja-JP");
}
function round2(x){
  const n=(typeof x==="number")?x:Number(x);
  if(!isFinite(n)) return "0";
  return (Math.round(n*100)/100).toLocaleString("ja-JP");
}
