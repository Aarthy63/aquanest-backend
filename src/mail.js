import nodemailer from "nodemailer";
import { firebaseStatus } from "./firebase.js";

let transporter;
let verified = false;

function smtpPass() {
  return String(process.env.SMTP_PASS || "").replace(/\s+/g, "");
}

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host || !process.env.SMTP_USER || !smtpPass()) {
    transporter = null;
    return null;
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {
      user: String(process.env.SMTP_USER).trim(),
      pass: smtpPass(),
    },
    tls: { minVersion: "TLSv1.2" },
  });
  return transporter;
}

export async function verifyMail() {
  const tx = getTransporter();
  if (!tx) {
    console.log("[mail] SMTP not configured — emails log to console");
    return { ok: true, mode: "console" };
  }
  try {
    await tx.verify();
    verified = true;
    console.log(`[mail] SMTP ready (${process.env.SMTP_HOST}) as ${process.env.SMTP_USER}`);
    return { ok: true, mode: "smtp", verified: true };
  } catch (err) {
    verified = false;
    console.warn("[mail] SMTP verify failed:", err.message);
    return { ok: false, mode: "smtp", error: err.message };
  }
}

export function mailStatus() {
  return {
    configured: !!getTransporter(),
    verified,
    host: process.env.SMTP_HOST || null,
    user: process.env.SMTP_USER || null,
    redirectTo: process.env.MAIL_REDIRECT_TO || null,
    copyTo: process.env.MAIL_COPY_TO || null,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatINR(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Branded AquaNest HTML shell — matches app ocean theme.
 */
function emailLayout({ title, preheader, bodyHtml, intended }) {
  const intendedBlock = intended
    ? `<p style="margin:0 0 16px;font-size:12px;line-height:1.4;color:#5a7380;">Intended recipient: <strong style="color:#134e63;">${escapeHtml(intended)}</strong></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#e8f1f4;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#122a36;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || title)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8f1f4;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #d5e3e9;box-shadow:0 12px 40px rgba(15,42,54,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1b7c98 0%,#134e63 100%);padding:28px 28px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">AquaNest</td>
                  <td align="right" style="font-size:11px;font-weight:700;color:#d7eef5;text-transform:uppercase;letter-spacing:0.08em;">Pure water</td>
                </tr>
              </table>
              <h1 style="margin:18px 0 0;font-size:24px;line-height:1.25;font-weight:700;color:#ffffff;">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${intendedBlock}
              ${bodyHtml}
              <p style="margin:28px 0 0;font-size:14px;line-height:1.5;color:#5a7380;">— AquaNest</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;background:#f4fafc;border-top:1px solid #e6eef1;font-size:11px;line-height:1.5;color:#7a929e;">
              You’re receiving this because you shop or booked service with AquaNest.
              Track orders anytime in the AquaNest app under <strong>My orders</strong>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRow(label, value) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #e6eef1;font-size:13px;color:#5a7380;width:38%;">${escapeHtml(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid #e6eef1;font-size:14px;font-weight:600;color:#122a36;text-align:right;">${value}</td>
  </tr>`;
}

/**
 * Send transactional email.
 * MAIL_REDIRECT_TO — deliver to your inbox while keeping intended recipient in the design
 * MAIL_COPY_TO — BCC copy
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to) throw new Error("Missing email recipient");
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "AquaNest <noreply@aquanest.in>";
  const redirectTo = String(process.env.MAIL_REDIRECT_TO || "").trim();
  const copyTo = String(process.env.MAIL_COPY_TO || "").trim();

  const intended = String(to).trim().toLowerCase();
  let finalTo = intended;
  let finalSubject = subject;
  let finalText = text;
  let finalHtml = html || text;

  if (redirectTo) {
    finalTo = redirectTo;
    finalSubject = `[for ${intended}] ${subject}`;
    finalText = `Intended recipient: ${intended}\n\n${text || ""}`;
    // Re-wrap existing branded HTML with intended recipient already handled by templates,
    // or prepend if template didn't include it.
    if (!String(finalHtml).includes("Intended recipient")) {
      finalHtml = emailLayout({
        title: subject,
        preheader: subject,
        intended,
        bodyHtml: finalHtml,
      });
    }
  }

  const payload = {
    from,
    to: finalTo,
    subject: finalSubject,
    text: finalText,
    html: finalHtml,
  };
  if (copyTo && copyTo.toLowerCase() !== finalTo.toLowerCase()) {
    payload.bcc = copyTo;
  }

  const fb = firebaseStatus();
  if (fb.projectId) {
    payload.headers = {
      "X-AquaNest-Firebase-Project": fb.projectId,
    };
  }

  const tx = getTransporter();
  if (!tx) {
    console.log("[mail:dev]", { to: finalTo, intended, subject: finalSubject, text: finalText });
    return { ok: true, mode: "console", to: finalTo, intended };
  }
  try {
    const info = await tx.sendMail(payload);
    console.log(`[mail] sent → ${finalTo}${redirectTo ? ` (for ${intended})` : ""} · ${finalSubject} · ${info.messageId}`);
    return { ok: true, mode: "smtp", id: info.messageId, to: finalTo, intended };
  } catch (err) {
    console.warn(`[mail] failed → ${finalTo} · ${finalSubject}:`, err.message);
    throw err;
  }
}

export async function sendWelcomeEmail(user) {
  const name = user.name || "there";
  const intended = user.email;
  const text = `Hi ${name},\n\nYour AquaNest account is ready. Sign in anytime to shop purifiers and book service.\n\n— AquaNest`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#122a36;">Hi <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3d5561;">Your AquaNest account is ready. Sign in anytime to shop purifiers and book service.</p>
    <div style="margin:0;padding:14px 16px;background:#e7f3f7;border-radius:14px;border:1px solid #d5e3e9;">
      <p style="margin:0;font-size:13px;color:#134e63;font-weight:600;">Tip: Keep this email for your records.</p>
    </div>
  `;
  return sendMail({
    to: intended,
    subject: "Welcome to AquaNest",
    text,
    html: emailLayout({
      title: "Welcome to AquaNest",
      preheader: "Your account is ready — shop purifiers and book service.",
      intended: process.env.MAIL_REDIRECT_TO ? intended : null,
      bodyHtml,
    }),
  });
}

export async function sendOrderEmail(user, order) {
  const name = user.name || "there";
  const intended = user.email;
  const total = formatINR(order.total);
  const paymentRef = order.paymentRef || "—";
  const paymentMethod = order.paymentMethod || "Razorpay";
  const items = Array.isArray(order.items) ? order.items : [];
  const paid =
    paymentRef &&
    paymentRef !== "COD" &&
    !String(paymentMethod).toUpperCase().includes("COD");

  const text = [
    `Hi ${name},`,
    ``,
    paid ? `Payment received and order #${order.id} is confirmed for ${total}.` : `Order #${order.id} is confirmed for ${total}.`,
    `Payment method: ${paymentMethod}`,
    `Payment ref: ${paymentRef}`,
    ``,
    ...items.map((item) => `• ${item.name || item.productId} × ${item.qty} — ${formatINR((item.unitPrice || 0) * (item.qty || 1))}`),
    ``,
    `Track it anytime in My orders.`,
    ``,
    `— AquaNest`,
  ].join("\n");

  const itemRows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 0;font-size:13px;color:#122a36;">${escapeHtml(item.name || item.productId)} × ${escapeHtml(item.qty)}</td>
          <td style="padding:8px 0;font-size:13px;font-weight:600;color:#122a36;text-align:right;">${formatINR((item.unitPrice || 0) * (item.qty || 1))}</td>
        </tr>`,
    )
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#122a36;">Hi <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3d5561;">
      ${
        paid
          ? `Your <strong>payment was successful</strong> and order <strong>#${escapeHtml(order.id)}</strong> is confirmed for <strong>${escapeHtml(total)}</strong>.`
          : `Order <strong>#${escapeHtml(order.id)}</strong> is confirmed for <strong>${escapeHtml(total)}</strong>.`
      }
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#f4fafc;border-radius:16px;border:1px solid #d5e3e9;padding:4px 16px;">
      ${detailRow("Order ID", `#${escapeHtml(order.id)}`)}
      ${detailRow("Amount paid", `<span style="color:#1b7c98;">${escapeHtml(total)}</span>`)}
      ${detailRow("Payment method", escapeHtml(paymentMethod))}
      ${detailRow("Payment ref", `<span style="font-family:Consolas,monospace;font-size:12px;">${escapeHtml(paymentRef)}</span>`)}
      ${order.razorpayOrderId ? detailRow("Razorpay order", `<span style="font-family:Consolas,monospace;font-size:12px;">${escapeHtml(order.razorpayOrderId)}</span>`) : ""}
    </table>
    ${
      items.length
        ? `<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#134e63;text-transform:uppercase;letter-spacing:0.04em;">Items</p>
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${itemRows}</table>`
        : ""
    }
    <p style="margin:0;font-size:15px;line-height:1.6;color:#3d5561;">Track it anytime in <strong>My orders</strong>.</p>
  `;

  return sendMail({
    to: intended,
    subject: paid
      ? `Payment successful · Order #${order.id} · ${total}`
      : `Order confirmed #${order.id} · ${total}`,
    text,
    html: emailLayout({
      title: paid ? "Payment successful" : "Order confirmed",
      preheader: paid
        ? `Payment received for order #${order.id} — ${total}`
        : `Order #${order.id} confirmed for ${total}`,
      intended: process.env.MAIL_REDIRECT_TO ? intended : null,
      bodyHtml,
    }),
  });
}

export async function sendOrderStatusEmail(user, order, status) {
  const name = user.name || "there";
  const intended = user.email;
  const paymentRef = order.paymentRef || "—";
  const text = `Hi ${name},\n\nYour order #${order.id} is now "${status}".\nPayment ref: ${paymentRef}.\n\n— AquaNest`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#122a36;">Hi <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3d5561;">
      Your order <strong>#${escapeHtml(order.id)}</strong> is now
      <strong style="color:#1b7c98;">${escapeHtml(status)}</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;background:#f4fafc;border-radius:16px;border:1px solid #d5e3e9;padding:4px 16px;">
      ${detailRow("Order ID", `#${escapeHtml(order.id)}`)}
      ${detailRow("Status", escapeHtml(status))}
      ${detailRow("Payment ref", `<span style="font-family:Consolas,monospace;font-size:12px;">${escapeHtml(paymentRef)}</span>`)}
    </table>
  `;
  return sendMail({
    to: intended,
    subject: `Order #${order.id} update — ${status}`,
    text,
    html: emailLayout({
      title: "Order update",
      preheader: `Order #${order.id} is now ${status}`,
      intended: process.env.MAIL_REDIRECT_TO ? intended : null,
      bodyHtml,
    }),
  });
}

export async function sendDealerStatusEmail(user, status) {
  const approved = status === "approved";
  const name = user.name || "there";
  const intended = user.email;
  const text = approved
    ? `Hi ${name},\n\nYour dealer account is approved. Wholesale pricing is now active in the AquaNest app.\n\n— AquaNest`
    : `Hi ${name},\n\nYour dealer application was not approved. Contact support if you have questions.\n\n— AquaNest`;
  const bodyHtml = approved
    ? `<p style="margin:0 0 14px;font-size:16px;color:#122a36;">Hi <strong>${escapeHtml(name)}</strong>,</p>
       <p style="margin:0;font-size:15px;line-height:1.6;color:#3d5561;">Your dealer account is <strong style="color:#1f8a5b;">approved</strong>. Wholesale pricing is now active in the AquaNest app.</p>`
    : `<p style="margin:0 0 14px;font-size:16px;color:#122a36;">Hi <strong>${escapeHtml(name)}</strong>,</p>
       <p style="margin:0;font-size:15px;line-height:1.6;color:#3d5561;">Your dealer application was <strong style="color:#b42318;">not approved</strong>. Contact support if you have questions.</p>`;
  return sendMail({
    to: intended,
    subject: approved ? "Dealer account approved" : "Dealer application update",
    text,
    html: emailLayout({
      title: approved ? "Dealer approved" : "Dealer update",
      preheader: approved ? "Wholesale pricing is now active" : "Dealer application update",
      intended: process.env.MAIL_REDIRECT_TO ? intended : null,
      bodyHtml,
    }),
  });
}

export async function sendSocialPostEmail(post) {
  const to =
    process.env.MAIL_REDIRECT_TO ||
    process.env.MAIL_COPY_TO ||
    process.env.SMTP_USER ||
    process.env.ADMIN_EMAIL;
  if (!to) {
    console.log("[mail] social post (no recipient)\n", post.fullCaption);
    return { ok: true, mode: "console" };
  }
  const hashtags = (post.hashtags || []).join(" ");
  const text = [
    "AquaNest daily AI social post",
    "",
    post.caption,
    "",
    hashtags,
    "",
    `Image: ${post.imageUrl}`,
    `Product: ${post.product?.name || "—"}`,
  ].join("\n");
  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3d5561;white-space:pre-wrap;">${escapeHtml(post.caption)}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#0B6E99;">${escapeHtml(hashtags)}</p>
    ${
      post.imageUrl
        ? `<img src="${escapeHtml(post.imageUrl)}" alt="AI product post" width="480" style="max-width:100%;border-radius:12px;display:block;" />`
        : ""
    }
    <p style="margin:16px 0 0;font-size:12px;color:#5a7380;">Product: ${escapeHtml(post.product?.name || "—")} · Source: ${escapeHtml(post.imageSource || "—")}</p>
  `;
  return sendMail({
    to,
    subject: `AquaNest AI post · ${post.product?.name || "daily"}`,
    text,
    html: emailLayout({
      title: "Daily AI social post",
      preheader: (post.caption || "").slice(0, 80),
      bodyHtml,
    }),
  });
}

export async function sendAccountUpdateEmail(user, note) {
  const name = user.name || "there";
  const intended = user.email;
  const text = `Hi ${name},\n\n${note}\n\n— AquaNest`;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:16px;color:#122a36;">Hi <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#3d5561;">${escapeHtml(note)}</p>
  `;
  return sendMail({
    to: intended,
    subject: "Your AquaNest account was updated",
    text,
    html: emailLayout({
      title: "Account updated",
      preheader: note,
      intended: process.env.MAIL_REDIRECT_TO ? intended : null,
      bodyHtml,
    }),
  });
}
