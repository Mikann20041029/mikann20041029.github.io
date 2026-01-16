export function n(x){
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  return Number(x).toLocaleString("ja-JP");
}
export function yen(x){
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  return "¥" + Number(x).toLocaleString("ja-JP");
}
export function pct(x){
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  return (Number(x)*100).toFixed(2) + "%";
}
