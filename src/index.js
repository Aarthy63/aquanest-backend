import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import {
  cartTotals,
  clampQty,
  getProduct,
  orderStatus,
  queryCatalog,
  categories,
  unitPrice,
} from "./catalog.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addInboxNotification,
  addSocialPost,
  deleteSocialPost,
  listPublishedSocialPosts,
  updateSocialPost,
  countDevices,
  createUser,
  deleteOrder,
  deleteUser,
  findOrder,
  findUserByEmail,
  findUserById,
  isApprovedDealer,
  listAllBookings,
  listAllOrders,
  listSocialPosts,
  listUsers,
  publicUser,
  recordLogin,
  seedAdminUser,
  seedDemoUser,
  uid,
  updateOrder,
  updateUser,
  upsertDevice,
} from "./db.js";
import {
  mailStatus,
  sendAccountUpdateEmail,
  sendDealerStatusEmail,
  sendOrderEmail,
  sendOrderStatusEmail,
  sendSocialPostEmail,
  sendWelcomeEmail,
  verifyMail,
} from "./mail.js";
import { ensureFirebase, firebaseStatus } from "./firebase.js";
import {
  createRazorpayOrder,
  razorpayPublicConfig,
  verifyRazorpayPayment,
} from "./razorpay.js";
import { configureWebPush, notifyUser, pushStatus } from "./push.js";
import {
  aiSocialStatus,
  generateDailySocialPost,
  removeLocalPostImage,
  resolvePostImageUrl,
} from "./aiSocial.js";

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "aquanest-dev-secret-change-me";
await ensureFirebase();
configureWebPush();

const app = express();
const __backendDir = dirname(fileURLToPath(import.meta.url));
app.use(cors({ origin: true }));
app.use(express.json());
app.use("/media/ai-posts", express.static(join(__backendDir, "..", "data", "ai-posts")));

function sign(user, { audience = "customer" } = {}) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, aud: audience },
    JWT_SECRET,
    { expiresIn: audience === "admin" ? "1d" : "14d" },
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Account not found" });
    if (user.role === "admin" && payload.aud !== "admin") {
      return res.status(401).json({ error: "Use the admin panel to sign in" });
    }
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Admin sign in required" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.aud !== "admin") {
      return res.status(403).json({ error: "Admin token required" });
    }
    const user = findUserById(payload.sub);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Not an admin account" });
    }
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

function cartView(user) {
  const dealer = isApprovedDealer(user);
  const lines = user.cart
    .map((l) => {
      const product = getProduct(l.productId);
      if (!product) return null;
      return { productId: l.productId, qty: l.qty, product, unitPrice: unitPrice(product, dealer) };
    })
    .filter(Boolean);
  return { items: lines, ...cartTotals(lines, dealer), isDealer: dealer };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "aquanest-api",
    razorpay: razorpayPublicConfig(),
    firebase: firebaseStatus(),
    mail: mailStatus(),
    push: pushStatus(),
  });
});

app.get("/api/push/vapid-public", (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

app.post("/api/devices", auth, (req, res) => {
  const { token, platform, subscription } = req.body ?? {};
  if (!token && !subscription) {
    return res.status(400).json({ error: "FCM token or web push subscription required" });
  }
  const devices = upsertDevice(req.user.id, { token, platform, subscription });
  res.json({ ok: true, devices: devices.length });
});

app.get("/api/payments/config", (_req, res) => {
  res.json(razorpayPublicConfig());
});

app.post("/api/payments/razorpay/order", auth, async (req, res) => {
  try {
    const { addressId } = req.body ?? {};
    const address = req.user.addresses.find((a) => a.id === addressId);
    if (!address) return res.status(400).json({ error: "Select a delivery address" });
    if (!req.user.cart.length) return res.status(400).json({ error: "Cart is empty" });
    const dealer = isApprovedDealer(req.user);
    const lines = req.user.cart
      .map((l) => ({ product: getProduct(l.productId), qty: l.qty }))
      .filter((l) => l.product);
    const totals = cartTotals(lines, dealer);
    const order = await createRazorpayOrder({
      amountInr: totals.total,
      receipt: `AN_${req.user.id}_${Date.now()}`.slice(0, 40),
      notes: { userId: req.user.id, addressId },
    });
    res.json({
      ...order,
      amountInr: totals.total,
      prefill: {
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone || "",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Could not create Razorpay order" });
  }
});

app.post("/api/payments/razorpay/verify", auth, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
  const ok = verifyRazorpayPayment({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  if (!ok) return res.status(400).json({ error: "Payment verification failed" });
  res.json({ ok: true, paymentId: razorpay_payment_id, orderId: razorpay_order_id });
});

app.get("/api/categories", (_req, res) => {
  res.json(categories);
});

app.get("/api/products", (req, res) => {
  const list = queryCatalog({
    q: req.query.q,
    category: req.query.category,
    brand: req.query.brand,
    sort: req.query.sort,
  });
  res.json(list);
});

app.get("/api/products/:id", (req, res) => {
  const product = getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password, role, dealer } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    let user = await createUser({ name, email, phone, password, role, dealer });
    user = recordLogin(user.id, {
      device: req.body?.device || "AquaNest app",
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    }) || user;
    sendWelcomeEmail(user).catch((e) => console.warn("[mail] welcome failed", e.message));
    res.status(201).json({ token: sign(user, { audience: "customer" }), user: publicUser(user) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, device } = req.body ?? {};
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const found = findUserByEmail(normalized);
  if (!found || !(await bcrypt.compare(String(password), found.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (found.role === "admin") {
    return res.status(403).json({ error: "Admin accounts must sign in via the admin panel" });
  }
  const user =
    recordLogin(found.id, {
      device: device || "AquaNest app",
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
    }) || found;
  res.json({ token: sign(user, { audience: "customer" }), user: publicUser(user) });
});

app.get("/api/auth/login-history", auth, (req, res) => {
  res.json(req.user.loginHistory || []);
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const user = findUserByEmail(normalized);
  if (!user || user.role !== "admin") {
    return res.status(401).json({ error: "Invalid admin credentials" });
  }
  if (!(await bcrypt.compare(String(password), user.passwordHash))) {
    return res.status(401).json({ error: "Invalid admin credentials" });
  }
  res.json({
    token: sign(user, { audience: "admin" }),
    admin: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.get("/api/admin/me", adminAuth, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role });
});

app.get("/api/admin/summary", adminAuth, (_req, res) => {
  const users = listUsers().filter((u) => u.role !== "admin");
  const orders = listAllOrders().map((o) => ({ ...o, status: orderStatus(o) }));
  const bookings = listAllBookings();
  const pendingDealers = users.filter((u) => u.dealer?.status === "pending");
  const revenue = orders.filter((o) => !o.cancelled).reduce((sum, o) => sum + (o.total || 0), 0);
  const statusCounts = {};
  for (const o of orders) {
    const s = o.cancelled ? "cancelled" : o.status;
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  res.json({
    users: users.length,
    dealers: users.filter((u) => u.role === "dealer" || u.dealer?.status === "approved").length,
    orders: orders.length,
    bookings: bookings.length,
    pendingDealers: pendingDealers.length,
    revenue,
    devices: countDevices(),
    statusCounts,
    recentOrders: orders.slice(0, 8),
    recentBookings: bookings.slice(0, 6),
    pendingDealerList: pendingDealers.slice(0, 5).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      businessName: u.dealer?.businessName,
      city: u.dealer?.city,
    })),
    push: pushStatus(),
  });
});

app.get("/api/admin/bookings", adminAuth, (_req, res) => {
  res.json(listAllBookings());
});

app.patch("/api/admin/bookings/:id", adminAuth, async (req, res) => {
  const { status, technician, notify } = req.body ?? {};
  let found = null;
  for (const u of listUsers()) {
    const b = (u.bookings || []).find((x) => x.id === req.params.id);
    if (b) {
      found = { user: u, booking: b };
      break;
    }
  }
  if (!found) return res.status(404).json({ error: "Booking not found" });
  const user = updateUser(found.user.id, (u) => ({
    ...u,
    bookings: u.bookings.map((b) =>
      b.id === req.params.id
        ? {
            ...b,
            status: status || b.status,
            technician: technician != null ? String(technician) : b.technician,
            updatedAt: new Date().toISOString(),
          }
        : b,
    ),
  }));
  const booking = user.bookings.find((b) => b.id === req.params.id);
  if (notify !== false) {
    notifyUser(user, {
      title: "Service update",
      body: `Booking ${booking.id} is now ${booking.status}`,
      data: { kind: "service", bookingId: booking.id },
    }).catch(() => {});
  }
  res.json({ ...booking, userId: user.id, userName: user.name, userEmail: user.email });
});

app.post("/api/admin/devices", adminAuth, (req, res) => {
  const { token, platform, subscription } = req.body ?? {};
  if (!token && !subscription) {
    return res.status(400).json({ error: "FCM token or web push subscription required" });
  }
  const devices = upsertDevice(req.user.id, {
    token,
    platform: platform || "web",
    subscription,
  });
  res.json({ ok: true, devices: devices.length });
});

app.post("/api/admin/push/broadcast", adminAuth, async (req, res) => {
  const { title, body, userId } = req.body ?? {};
  if (!title || !body) return res.status(400).json({ error: "title and body required" });
  const targets = userId
    ? [findUserById(userId)].filter(Boolean)
    : listUsers().filter((u) => u.role !== "admin");
  let sent = 0;
  let inbox = 0;
  for (const u of targets) {
    // In-app inbox (works in Expo Go via polling) + FCM/web when tokens exist
    addInboxNotification(u.id, { title, body, kind: "offer" });
    inbox += 1;
    const r = await notifyUser(u, { title, body, data: { kind: "admin" } });
    sent += r.sent;
  }
  res.json({
    ok: true,
    targets: targets.length,
    inbox,
    sent,
    tip: "Expo Go shows Alert + bell. Remote tray push needs a native build with FCM tokens.",
  });
});

function withImageUrls(posts, req) {
  return (posts || []).map((p) => ({
    ...p,
    imageUrl: resolvePostImageUrl(p, req),
  }));
}

/** Public — mobile app feed (published only), optional ?productId= */
app.get("/api/ai-posts", (req, res) => {
  const productId = req.query.productId ? String(req.query.productId) : undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const posts = listPublishedSocialPosts({ productId, limit });
  res.json(withImageUrls(posts, req));
});

app.get("/api/admin/ai-posts", adminAuth, (req, res) => {
  res.json({ posts: withImageUrls(listSocialPosts(40), req), ai: aiSocialStatus() });
});

app.post("/api/admin/ai-posts/run", adminAuth, async (req, res) => {
  try {
    const post = await runAiSocialWorkflow();
    res.json({ ok: true, post: withImageUrls([post], req)[0] });
  } catch (err) {
    res.status(500).json({ error: err.message || "AI post failed" });
  }
});

app.patch("/api/admin/ai-posts/:id", adminAuth, (req, res) => {
  const status = req.body?.status;
  if (!["published", "draft"].includes(status)) {
    return res.status(400).json({ error: "status must be published or draft" });
  }
  const patch = {
    status,
    publishedAt: status === "published" ? new Date().toISOString() : null,
  };
  const updated = updateSocialPost(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: "Post not found" });
  res.json(withImageUrls([updated], req)[0]);
});

app.delete("/api/admin/ai-posts/:id", adminAuth, (req, res) => {
  const removed = deleteSocialPost(req.params.id);
  if (!removed) return res.status(404).json({ error: "Post not found" });
  removeLocalPostImage(removed);
  res.json({ ok: true, id: removed.id });
});

app.get("/api/admin/orders", adminAuth, (_req, res) => {
  res.json(listAllOrders().map((o) => ({ ...o, status: orderStatus(o) })));
});

app.patch("/api/admin/orders/:id", adminAuth, async (req, res) => {
  const found = findOrder(req.params.id);
  if (!found) return res.status(404).json({ error: "Order not found" });
  const { paymentRef, paymentMethod, cancelled, adminStatus, notify } = req.body ?? {};
  const allowed = ["placed", "confirmed", "shipped", "out-for-delivery", "delivered", "cancelled"];
  const patch = {};
  if (paymentRef != null) patch.paymentRef = String(paymentRef);
  if (paymentMethod != null) patch.paymentMethod = String(paymentMethod);
  if (cancelled != null) patch.cancelled = !!cancelled;
  if (adminStatus != null) {
    if (adminStatus === "" || adminStatus === null) {
      patch.adminStatus = null;
    } else if (!allowed.includes(adminStatus)) {
      return res.status(400).json({ error: "Invalid status" });
    } else {
      patch.adminStatus = adminStatus;
      if (adminStatus === "cancelled") patch.cancelled = true;
      else patch.cancelled = false;
    }
  }
  const updated = updateOrder(req.params.id, patch);
  const status = orderStatus(updated);
  const owner = findUserById(updated.userId);
  if (notify !== false && owner) {
    updateUser(owner.id, (u) => ({
      ...u,
      notifications: [
        {
          id: uid("N"),
          createdAt: new Date().toISOString(),
          title: `Order #${updated.id} update`,
          body: `Status is now ${status}. Payment ref: ${updated.paymentRef || "—"}`,
          kind: "order",
          read: false,
        },
        ...u.notifications,
      ],
    }));
    sendOrderStatusEmail(owner, updated, status).catch((e) =>
      console.warn("[mail] order status failed", e.message),
    );
    notifyUser(findUserById(owner.id), {
      title: `Order #${updated.id} update`,
      body: `Status is now ${status}`,
      data: { kind: "order", orderId: updated.id, status },
    }).catch(() => {});
  }
  res.json({ ...updated, status });
});

app.delete("/api/admin/orders/:id", adminAuth, (req, res) => {
  if (!deleteOrder(req.params.id)) return res.status(404).json({ error: "Order not found" });
  res.json({ ok: true });
});

app.get("/api/admin/users", adminAuth, (_req, res) => {
  res.json(
    listUsers()
      .filter((u) => u.role !== "admin")
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        dealer: u.dealer,
        orderCount: u.orders?.length || 0,
        createdAt: u.createdAt || null,
      })),
  );
});

app.patch("/api/admin/users/:id", adminAuth, async (req, res) => {
  const target = findUserById(req.params.id);
  if (!target || target.role === "admin") return res.status(404).json({ error: "User not found" });
  const { name, phone, email, role, notify } = req.body ?? {};
  if (email) {
    const clash = findUserByEmail(String(email).trim().toLowerCase());
    if (clash && clash.id !== target.id) {
      return res.status(409).json({ error: "Email already in use" });
    }
  }
  if (role && !["customer", "dealer"].includes(role)) {
    return res.status(400).json({ error: "Role must be customer or dealer" });
  }
  const user = updateUser(target.id, (u) => ({
    ...u,
    name: name?.trim() || u.name,
    phone: phone != null ? String(phone) : u.phone,
    email: email ? String(email).trim().toLowerCase() : u.email,
    role: role || u.role,
  }));
  if (notify !== false) {
    sendAccountUpdateEmail(user, "An admin updated your account details.").catch((e) =>
      console.warn("[mail] account update failed", e.message),
    );
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    dealer: user.dealer,
    orderCount: user.orders?.length || 0,
  });
});

app.delete("/api/admin/users/:id", adminAuth, (req, res) => {
  const target = findUserById(req.params.id);
  if (!target || target.role === "admin") return res.status(404).json({ error: "User not found" });
  if (!deleteUser(req.params.id)) return res.status(400).json({ error: "Could not delete user" });
  res.json({ ok: true });
});

app.patch("/api/admin/dealers/:userId", adminAuth, async (req, res) => {
  const target = findUserById(req.params.userId);
  if (!target || target.role === "admin") return res.status(404).json({ error: "User not found" });
  const { businessName, gstin, city, businessType, status, notify } = req.body ?? {};
  if (status && !["pending", "approved", "rejected", "none"].includes(status)) {
    return res.status(400).json({ error: "Invalid dealer status" });
  }
  const user = updateUser(target.id, (u) => {
    const nextStatus = status || u.dealer?.status || "pending";
    return {
      ...u,
      role: nextStatus === "approved" ? "dealer" : nextStatus === "none" ? "customer" : u.role === "dealer" ? "dealer" : u.role,
      dealer: {
        ...(u.dealer || {}),
        businessName: businessName != null ? String(businessName).trim() : u.dealer?.businessName || "",
        gstin: gstin != null ? String(gstin).trim().toUpperCase() : u.dealer?.gstin || "",
        city: city != null ? String(city).trim() : u.dealer?.city || "",
        businessType: businessType != null ? String(businessType).trim() : u.dealer?.businessType || "",
        status: nextStatus,
        reviewedAt: status ? new Date().toISOString() : u.dealer?.reviewedAt,
      },
    };
  });
  if (notify !== false && status && ["approved", "rejected"].includes(status)) {
    sendDealerStatusEmail(user, status).catch((e) => console.warn("[mail] dealer status failed", e.message));
  }
  res.json(publicUser(user));
});

app.post("/api/admin/dealers/:userId/:action", adminAuth, async (req, res) => {
  const action = req.params.action;
  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "Use approve or reject" });
  }
  const target = findUserById(req.params.userId);
  if (!target || target.role === "admin") {
    return res.status(404).json({ error: "User not found" });
  }
  const status = action === "approve" ? "approved" : "rejected";
  const user = updateUser(target.id, (u) => ({
    ...u,
    role: action === "approve" ? "dealer" : u.role,
    dealer: {
      ...(u.dealer || {}),
      status,
      reviewedAt: new Date().toISOString(),
    },
    notifications: [
      {
        id: uid("N"),
        createdAt: new Date().toISOString(),
        title: action === "approve" ? "Dealer approved" : "Dealer application update",
        body:
          action === "approve"
            ? "Your dealer account is approved. Wholesale pricing is now active."
            : "Your dealer application was not approved. Contact support for details.",
        kind: "dealer",
        read: false,
      },
      ...u.notifications,
    ],
  }));
  sendDealerStatusEmail(user, status).catch((e) => console.warn("[mail] dealer status failed", e.message));
  notifyUser(user, {
    title: status === "approved" ? "Dealer approved" : "Dealer application update",
    body:
      status === "approved"
        ? "Wholesale pricing is now active in AquaNest."
        : "Your dealer application was not approved.",
    data: { kind: "dealer", status },
  }).catch(() => {});
  res.json(publicUser(user));
});

app.delete("/api/admin/dealers/:userId", adminAuth, async (req, res) => {
  const target = findUserById(req.params.userId);
  if (!target || target.role === "admin") return res.status(404).json({ error: "User not found" });
  const user = updateUser(target.id, (u) => ({
    ...u,
    role: "customer",
    dealer: {
      status: "none",
      businessName: "",
      gstin: "",
      city: "",
      businessType: "",
    },
  }));
  sendAccountUpdateEmail(user, "Your dealer profile was removed by an admin.").catch((e) =>
    console.warn("[mail] dealer delete failed", e.message),
  );
  res.json(publicUser(user));
});

app.get("/api/me", auth, (req, res) => {
  res.json(publicUser(req.user));
});

app.patch("/api/me", auth, (req, res) => {
  const { name, phone } = req.body ?? {};
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    name: name?.trim() || u.name,
    phone: phone != null ? String(phone) : u.phone,
  }));
  res.json(publicUser(user));
});

app.get("/api/cart", auth, (req, res) => {
  res.json(cartView(req.user));
});

app.post("/api/cart/items", auth, (req, res) => {
  const { productId, qty = 1 } = req.body ?? {};
  const product = getProduct(productId);
  if (!product) return res.status(404).json({ error: "Product not found" });
  if (product.stock <= 0) return res.status(400).json({ error: "Out of stock" });
  const user = updateUser(req.user.id, (u) => {
    const existing = u.cart.find((l) => l.productId === productId);
    const nextQty = clampQty((existing?.qty ?? 0) + Number(qty), product.stock);
    const cart = existing
      ? u.cart.map((l) => (l.productId === productId ? { ...l, qty: nextQty } : l))
      : [...u.cart, { productId, qty: nextQty }];
    return { ...u, cart };
  });
  res.json(cartView(user));
});

app.patch("/api/cart/items/:productId", auth, (req, res) => {
  const product = getProduct(req.params.productId);
  if (!product) return res.status(404).json({ error: "Product not found" });
  const nextQty = clampQty(Number(req.body?.qty ?? 0), product.stock);
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    cart:
      nextQty <= 0
        ? u.cart.filter((l) => l.productId !== req.params.productId)
        : u.cart.map((l) => (l.productId === req.params.productId ? { ...l, qty: nextQty } : l)),
  }));
  res.json(cartView(user));
});

app.delete("/api/cart/items/:productId", auth, (req, res) => {
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    cart: u.cart.filter((l) => l.productId !== req.params.productId),
  }));
  res.json(cartView(user));
});

app.post("/api/wishlist/:productId", auth, (req, res) => {
  const user = updateUser(req.user.id, (u) => {
    const on = u.wishlist.includes(req.params.productId);
    return {
      ...u,
      wishlist: on ? u.wishlist.filter((id) => id !== req.params.productId) : [req.params.productId, ...u.wishlist],
    };
  });
  res.json({ wishlist: user.wishlist });
});

app.get("/api/addresses", auth, (req, res) => {
  res.json(req.user.addresses);
});

app.post("/api/addresses", auth, (req, res) => {
  const a = req.body ?? {};
  if (!a.name || !a.line1 || !a.city || !a.pincode) {
    return res.status(400).json({ error: "Name, address, city and pincode are required" });
  }
  const address = {
    id: uid("A"),
    label: a.label || "Home",
    name: a.name,
    phone: a.phone || req.user.phone,
    line1: a.line1,
    line2: a.line2 || "",
    city: a.city,
    state: a.state || "",
    pincode: String(a.pincode),
  };
  const user = updateUser(req.user.id, (u) => ({ ...u, addresses: [...u.addresses, address] }));
  res.status(201).json(user.addresses);
});

app.delete("/api/addresses/:id", auth, (req, res) => {
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    addresses: u.addresses.filter((a) => a.id !== req.params.id),
  }));
  res.json(user.addresses);
});

app.get("/api/orders", auth, (req, res) => {
  res.json(req.user.orders.map((o) => ({ ...o, status: orderStatus(o) })));
});

app.post("/api/orders", auth, async (req, res) => {
  const { addressId, paymentMethod = "COD", paymentRef = "COD" } = req.body ?? {};
  const address = req.user.addresses.find((a) => a.id === addressId);
  if (!address) return res.status(400).json({ error: "Select a delivery address" });
  if (!req.user.cart.length) return res.status(400).json({ error: "Cart is empty" });
  const dealer = isApprovedDealer(req.user);
  const lines = req.user.cart
    .map((l) => ({ product: getProduct(l.productId), qty: l.qty }))
    .filter((l) => l.product);
  const totals = cartTotals(lines, dealer);
  const order = {
    id: uid("AN"),
    createdAt: new Date().toISOString(),
    items: lines.map((l) => ({
      productId: l.product.id,
      name: l.product.name,
      image: l.product.image,
      qty: l.qty,
      unitPrice: unitPrice(l.product, dealer),
    })),
    subtotal: totals.subtotal,
    delivery: totals.delivery,
    total: totals.total,
    address,
    paymentMethod,
    paymentRef,
    isDealerOrder: dealer,
    cancelled: false,
  };
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    orders: [order, ...u.orders],
    cart: [],
    notifications: [
      {
        id: uid("N"),
        createdAt: new Date().toISOString(),
        title: "Order confirmed",
        body: `Order #${order.id} has been placed.`,
        kind: "order",
        read: false,
      },
      ...u.notifications,
    ],
  }));
  let mail = { ok: false };
  try {
    mail = await sendOrderEmail(user, order);
  } catch (e) {
    console.warn("[mail] order failed", e.message);
    mail = { ok: false, error: e.message };
  }
  notifyUser(user, {
    title: "Order confirmed",
    body: `Order #${order.id} · ₹${order.total}`,
    data: { kind: "order", orderId: order.id },
  }).catch(() => {});
  res.status(201).json({ ...order, status: orderStatus(order), cart: cartView(user), mail });
});

app.post("/api/orders/:id/cancel", auth, (req, res) => {
  const existing = req.user.orders.find((o) => o.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Order not found" });
  const status = orderStatus(existing);
  if (!["placed", "confirmed"].includes(status)) {
    return res.status(400).json({ error: "This order can no longer be cancelled" });
  }
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    orders: u.orders.map((o) => (o.id === req.params.id ? { ...o, cancelled: true } : o)),
  }));
  const order = user.orders.find((o) => o.id === req.params.id);
  res.json({ ...order, status: orderStatus(order) });
});

app.get("/api/bookings", auth, (req, res) => {
  res.json(req.user.bookings);
});

app.post("/api/bookings/:id/cancel", auth, (req, res) => {
  const existing = req.user.bookings.find((b) => b.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "Booking not found" });
  if (existing.status !== "requested") {
    return res.status(400).json({ error: "This booking can no longer be cancelled" });
  }
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    bookings: u.bookings.map((b) => (b.id === req.params.id ? { ...b, status: "cancelled" } : b)),
  }));
  res.json(user.bookings.find((b) => b.id === req.params.id));
});

app.post("/api/dealer", auth, (req, res) => {
  const { businessName, gstin, city, businessType } = req.body ?? {};
  if (!businessName || !gstin || !city) {
    return res.status(400).json({ error: "Business name, GSTIN and city are required" });
  }
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    role: u.role === "customer" ? "dealer" : u.role,
    dealer: {
      status: "pending",
      businessName: String(businessName).trim(),
      gstin: String(gstin).trim().toUpperCase(),
      city: String(city).trim(),
      businessType: businessType || "Retail shop",
      submittedAt: new Date().toISOString(),
    },
  }));
  res.json(publicUser(user));
});

app.post("/api/bookings", auth, (req, res) => {
  const { type, date, slot, address, issue, product } = req.body ?? {};
  if (!type || !date || !slot || !address) {
    return res.status(400).json({ error: "Service type, date, slot and address are required" });
  }
  const booking = {
    id: uid("SR"),
    createdAt: new Date().toISOString(),
    type,
    date,
    slot,
    address,
    issue: issue || "",
    product: product || "",
    status: "requested",
  };
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    bookings: [booking, ...u.bookings],
    notifications: [
      {
        id: uid("N"),
        createdAt: new Date().toISOString(),
        title: "Service booked",
        body: `Your ${String(type).replace("-", " ")} visit is requested for ${date}, ${slot}.`,
        kind: "service",
        read: false,
      },
      ...u.notifications,
    ],
  }));
  res.status(201).json(user.bookings[0]);
});

app.get("/api/notifications", auth, (req, res) => {
  res.json(req.user.notifications);
});

app.post("/api/notifications/read", auth, (req, res) => {
  const user = updateUser(req.user.id, (u) => ({
    ...u,
    notifications: u.notifications.map((n) => ({ ...n, read: true })),
  }));
  res.json(user.notifications);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

async function runAiSocialWorkflow() {
  const post = await generateDailySocialPost();
  // Always publish to the mobile app when scheduled / Run now
  post.status = "published";
  post.publishedAt = post.publishedAt || new Date().toISOString();
  addSocialPost(post);
  const forMail = { ...post, imageUrl: resolvePostImageUrl(post) };
  sendSocialPostEmail(forMail).catch((e) => console.warn("[mail] ai post failed", e.message));
  console.log(
    `[ai-social] published · ${post.product?.name} · ${post.imageSource} · seed=${post.seed} → app`,
  );
  return post;
}

function dayKeyLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startDailyAiSocialSchedule() {
  if (String(process.env.AI_POST_SCHEDULE || "1") === "0") {
    console.log("[ai-social] daily schedule off (AI_POST_SCHEDULE=0)");
    return;
  }
  let lastRunDate = "";
  const alreadyRanToday = () =>
    listSocialPosts(40).some((p) => {
      if (p.status !== "published" && p.status !== "live") return false;
      const t = p.publishedAt || p.createdAt;
      if (!t) return false;
      return dayKeyLocal(new Date(t)) === dayKeyLocal();
    });

  const tryRun = async (reason) => {
    const hour = Number(process.env.AI_POST_HOUR ?? 9);
    const now = new Date();
    const key = dayKeyLocal(now);
    if (lastRunDate === key || alreadyRanToday()) return false;
    if (now.getHours() < hour) return false;
    // Window: from scheduled hour onward same day (catch-up if server was down at :00)
    lastRunDate = key;
    try {
      await runAiSocialWorkflow();
      console.log(`[ai-social] schedule fire (${reason}) · hour=${hour}`);
      return true;
    } catch (err) {
      lastRunDate = "";
      console.warn("[ai-social] scheduled run failed:", err.message);
      return false;
    }
  };

  // Catch-up shortly after boot if today's hour already passed
  setTimeout(() => tryRun("startup-catchup"), 8_000);
  setInterval(() => tryRun("timer"), 60_000);
  const hour = Number(process.env.AI_POST_HOUR ?? 9);
  console.log(
    `[ai-social] daily schedule on · ${hour}:00 local (catch-up if missed) · openai=${process.env.OPENAI_API_KEY ? "yes" : "fallback"}`,
  );
}

await seedDemoUser();
await seedAdminUser();
const mailBoot = await verifyMail();
startDailyAiSocialSchedule();

app.listen(PORT, "0.0.0.0", () => {
  const rzp = razorpayPublicConfig();
  console.log(`AquaNest API running on http://localhost:${PORT}`);
  console.log(`  Razorpay: ${rzp.mode}${rzp.configured ? " (keys set)" : " (demo — set RAZORPAY_* in backend/.env)"}`);
  console.log(`  Firebase: ${firebaseStatus().configured ? "ready" : "optional / not configured"}`);
  console.log(
    `  Mail: ${mailBoot.mode}${mailBoot.ok ? (mailBoot.verified ? " verified" : "") : ` ERROR — ${mailBoot.error || "check SMTP_*"}`}`,
  );
  console.log(`  Admin: ${process.env.ADMIN_EMAIL || "admin@aquanest.in"} (panel login only)`);
  const push = pushStatus();
  console.log(`  Push: VAPID ${push.vapid ? "ready" : "off"} · FCM ${push.fcm ? "ready" : "off"}`);
  const ai = aiSocialStatus();
  console.log(`  AI posts: schedule ${ai.scheduleEnabled ? `daily ${ai.scheduleHour}:00` : "off"} · OpenAI ${ai.openai ? "on" : "template+pollinations"}`);
});
