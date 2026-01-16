const UNITS={
 length:{label:"長さ",units:[{k:"mm",n:"mm",f:0.001},{k:"cm",n:"cm",f:0.01},{k:"m",n:"m",f:1},{k:"km",n:"km",f:1000},{k:"in",n:"in",f:0.0254},{k:"ft",n:"ft",f:0.3048},{k:"yd",n:"yd",f:0.9144},{k:"mi",n:"mi",f:1609.344}]},
 mass:{label:"重さ",units:[{k:"g",n:"g",f:0.001},{k:"kg",n:"kg",f:1},{k:"lb",n:"lb",f:0.45359237},{k:"oz",n:"oz",f:0.028349523125}]}
};
function getUnit(cat,key){return UNITS[cat].units.find(u=>u.k===key);}
function convert(cat,fromK,toK,val){const from=getUnit(cat,fromK),to=getUnit(cat,toK);if(!from||!to)return NaN;return (val*from.f)/to.f;}
