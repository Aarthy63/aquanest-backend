import Razorpay from "razorpay";
import crypto from "crypto";

let client;

export function razorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpay() {
  if (!razorpayConfigured()) return null;
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
}

export async function createRazorpayOrder({ amountInr, receipt, notes = {} }) {
  const rzp = getRazorpay();
  if (!rzp) {
    return {
      mode: "test",
      id: `order_test_${Date.now()}`,
      amount: Math.round(amountInr * 100),
      currency: "INR",
      receipt,
      keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_local",
    };
  }
  const order = await rzp.orders.create({
    amount: Math.round(amountInr * 100),
    currency: "INR",
    receipt: String(receipt).slice(0, 40),
    notes,
  });
  const keyId = process.env.RAZORPAY_KEY_ID;
  return {
    mode: String(keyId).startsWith("rzp_live_") ? "live" : "test",
    id: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    keyId,
  };
}

export function verifyRazorpayPayment({ orderId, paymentId, signature }) {
  if (!razorpayConfigured()) {
    // Local test mode — accept synthetic refs
    return String(paymentId || "").startsWith("pay_test_") || String(orderId || "").startsWith("order_test_");
  }
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");
  return expected === signature;
}

export function razorpayPublicConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || null;
  const configured = razorpayConfigured();
  let mode = "demo";
  if (configured) {
    mode = String(keyId).startsWith("rzp_live_") ? "live" : "test";
  }
  return {
    configured,
    keyId,
    mode,
  };
}
