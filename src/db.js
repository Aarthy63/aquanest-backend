import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { firestoreEnabled, getFirestore } from "./firestore.js";

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
let firestoreSaveTimer = null;

function writeLocal() {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2));
  } catch (err) {
    // Render ephemeral disk may fail — Firestore is the source of truth there
    console.warn("[db] local save skipped:", err.message);
  }
}

async function persistFirestore() {
  if (!firestoreEnabled()) return;
  const db = await getFirestore();
  if (!db) return;
  const payload = {
    users: state.users || [],
    socialPosts: state.socialPosts || [],
    next: state.next || { user: 1 },
    updatedAt: new Date().toISOString(),
  };
  await db.collection("meta").doc("store").set(payload, { merge: false });
}

function save() {
  writeLocal();
  if (!firestoreEnabled()) return;
  clearTimeout(firestoreSaveTimer);
  firestoreSaveTimer = setTimeout(() => {
    persistFirestore().catch((err) => console.warn("[db] firestore save:", err.message));
  }, 250);
}

/** Flush pending Firestore write immediately (call after seeds / critical boot). */
export async function flushDb() {
  if (!firestoreEnabled()) return { ok: true, mode: "local" };
  clearTimeout(firestoreSaveTimer);
  firestoreSaveTimer = null;
  try {
    await persistFirestore();
    return { ok: true, mode: "firestore" };
  } catch (err) {
    console.warn("[db] flush failed:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Call once at boot (after Firebase init). Loads durable state from Firestore on Render.
 */
export async function initDb() {
  state = load();
  if (!firestoreEnabled()) {
    console.log(`[db] local store.json · users=${state.users?.length || 0}`);
    return { mode: "local", users: state.users?.length || 0 };
  }
  try {
    const db = await getFirestore();
    if (!db) {
      console.warn("[db] USE_FIRESTORE=1 but Firestore unavailable — local only");
      return { mode: "local-fallback", users: state.users?.length || 0 };
    }
    const snap = await db.collection("meta").doc("store").get();
    if (snap.exists) {
      const remote = snap.data() || {};
      state = {
        ...empty(),
        users: Array.isArray(remote.users) ? remote.users : [],
        socialPosts: Array.isArray(remote.socialPosts) ? remote.socialPosts : [],
        next: remote.next || { user: 1 },
      };
      writeLocal();
      console.log(`[db] Firestore hydrate · users=${state.users.length} · posts=${state.socialPosts.length}`);
      return { mode: "firestore", users: state.users.length };
    }
    await persistFirestore();
    console.log(`[db] Firestore store created · users=${state.users?.length || 0}`);
    return { mode: "firestore-seed", users: state.users?.length || 0 };
  } catch (err) {
    const msg = err.message || String(err);
    console.warn("[db] Firestore hydrate failed:", msg);
    if (/PERMISSION_DENIED|has not been used|disabled/i.test(msg)) {
      console.warn(
        "[db] Enable Cloud Firestore API + create a Firestore database for project",
        process.env.FIREBASE_PROJECT_ID || "(unknown)",
      );
    }
    return { mode: "local-error", users: state.users?.length || 0, error: msg };
  }
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
      body: "We'll review your business details within 24–48 hours.",
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
        body: `Signed in · ${device} · ${new Date(at).toLocaleString()}`,
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
