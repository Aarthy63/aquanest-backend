/**
 * Distinct product images for the shop (not one image per category).
 */
const u = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

export const CATEGORY_COVER = {
  purifiers: u("photo-1548839140-29a749e1cf4d"),
  dispensers: u("photo-1559827291-72ee739d0d9a"),
  pumps: u("photo-1581091226825-a6a2a5aee158"),
  filters: u("photo-1582719471384-894fbb16e074"),
  membranes: u("photo-1532187863486-abf9dbad1b69"),
  "spare-parts": u("photo-1581092160562-40aa08e78837"),
};

/** Category-themed pools — different photo for each slot. */
const POOLS = {
  purifiers: [
    u("photo-1548839140-29a749e1cf4d"),
    u("photo-1523362628745-0c100150b504"),
    u("photo-1564419320461-687298aba27e"),
    u("photo-1542013936693-884638332954"),
    u("photo-1576013551627-0cc20b96c2a7"),
    u("photo-1628088062854-d1870b4553da"),
    u("photo-1600880292203-757bb62b4baf"),
    u("photo-1556909114-f6e7ad7d3136"),
    u("photo-1584622781564-1d987f7333c1"),
    u("photo-1584622650111-993a426fbf0a"),
    u("photo-1513558161293-cdaf765ed2fd"),
    u("photo-1536939459926-301728717817"),
    u("photo-1495774856032-8b90bbb32b32"),
    u("photo-1559827291-72ee739d0d9a"),
    u("photo-1602143407151-7111542de6e8"),
    u("photo-1571115177098-24ec42ed204d"),
  ],
  dispensers: [
    u("photo-1559827291-72ee739d0d9a"),
    u("photo-1571115177098-24ec42ed204d"),
    u("photo-1563227812-0ea4c22e6cc8"),
    u("photo-1602143407151-7111542de6e8"),
    u("photo-1523362628745-0c100150b504"),
    u("photo-1548839140-29a749e1cf4d"),
    u("photo-1513558161293-cdaf765ed2fd"),
    u("photo-1576013551627-0cc20b96c2a7"),
    u("photo-1556909114-f6e7ad7d3136"),
    u("photo-1628088062854-d1870b4553da"),
  ],
  pumps: [
    u("photo-1581091226825-a6a2a5aee158"),
    u("photo-1581092160562-40aa08e78837"),
    u("photo-1504328345606-18bbc8c9d7d1"),
    u("photo-1581092918056-0c4c3acd3789"),
    u("photo-1581092160607-ee22621dd758"),
    u("photo-1581092921461-eab62e97a780"),
    u("photo-1581092580497-e0d23cbdf1dc"),
    u("photo-1581094794329-ade1ceb1c0c0"),
  ],
  filters: [
    u("photo-1582719471384-894fbb16e074"),
    u("photo-1576086213369-97a306d77707"),
    u("photo-1615485290382-441e4d049cb5"),
    u("photo-1584308666744-24d5c474f2ae"),
    u("photo-1587854692152-cbe660dbde88"),
    u("photo-1532187863486-abf9dbad1b69"),
    u("photo-1576678927484-cc907957088c"),
    u("photo-1582719478250-c89cae4dc85b"),
    u("photo-1556910103-1c02745aae4d"),
    u("photo-1581091226825-a6a2a5aee158"),
  ],
  membranes: [
    u("photo-1532187863486-abf9dbad1b69"),
    u("photo-1582719471384-894fbb16e074"),
    u("photo-1576086213369-97a306d77707"),
    u("photo-1615485290382-441e4d049cb5"),
    u("photo-1584308666744-24d5c474f2ae"),
    u("photo-1587854692152-cbe660dbde88"),
    u("photo-1576678927484-cc907957088c"),
    u("photo-1582719478250-c89cae4dc85b"),
  ],
  "spare-parts": [
    u("photo-1581092160562-40aa08e78837"),
    u("photo-1581091226825-a6a2a5aee158"),
    u("photo-1504328345606-18bbc8c9d7d1"),
    u("photo-1581092918056-0c4c3acd3789"),
    u("photo-1581092160607-ee22621dd758"),
    u("photo-1581092921461-eab62e97a780"),
    u("photo-1581092580497-e0d23cbdf1dc"),
    u("photo-1581094794329-ade1ceb1c0c0"),
  ],
};

/**
 * Always returns a unique URL per productId.
 * Uses themed pool first; extras use picsum seed so they never look identical.
 */
export function uniqueProductImage(category, productId, indexInCategory = 0) {
  const pool = POOLS[category] || POOLS.purifiers;
  const pid = String(productId || `i${indexInCategory}`);
  if (indexInCategory < pool.length) {
    const base = pool[indexInCategory];
    return `${base}${base.includes("?") ? "&" : "?"}pid=${encodeURIComponent(pid)}`;
  }
  return `https://picsum.photos/seed/aquanest-${encodeURIComponent(pid)}/900/900`;
}
