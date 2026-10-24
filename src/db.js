import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { firestoreEnabled, getFirestore } from "./firestore.js";
import {
  durableGithubEnabled,
  loadDurableGithub,
  saveDurableGithub,
} from "./durableGithub.js";

const dir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(dir, "..", "data");
const file = join(dataDir, "store.json");

const empty = () => ({
  users: [],
  socialPosts: [],
  next: { user: 1 },
});

function load() {
  if (!existsSync(file)) return empty();
  try {
    return { ...empty(), ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    return empty();
  }
}

let state = load();
let persistTimer = null;
let githubSha = null;

function snapshotPayload() {
  return {
    users: state.users || [],
    socialPosts: state.socialPosts || [],
    next: state.next || { user: 1 },
    updatedAt: new Date().toISOString(),
  };
}

function applyRemote(remote) {
  if (!remote || typeof remote !== "object") return;
  state = {
    ...empty(),
    users: Array.isArray(remote.users) ? remote.users : [],
    socialPosts: Array.isArray(remote.socialPosts) ? remote.socialPosts : [],
    next: remote.next || { user: 1 },
  };
}

function writeLocal() {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn("[db] local save skipped:", err.message);
  }
}

async function persistFirestore() {
  if (!firestoreEnabled()) return;
  const db = await getFirestore();
  if (!db) return;
  await db.collection("meta").doc("store").set(snapshotPayload(), { merge: false });
}

async function persistGithub() {
  if (!durableGithubEnabled()) return;
  const result = await saveDurableGithub(snapshotPayload(), githubSha);
  if (result?.sha) githubSha = result.sha;
}

function save() {
  writeLocal();
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistFirestore().catch((err) => console.warn("[db] firestore save:", err.message));
    persistGithub().catch((err) => console.warn("[db] github save:", err.message));
  }, 400);
}

/** Flush durable writes immediately (boot / critical). */
export async function flushDb() {
  clearTimeout(persistTimer);
  persistTimer = null;
  writeLocal();
  const out = { ok: true, firestore: false, github: false };
  if (firestoreEnabled()) {
    try {
      await persistFirestore();
      out.firestore = true;
    } catch (err) {
      console.warn("[db] flush firestore:", err.message);
    }
  }
  if (durableGithubEnabled()) {
    try {
      await persistGithub();
      out.github = true;
    } catch (err) {
      console.warn("[db] flush github:", err.message);
    }
  }
  return out;
}

/**
 * Boot hydrate: Firestore → GitHub durable → local store.json
 */
export async function initDb() {
  state = load();

  // 1) Firestore
  if (firestoreEnabled()) {
    try {
      const db = await getFirestore();
      if (db) {
        const snap = await db.collection("meta").doc("store").get();
        if (snap.exists) {
          applyRemote(snap.data());
          writeLocal();
          console.log(`[db] Firestore hydrate · users=${state.users.length}`);
          return { mode: "firestore", users: state.users.length };
        }
      }
    } catch (err) {
      console.warn("[db] Firestore hydrate failed:", err.message);
    }
  }

  // 2) GitHub durable branch (works when Firestore API is disabled)
  if (durableGithubEnabled()) {
    try {
      const remote = await loadDurableGithub();
      if (remote?.data?.users) {
        applyRemote(remote.data);
        githubSha = remote.sha;
        writeLocal();
        console.log(`[db] GitHub hydrate · users=${state.users.length}`);
        return { mode: "github", users: state.users.length };
      }
      githubSha = remote?.sha || null;
      await persistGithub();
      console.log(`[db] GitHub store created · users=${state.users.length}`);
      return { mode: "github-seed", users: state.users.length };
    } catch (err) {
      console.warn("[db] GitHub hydrate failed:", err.message);
      return { mode: "github-error", users: state.users.length, error: err.message };
    }
  }

  console.log(`[db] local store.json · users=${state.users.length}`);
  return { mode: firestoreEnabled() ? "local-error" : "local", users: state.users.length };
}

function mergeById(serverList = [], clientList = []) {
  const map = new Map();
  for (const item of serverList) {
    if (item?.id) map.set(String(item.id), item);
  }
  for (const item of clientList) {
    if (!item?.id) continue;
    const id = String(item.id);
    const prev = map.get(id);
    if (!prev) {
      map.set(id, item);
      continue;
    }
    const pt = new Date(prev.updatedAt || prev.createdAt || 0).getTime();
    const ct = new Date(item.updatedAt || item.createdAt || 0).getTime();
    map.set(id, ct >= pt ? { ...prev, ...item } : prev);
  }
  return [...map.values()].sort((a, b) => {
    const at = new Date(b.createdAt || 0).getTime();
    const bt = new Date(a.createdAt || 0).getTime();
    return at - bt;
  });
}

/** Merge APK-cached orders/addresses back after Render wipe. */
export function syncUserSnapshot(userId, snapshot = {}) {
  const user = findUserById(userId);
  if (!user) return null;
  const next = updateUser(userId, (u) => ({
    ...u,
    name: snapshot.name?.trim() || u.name,
    phone: snapshot.phone != null && String(snapshot.phone).trim() !== "" ? String(snapshot.phone) : u.phone,
    cart: Array.isArray(snapshot.cart) ? snapshot.cart : u.cart,
    wishlist: Array.isArray(snapshot.wishlist)
      ? [...new Set([...(u.wishlist || []), ...snapshot.wishlist])]
      : u.wishlist,
    addresses: mergeById(u.addresses, snapshot.addresses),
    orders: mergeById(u.orders, snapshot.orders),
    bookings: mergeById(u.bookings, snapshot.bookings),
    notifications: mergeById(u.notifications, snapshot.notifications).slice(0, 80),
  }));
  return next;
}

function uid(prefix) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function newAccount(partial) {
  return {
    cart: [],
    wishlist: [],
    addresses: [],
    orders: [],
    bookings: [],
    devices: [],
    loginHistory: [],
    notifications: [
      {
        id: uid("N"),
        createdAt: new Date().toISOString(),
        title: "Monsoon Sale is live",
        body: "Up to 35% off on RO purifiers. Free installation this week.",
        kind: "offer",
        read: false,
      },
    ],
    dealer: { status: "none", businessName: "", gstin: "", city: "", businessType: "" },
    ...partial,
  };
}

export async function seedDemoUser() {
  if (state.users.some((u) => u.email === "demo@aquanest.in")) return;
  const passwordHash = await bcrypt.hash("password123", 10);
  state.users.push(
    newAccount({
      id: "UDEMO",
      name: "Demo User",
      email: "demo@aquanest.in",
      phone: "9876543210",
      role: "customer",
      passwordHash,
    }),
  );
  save();
}

export function publicUser(user) {
  const { passwordHash: _, ...rest } = user;
  return rest;
}

export function findUserByEmail(email) {
  return state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(id) {
  return state.users.find((u) => u.id === id);
}

/**
 * Recreate a user wiped by Render ephemeral disk from JWT restore claims.
 * Keeps the same id/email/passwordHash so the saved APK token still works.
 */
export function restoreUserFromToken(payload) {
  if (!payload?.sub || !payload?.email || !payload?.ph) return null;
  const existing = findUserById(payload.sub) || findUserByEmail(payload.email);
  if (existing) return existing;
  const role = payload.role === "admin" ? "admin" : payload.role === "dealer" ? "dealer" : "customer";
  const user = newAccount({
    id: String(payload.sub),
    name: payload.name || "AquaNest User",
    email: String(payload.email).trim().toLowerCase(),
    phone: payload.phone || "",
    role,
    passwordHash: String(payload.ph),
  });
  state.users.push(user);
  // Keep next.user counter ahead of numeric ids when possible
  const n = Number(String(payload.sub).replace(/^U/, ""));
  if (Number.isFinite(n) && n >= (state.next?.user || 1)) {
    state.next = { ...(state.next || {}), user: n + 1 };
  }
  save();
  console.log(`[db] restored user from token ÃÂ· ${user.email} ÃÂ· ${user.id}`);
  return user;
}

/**
 * After Render restarts, in-memory users are gone. Recreate a customer so the
 * same email/password from the APK can sign in again.
 */
export async function recreateCustomerFromLogin({ email, password, name, phone }) {
  const normalized = String(email || "").trim().toLowerCase();
  const existing = findUserByEmail(normalized);
  if (existing) return existing;
  const user = newAccount({
    id: `U${state.next.user++}`,
    name: String(name || normalized.split("@")[0] || "AquaNest User").trim() || "AquaNest User",
    email: normalized,
    phone: phone ?? "",
    role: "customer",
    passwordHash: await bcrypt.hash(String(password), 10),
  });
  state.users.push(user);
  save();
  console.log(`[db] recreated customer after wipe Â· ${user.email} Â· ${user.id}`);
  return user;
}

export async function createUser({ name, email, phone, password, role, dealer }) {
  if (findUserByEmail(email)) {
    const err = new Error("An account with this email already exists");
    err.status = 409;
    throw err;
  }
  if (role === "admin") {
    const err = new Error("Cannot self-register as admin");
    err.status = 403;
    throw err;
  }
  const user = newAccount({
    id: `U${state.next.user++}`,
    name,
    email: String(email).trim().toLowerCase(),
    phone: phone ?? "",
    role: role === "dealer" ? "dealer" : "customer",
    passwordHash: await bcrypt.hash(password, 10),
    dealer: dealer
      ? { ...dealer, status: "pending", submittedAt: new Date().toISOString() }
      : { status: "none", businessName: "", gstin: "", city: "", businessType: "" },
  });
  if (dealer) {
    user.notifications.unshift({
      id: uid("N"),
      createdAt: new Date().toISOString(),
      title: "Dealer application received",
      body: "We'll review your business details within 24Ã¢ÂÂ48 hours.",
      kind: "dealer",
      read: false,
    });
  }
  state.users.push(user);
  save();
  return user;
}

export function updateUser(id, updater) {
  const idx = state.users.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  state.users[idx] = updater(state.users[idx]);
  save();
  return state.users[idx];
}

export function isApprovedDealer(user) {
  return user?.role === "dealer" && user.dealer?.status === "approved";
}

export function listUsers() {
  return state.users;
}

export function listAllOrders() {
  const rows = [];
  for (const user of state.users) {
    for (const order of user.orders || []) {
      rows.push({
        ...order,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      });
    }
  }
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function findOrder(orderId) {
  for (const user of state.users) {
    const order = (user.orders || []).find((o) => o.id === orderId);
    if (order) return { user, order };
  }
  return null;
}

export function updateOrder(orderId, patch) {
  const found = findOrder(orderId);
  if (!found) return null;
  let updated = null;
  updateUser(found.user.id, (u) => ({
    ...u,
    orders: u.orders.map((o) => {
      if (o.id !== orderId) return o;
      updated = { ...o, ...patch };
      return updated;
    }),
  }));
  return updated ? { ...updated, userId: found.user.id, userName: found.user.name, userEmail: found.user.email } : null;
}

export function deleteOrder(orderId) {
  const found = findOrder(orderId);
  if (!found) return false;
  updateUser(found.user.id, (u) => ({
    ...u,
    orders: u.orders.filter((o) => o.id !== orderId),
  }));
  return true;
}

export function deleteUser(id) {
  const idx = state.users.findIndex((u) => u.id === id);
  if (idx < 0) return false;
  if (state.users[idx].role === "admin") return false;
  state.users.splice(idx, 1);
  save();
  return true;
}

export function upsertDevice(userId, device) {
  const user = updateUser(userId, (u) => {
    const devices = [...(u.devices || [])];
    const key = device.token || JSON.stringify(device.subscription || {});
    const idx = devices.findIndex(
      (d) => (device.token && d.token === device.token) || (device.subscription && JSON.stringify(d.subscription) === JSON.stringify(device.subscription)),
    );
    const row = {
      id: idx >= 0 ? devices[idx].id : uid("D"),
      platform: device.platform || "unknown",
      token: device.token || null,
      subscription: device.subscription || null,
      updatedAt: new Date().toISOString(),
      key,
    };
    if (idx >= 0) devices[idx] = row;
    else devices.push(row);
    return { ...u, devices };
  });
  return user?.devices || [];
}

export function listAllBookings() {
  const rows = [];
  for (const user of state.users) {
    for (const booking of user.bookings || []) {
      rows.push({
        ...booking,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      });
    }
  }
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function countDevices() {
  return state.users.reduce((n, u) => n + (u.devices?.length || 0), 0);
}

export function recordLogin(userId, { device = "AquaNest app", ip = "" } = {}) {
  const at = new Date().toISOString();
  const entry = { id: uid("L"), at, device, ip };
  return updateUser(userId, (u) => ({
    ...u,
    loginHistory: [entry, ...(u.loginHistory || [])].slice(0, 40),
    notifications: [
      {
        id: uid("N"),
        createdAt: at,
        title: "New sign-in",
        body: `Signed in ?? ${device} ?? ${new Date(at).toLocaleString()}`,
        kind: "login",
        read: false,
      },
      ...(u.notifications || []),
    ],
  }));
}

export function addSocialPost(post) {
  if (!Array.isArray(state.socialPosts)) state.socialPosts = [];
  state.socialPosts.unshift(post);
  state.socialPosts = state.socialPosts.slice(0, 60);
  save();
  return post;
}

export function listSocialPosts(limit = 20) {
  const rows = Array.isArray(state.socialPosts) ? state.socialPosts : [];
  return rows.slice(0, limit);
}

export function deleteSocialPost(id) {
  if (!Array.isArray(state.socialPosts)) return null;
  const idx = state.socialPosts.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const [removed] = state.socialPosts.splice(idx, 1);
  save();
  return removed;
}

export function updateSocialPost(id, patch) {
  if (!Array.isArray(state.socialPosts)) return null;
  const idx = state.socialPosts.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  state.socialPosts[idx] = { ...state.socialPosts[idx], ...patch };
  save();
  return state.socialPosts[idx];
}

export function listPublishedSocialPosts({ productId, limit = 30 } = {}) {
  let rows = (Array.isArray(state.socialPosts) ? state.socialPosts : []).filter(
    (p) => p.status === "published" || p.status === "live",
  );
  if (productId) rows = rows.filter((p) => p.product?.id === productId);
  return rows.slice(0, limit);
}

export function addInboxNotification(userId, { title, body, kind = "offer" }) {
  const at = new Date().toISOString();
  return updateUser(userId, (u) => ({
    ...u,
    notifications: [
      {
        id: uid("N"),
        createdAt: at,
        title,
        body,
        kind,
        read: false,
      },
      ...(u.notifications || []),
    ].slice(0, 80),
  }));
}

export async function seedAdminUser() {
  const email = String(process.env.ADMIN_EMAIL || "admin@aquanest.in").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = findUserByEmail(email);
  if (existing) {
    updateUser(existing.id, (u) => ({
      ...u,
      role: "admin",
      passwordHash,
      name: u.name || "AquaNest Admin",
    }));
    return;
  }
  state.users.push(
    newAccount({
      id: "UADMIN",
      name: "AquaNest Admin",
      email,
      phone: "",
      role: "admin",
      passwordHash,
    }),
  );
  save();
}

export { uid };
