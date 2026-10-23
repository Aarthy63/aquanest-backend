import { CATEGORY_COVER, uniqueProductImage } from "./productImages.js";

export const categories = [
  { id: "purifiers", name: "Water Purifiers", short: "Purifiers", image: CATEGORY_COVER.purifiers },
  { id: "dispensers", name: "Water Dispensers", short: "Dispensers", image: CATEGORY_COVER.dispensers },
  { id: "pumps", name: "Booster Pumps", short: "Pumps", image: CATEGORY_COVER.pumps },
  { id: "filters", name: "Filters & Cartridges", short: "Filters", image: CATEGORY_COVER.filters },
  { id: "membranes", name: "RO Membranes", short: "Membranes", image: CATEGORY_COVER.membranes },
  { id: "spare-parts", name: "Spare Parts", short: "Spares", image: CATEGORY_COVER["spare-parts"] },
];

const warrantyFor = {
  purifiers: "1 year comprehensive + 2 years on RO membrane",
  dispensers: "1 year on product, 3 years on compressor",
  pumps: "1 year manufacturer warranty",
  filters: "6 months against manufacturing defects",
  membranes: "6 months against manufacturing defects",
  "spare-parts": "6 months replacement warranty",
};

const moqFor = { purifiers: 5, dispensers: 3, pumps: 10, filters: 25, membranes: 10, "spare-parts": 20 };

const blurb = {
  purifiers: "multi-stage purification for safe, great-tasting drinking water every day.",
  dispensers: "instant chilled and hot water for homes and offices.",
  pumps: "steady pressure for your RO system, even when inlet pressure is low.",
  filters: "a genuine replacement cartridge that keeps your purifier working at its best.",
  membranes: "high-rejection reverse osmosis membrane that removes dissolved salts.",
  "spare-parts": "a reliable, food-safe spare that fits most domestic RO purifiers.",
};

/** [name, category, brand, price, stock, specs] */
const defs = [
  ["AquaNest Crystal RO+UV+UF 8L", "purifiers", "AquaNest", 14999, 42, { Technology: "RO + UV + UF + TDS", Capacity: "8 L", Stages: "7" }],
  ["PureWell Classic RO 7L", "purifiers", "PureWell", 9499, 60, { Technology: "RO + TDS", Capacity: "7 L", Stages: "6" }],
  ["HydroNova Titan RO+UV Steel", "purifiers", "HydroNova", 22999, 18, { Technology: "RO + UV + Mineral", Capacity: "9 L", Stages: "8" }],
  ["AquaNest Onyx Smart RO", "purifiers", "AquaNest", 27499, 12, { Technology: "RO + UV-LED + Alkaline", Capacity: "10 L", Stages: "9" }],
  ["BlueSpring Under-Sink 3-Stage", "purifiers", "BlueSpring", 7999, 35, { Technology: "Sediment + GAC + CTO", Stages: "3" }],
  ["BlueSpring Under-Sink RO Pro", "purifiers", "BlueSpring", 16499, 20, { Technology: "RO + Carbon", Stages: "5" }],
  ["PureFlo Compact UV 6L", "purifiers", "PureFlo", 6499, 55, { Technology: "UV + Carbon", Capacity: "6 L", Stages: "4" }],
  ["PureFlo Mini UV Countertop", "purifiers", "PureFlo", 4999, 70, { Technology: "UV", Stages: "3", Power: "20 W" }],
  ["HydroNova Alkaline RO 8L", "purifiers", "HydroNova", 18999, 26, { Technology: "RO + UV + Alkaline", Capacity: "8 L" }],
  ["Crystalline Copper RO 7L", "purifiers", "Crystalline", 15999, 30, { Technology: "RO + Copper + UV", Capacity: "7 L" }],
  ["AquaNest Gravity Ultra 15L", "purifiers", "AquaNest", 2999, 90, { Technology: "Gravity UF", Capacity: "15 L" }],
  ["PureWell Hot & Ambient RO", "purifiers", "PureWell", 31999, 8, { Technology: "RO + UV + Hot water", Capacity: "8 L" }],
  ["Crystalline Commercial RO 25 LPH", "purifiers", "Crystalline", 38999, 6, { Technology: "RO + UV", Output: "25 L/hr" }],
  ["BlueSpring Whole-Home Filter", "purifiers", "BlueSpring", 12499, 15, { Technology: "Sediment + Carbon", "Flow rate": "20 L/min" }],
  ["AquaPrimo Floor Hot & Cold", "dispensers", "AquaPrimo", 11499, 25, { Type: "Floor standing", Taps: "Hot + Cold" }],
  ["AquaPrimo Floor 3-Tap Cabinet", "dispensers", "AquaPrimo", 13999, 18, { Type: "Floor standing", Taps: "Hot + Cold + Normal" }],
  ["AquaFresh Tabletop Hot & Cold", "dispensers", "AquaFresh", 6999, 40, { Type: "Tabletop", Taps: "Hot + Cold" }],
  ["AquaFresh Tabletop Normal & Cold", "dispensers", "AquaFresh", 5999, 45, { Type: "Tabletop", Taps: "Normal + Cold" }],
  ["HydroNova Bottom-Load Dispenser", "dispensers", "HydroNova", 17999, 10, { Type: "Floor standing", Feature: "Child lock" }],
  ["PureWell Office Dispenser RO", "dispensers", "PureWell", 24999, 7, { Purification: "RO + UV", Taps: "Hot + Cold" }],
  ["AquaFresh Compact Cooler", "dispensers", "AquaFresh", 4499, 50, { Type: "Tabletop", Taps: "Cold only" }],
  ["AquaPrimo Steel Cooler 40L", "dispensers", "AquaPrimo", 29999, 5, { Type: "Commercial cooler", Storage: "40 L" }],
  ["FlowMax RO Booster Pump 75 GPD", "pumps", "FlowMax", 1499, 120, { Voltage: "24 V DC", Pressure: "100 PSI" }],
  ["FlowMax RO Booster Pump 100 GPD", "pumps", "FlowMax", 1799, 110, { Voltage: "24 V DC", Pressure: "110 PSI" }],
  ["FlowMax Booster Pump 150 GPD", "pumps", "FlowMax", 2299, 80, { Voltage: "24 V DC", Pressure: "120 PSI" }],
  ["HydroDrive Silent Pump 100 GPD", "pumps", "HydroDrive", 2499, 60, { Voltage: "24 V DC", Noise: "< 45 dB" }],
  ["HydroDrive Commercial Pump 400 GPD", "pumps", "HydroDrive", 4999, 25, { Voltage: "36 V DC", Pressure: "130 PSI" }],
  ["FlowMax Pump + 24V Adapter Kit", "pumps", "FlowMax", 2199, 75, { Includes: "Pump + SMPS adapter" }],
  ["HydroDrive Pressure Pump 12V", "pumps", "HydroDrive", 1299, 90, { Voltage: "12 V DC", Pressure: "80 PSI" }],
  ["PureAqua Spun PP Sediment 10\"", "filters", "PureAqua", 199, 400, { Type: "Spun polypropylene", Micron: "5 µ" }],
  ["PureAqua Inline Sediment Filter", "filters", "PureAqua", 349, 300, { Type: "Inline PP", Micron: "5 µ" }],
  ["PureAqua Sediment Pack of 5", "filters", "PureAqua", 799, 150, { Type: "Spun PP (x5)", Micron: "5 µ" }],
  ["CarbonPro Post Carbon Inline", "filters", "CarbonPro", 399, 260, { Type: "Coconut GAC", Life: "12 months" }],
  ["CarbonPro CTO Carbon Block 10\"", "filters", "CarbonPro", 549, 200, { Type: "Carbon block", Micron: "10 µ" }],
  ["CarbonPro Pre-Carbon GAC 10\"", "filters", "CarbonPro", 449, 220, { Type: "Granular carbon", Size: "10 inch" }],
  ["PureAqua Mineral Cartridge", "filters", "PureAqua", 699, 140, { Type: "Mineraliser", Adds: "Ca, Mg" }],
  ["PureAqua Alkaline Inline Filter", "filters", "PureAqua", 899, 110, { Type: "Alkaline ceramic" }],
  ["AquaNest Annual Filter Kit", "filters", "AquaNest", 1899, 95, { Includes: "Sediment + Pre-carbon + Post-carbon" }],
  ["MembraPure RO Membrane 75 GPD", "membranes", "MembraPure", 1599, 140, { Output: "75 GPD", Size: "1812" }],
  ["MembraPure RO Membrane 80 GPD", "membranes", "MembraPure", 1799, 130, { Output: "80 GPD", Size: "1812" }],
  ["MembraPure HiTDS Membrane 100 GPD", "membranes", "MembraPure", 2399, 90, { Output: "100 GPD", Size: "2012" }],
  ["AquaFilm Membrane 150 GPD", "membranes", "AquaFilm", 3299, 60, { Output: "150 GPD", Size: "2012" }],
  ["AquaFilm Commercial 4040", "membranes", "AquaFilm", 9999, 20, { Output: "2400 GPD", Size: "4040" }],
  ["AquaFilm Commercial 2540", "membranes", "AquaFilm", 6499, 28, { Output: "850 GPD", Size: "2540" }],
  ["MembraPure UF Membrane", "membranes", "MembraPure", 899, 160, { Type: "Hollow fibre UF", Pore: "0.01 µ" }],
  ["Chrome Goose-Neck RO Faucet", "spare-parts", "AquaNest", 499, 210, { Material: "Chrome-plated brass" }],
  ["RO Tubing Kit 10m (Blue + White)", "spare-parts", "PureAqua", 299, 300, { Size: "1/4 inch", Length: "10 m" }],
  ["24V Solenoid Valve (SV)", "spare-parts", "FlowMax", 349, 180, { Voltage: "24 V DC" }],
  ["Float Valve for RO Tank", "spare-parts", "PureAqua", 149, 260, { Type: "Float valve" }],
  ["Push-Fit Connector Set (20 pcs)", "spare-parts", "PureAqua", 399, 240, { Pieces: "20" }],
  ["24V SMPS Power Adapter", "spare-parts", "FlowMax", 599, 170, { Output: "24 V, 2.5 A" }],
  ["RO Flow Restrictor 450 ml", "spare-parts", "AquaNest", 99, 320, { Rating: "450 ml/min" }],
];

function seeded(n) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const catCounters = {};

export const products = defs.map(([name, cat, brand, price, stock, specs], i) => {
  const r = seeded(i + 1);
  const mrp = Math.round((price * (1.15 + r * 0.3)) / 10) * 10 - 1;
  const id = `wp-${String(i + 1).padStart(3, "0")}`;
  const catIndex = catCounters[cat] || 0;
  catCounters[cat] = catIndex + 1;
  const image = uniqueProductImage(cat, id, catIndex);
  const alt = uniqueProductImage(cat, `${id}-b`, catIndex + 3);
  return {
    id,
    name,
    brand,
    category: cat,
    image,
    images: [image, alt],
    price,
    mrp,
    wholesalePrice: Math.round((price * 0.72) / 10) * 10 - 1,
    moq: moqFor[cat],
    stock: i % 17 === 9 ? 0 : stock,
    rating: Math.round((3.9 + r * 1.0) * 10) / 10,
    reviews: Math.floor(40 + r * 1800),
    warranty: warrantyFor[cat],
    description: `${name} by ${brand} — ${blurb[cat]}`,
    specs: { Brand: brand, ...specs },
    featured: [0, 2, 3, 6, 8, 14, 16, 22, 38].includes(i),
    createdOrder: i,
  };
});

export const getProduct = (id) => products.find((p) => p.id === id);

export function queryCatalog({ q, category, brand, sort } = {}) {
  const needle = q?.trim().toLowerCase();
  let list = products.filter((p) => {
    if (category && p.category !== category) return false;
    if (brand && p.brand !== brand) return false;
    if (needle) {
      const hay = `${p.name} ${p.brand} ${p.category} ${Object.values(p.specs).join(" ")}`.toLowerCase();
      if (!needle.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  switch (sort) {
    case "price-asc":
      list = [...list].sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      list = [...list].sort((a, b) => b.price - a.price);
      break;
    case "rating":
      list = [...list].sort((a, b) => b.rating - a.rating);
      break;
    default:
      list = [...list].sort((a, b) => b.reviews - a.reviews);
  }
  return list;
}

export const FREE_DELIVERY_THRESHOLD = 999;
export const DELIVERY_FEE = 79;

export function unitPrice(product, isApprovedDealer) {
  return isApprovedDealer ? product.wholesalePrice : product.price;
}

export function cartTotals(lines, isApprovedDealer) {
  const subtotal = lines.reduce((s, l) => s + unitPrice(l.product, isApprovedDealer) * l.qty, 0);
  const delivery = subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  return { subtotal, delivery, total: subtotal + delivery, itemCount: lines.reduce((s, l) => s + l.qty, 0) };
}

export function clampQty(qty, stock) {
  return Math.max(0, Math.min(Math.floor(qty), stock));
}

export function orderStatus(order, now = Date.now()) {
  if (order.cancelled) return "cancelled";
  if (order.adminStatus) return order.adminStatus;
  const mins = (now - new Date(order.createdAt).getTime()) / 60000;
  if (mins < 2) return "placed";
  if (mins < 30) return "confirmed";
  if (mins < 240) return "shipped";
  if (mins < 1440) return "out-for-delivery";
  return "delivered";
}
