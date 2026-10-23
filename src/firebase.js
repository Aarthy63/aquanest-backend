/**
 * Optional Firebase Admin — loaded only if `firebase-admin` is installed.
 * Keeps the default install small when disk space is limited.
 */
let app;
let adminMod;

async function loadAdmin() {
  if (adminMod !== undefined) return adminMod;
  try {
    adminMod = await import("firebase-admin");
    return adminMod;
  } catch {
    adminMod = null;
    return null;
  }
}

export function getFirebaseApp() {
  // Sync stub: real init happens in ensureFirebase()
  return app ?? null;
}

export async function ensureFirebase() {
  if (app !== undefined) return app;
  const mod = await loadAdmin();
  if (!mod) {
    app = null;
    return null;
  }
  const admin = mod.default || mod;
  try {
    if (admin.apps?.length) {
      app = admin.app();
      return app;
    }
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (projectId && clientEmail && privateKey) {
      privateKey = privateKey.replace(/\\n/g, "\n");
      app = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      console.log("[firebase] Admin ready");
      return app;
    }
    app = null;
    return null;
  } catch (err) {
    console.warn("[firebase] init skipped:", err.message);
    app = null;
    return null;
  }
}

export function firebaseStatus() {
  return {
    configured: !!app,
    projectId: process.env.FIREBASE_PROJECT_ID || null,
    packageInstalled: adminMod != null,
  };
}
