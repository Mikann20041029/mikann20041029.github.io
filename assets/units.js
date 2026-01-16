const UNITS = {
  length: { label: "長さ", units: [
    {k:"mm", n:"ミリメートル (mm)", f:0.001},
    {k:"cm", n:"センチメートル (cm)", f:0.01},
    {k:"m",  n:"メートル (m)", f:1},
    {k:"km", n:"キロメートル (km)", f:1000},
    {k:"in", n:"インチ (in)", f:0.0254},
    {k:"ft", n:"フィート (ft)", f:0.3048},
    {k:"yd", n:"ヤード (yd)", f:0.9144},
    {k:"mi", n:"マイル (mi)", f:1609.344},
    {k:"nmi",n:"海里 (nmi)", f:1852}
  ]},
  mass: { label: "重さ", units: [
    {k:"mg", n:"ミリグラム (mg)", f:0.000001},
    {k:"g",  n:"グラム (g)", f:0.001},
    {k:"kg", n:"キログラム (kg)", f:1},
    {k:"t",  n:"トン (t)", f:1000},
    {k:"oz", n:"オンス (oz)", f:0.028349523125},
    {k:"lb", n:"ポンド (lb)", f:0.45359237},
    {k:"st", n:"ストーン (st)", f:6.35029318}
  ]},
  volume: { label: "体積", units: [
    {k:"ml", n:"ミリリットル (mL)", f:0.000001},
    {k:"l",  n:"リットル (L)", f:0.001},
    {k:"m3", n:"立方メートル (m³)", f:1},
    {k:"tsp",n:"小さじ (tsp)", f:0.00000492892159375},
    {k:"tbsp",n:"大さじ (tbsp)", f:0.00001478676478125},
    {k:"cup",n:"カップ (US cup)", f:0.0002365882365},
    {k:"pt", n:"パイント (US pt)", f:0.000473176473},
    {k:"qt", n:"クォート (US qt)", f:0.000946352946},
    {k:"gal",n:"ガロン (US gal)", f:0.003785411784}
  ]},
  speed: { label: "速度", units: [
    {k:"mps", n:"m/s", f:1},
    {k:"kmh", n:"km/h", f:(1000/3600)},
    {k:"mph", n:"mph", f:0.44704},
    {k:"knot",n:"ノット", f:0.514444}
  ]},
  pressure: { label: "圧力", units: [
    {k:"pa",  n:"パスカル (Pa)", f:1},
    {k:"kpa", n:"キロパスカル (kPa)", f:1000},
    {k:"mpa", n:"メガパスカル (MPa)", f:1000000},
    {k:"bar", n:"バール (bar)", f:100000},
    {k:"atm", n:"気圧 (atm)", f:101325},
    {k:"psi", n:"psi", f:6894.757293168}
  ]}
};
function getUnit(cat, key){ return UNITS[cat].units.find(u => u.k===key); }
function convert(cat, fromK, toK, val){
  const from = getUnit(cat, fromK);
  const to = getUnit(cat, toK);
  if(!from || !to) return NaN;
  const base = val * from.f;
  return base / to.f;
}