import webpush from "web-push";
import { getFirebaseApp } from "./firebase.js";

let webPushReady = false;

export function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@aquanest.in";
  if (!publicKey || !privateKey) {
    webPushReady = false;
    return { configured: false };
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  webPushReady = true;
  return { configured: true, publicKey };
}

export function pushStatus() {
  return {
    vapid: webPushReady,
    fcm: !!getFirebaseApp(),
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
  };
}

export async function sendFcmToToken(token, { title, body, data = {} }) {
  const app = getFirebaseApp();
  if (!app || !token) return { ok: false, reason: "fcm_unavailable" };
  try {
    const admin = (await import("firebase-admin")).default;
    const id = await admin.messaging().send({
      token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries({ ...data, title, body }).map(([k, v]) => [k, String(v ?? "")]),
      ),
      android: { priority: "high" },
    });
    return { ok: true, id, channel: "fcm" };
  } catch (err) {
    console.warn("[push:fcm]", err.message);
    return { ok: false, reason: err.message, channel: "fcm" };
  }
}

export async function sendWebPush(subscription, { title, body, data = {} }) {
  if (!webPushReady || !subscription) return { ok: false, reason: "vapid_unavailable" };
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title, body, data }),
    );
    return { ok: true, channel: "webpush" };
  } catch (err) {
    console.warn("[push:web]", err.message);
    return { ok: false, reason: err.message, channel: "webpush" };
  }
}

/**
 * Deliver push to a user via all registered device tokens + web subscriptions.
 */
export async function notifyUser(user, { title, body, data = {} }) {
  if (!user) return { sent: 0, results: [] };
  const results = [];
  const devices = user.devices || [];

  for (const device of devices) {
    if (device.platform === "web" && device.subscription) {
      results.push(await sendWebPush(device.subscription, { title, body, data }));
    } else if (device.token) {
      results.push(await sendFcmToToken(device.token, { title, body, data }));
    }
  }

  return {
    sent: results.filter((r) => r.ok).length,
    results,
  };
}
