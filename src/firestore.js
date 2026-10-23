/**
 * Firestore helpers for AquaNest.
 *
 * Current default DB is still `backend/data/store.json` (see db.js).
 * Enable Firestore when ready:
 *   USE_FIRESTORE=1
 *   (+ existing FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY)
 *
 * Suggested collections (mirror of store.json):
 *   users/{userId}
 *     - profile fields, cart, wishlist, addresses, devices, settings
 *     - subcollections:
 *         orders/{orderId}
 *         bookings/{bookingId}
 *         notifications/{notificationId}
 *         loginHistory/{loginId}
 *   catalog/products/{productId}   (optional; or keep catalog.js)
 *   meta/counters                 (next ids)
 */
import { ensureFirebase } from "./firebase.js";

export function firestoreEnabled() {
  return String(process.env.USE_FIRESTORE || "").trim() === "1";
}

export async function getFirestore() {
  if (!firestoreEnabled()) return null;
  const app = await ensureFirebase();
  if (!app) return null;
  const admin = (await import("firebase-admin")).default;
  return admin.firestore();
}

export const collections = {
  users: "users",
  products: "products",
  meta: "meta",
};

/** Example: upsert a user document (call from createUser / updateUser when migrating). */
export async function upsertUserDoc(user) {
  const db = await getFirestore();
  if (!db || !user?.id) return { ok: false, reason: "firestore_off" };
  const { passwordHash, ...safe } = user;
  await db.collection(collections.users).doc(user.id).set(
    {
      ...safe,
      // never store raw password; keep hash only if you intentionally migrate auth
      passwordHash: passwordHash || null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return { ok: true };
}

/** Example: append a notification under the user. */
export async function addUserNotification(userId, notification) {
  const db = await getFirestore();
  if (!db || !userId || !notification?.id) return { ok: false, reason: "firestore_off" };
  await db
    .collection(collections.users)
    .doc(userId)
    .collection("notifications")
    .doc(notification.id)
    .set({ ...notification, createdAt: notification.createdAt || new Date().toISOString() });
  return { ok: true };
}

/** Example: list recent notifications for a user. */
export async function listUserNotifications(userId, limit = 50) {
  const db = await getFirestore();
  if (!db || !userId) return [];
  const snap = await db
    .collection(collections.users)
    .doc(userId)
    .collection("notifications")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data());
}
