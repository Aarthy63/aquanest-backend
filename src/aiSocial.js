import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { queryCatalog } from "./catalog.js";
import { listSocialPosts } from "./db.js";

const dir = dirname(fileURLToPath(import.meta.url));
const postsDir = join(dir, "..", "data", "ai-posts");

const SCENES = [
  "modern bright Indian kitchen counter, soft morning daylight",
  "living room sideboard with houseplants, warm afternoon light",
  "clean studio backdrop ocean teal and white, soft shadows",
  "apartment dining table with glass of water, lifestyle shot",
  "premium showroom shelf display, subtle reflections",
  "balcony breakfast setup with fruit bowl, natural light",
  "marble countertop with stainless RO purifier, lifestyle photo",
  "family kitchen sink area, fresh drinking water theme",
];

const ANGLES = [
  "three-quarter product hero angle",
  "front-facing product portrait",
  "lifestyle wide shot with product in focus",
  "close-up detail of purifier panel and spout",
];

const CAPTION_HOOKS = [
  "Clean water, every day 💧",
  "Pure sip. Happy home. 🏡",
  "Because your family deserves safer water.",
  "Upgrade your kitchen’s most important appliance.",
  "Taste the difference of true purification.",
  "Fresh water. Fresh start. ✨",
];

const EXTRA_TAGS = [
  "#PureWater",
  "#HomeUpgrade",
  "#FamilyHealth",
  "#DrinkSafe",
  "#KitchenGoals",
  "#WaterSafety",
  "#AquaLife",
  "#ROSystem",
  "#HealthyLiving",
  "#MadeForIndia",
];

/** Curated lifestyle URLs — rotated so each post looks different without paid AI. */
const LIFESTYLE_POOL = [
  "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1559827291-72ee739d0d9a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1564419320461-687298aba27e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1542013936693-884638332954?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1584622781564-1d987f7333c1?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80",
];

function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function ensurePostsDir() {
  if (!existsSync(postsDir)) mkdirSync(postsDir, { recursive: true });
}

function pickProduct(excludeIds = []) {
  const list = queryCatalog({});
  if (!list.length) {
    return {
      id: "P0",
      name: "AquaNest RO Purifier",
      brand: "AquaNest",
      category: "purifiers",
      price: 12999,
      image: LIFESTYLE_POOL[0],
    };
  }
  const fresh = list.filter((p) => !excludeIds.includes(p.id));
  const pool = fresh.length ? fresh : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function templateCaption(product) {
  const name = product.name || "AquaNest purifier";
  const brand = product.brand || "AquaNest";
  const price = product.price ? `₹${Number(product.price).toLocaleString("en-IN")}` : "";
  const hook = pickOne(CAPTION_HOOKS);
  const lines = [
    hook,
    "",
    `Meet the ${name} by ${brand}${price ? ` — from ${price}` : ""}.`,
    pickOne([
      "Trusted purification for Indian homes. Free installation this week on select models.",
      "Multi-stage filtration for clearer taste and everyday peace of mind.",
      "Built for Indian water conditions — shop offers inside the AquaNest app.",
      "Service-ready support + genuine parts. Order in the AquaNest app today.",
    ]),
    "",
    pickOne(["Shop in the AquaNest app.", "Tap Shop in AquaNest to order.", "Available now in AquaNest."]),
  ];
  const baseTags = ["#AquaNest", "#CleanWater", "#ROPurifier", "#WaterPurifier", "#HealthyHome", "#IndianHomes"];
  const extras = [...EXTRA_TAGS].sort(() => Math.random() - 0.5).slice(0, 3);
  if (product.category) extras.push(`#${String(product.category).replace(/[^a-zA-Z0-9]/g, "")}`);
  return { caption: lines.join("\n"), hashtags: [...baseTags, ...extras] };
}

/** Skip OpenAI after billing/quota errors so logs stay clean. */
let openaiDisabledReason = null;

function openaiEnabled() {
  if (openaiDisabledReason) return false;
  if (String(process.env.OPENAI_AI_POSTS || "0").trim() !== "1") return false;
  return !!process.env.OPENAI_API_KEY;
}

function disableOpenAI(reason) {
  if (!openaiDisabledReason) {
    openaiDisabledReason = reason;
    console.warn(`[ai-social] OpenAI disabled for this process: ${reason}`);
  }
}

async function openaiCaption(product) {
  if (!openaiEnabled()) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 1.1,
      messages: [
        {
          role: "system",
          content:
            'You write short Instagram captions for AquaNest, an Indian water-purifier brand. Return JSON only: {"caption": string, "hashtags": string[]}. Caption under 400 chars, 6-10 hashtags. Make each caption unique.',
        },
        {
          role: "user",
          content: `Product: ${product.name}. Brand: ${product.brand}. Category: ${product.category}. Price: ₹${product.price}. Seed: ${Date.now()}.`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429 || /insufficient|quota|billing|credits/i.test(text)) {
      disableOpenAI("no credits / rate limited (429)");
      return null;
    }
    console.warn("[ai-social] caption skipped:", res.status);
    return null;
  }
  const data = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  return {
    caption: String(parsed.caption || "").trim(),
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((h) => (String(h).startsWith("#") ? String(h) : `#${h}`))
      : [],
  };
}

async function openaiImage(prompt) {
  if (!openaiEnabled()) return null;
  // Images off unless explicitly enabled (needs billed image model access)
  if (String(process.env.OPENAI_IMAGE || "0").trim() !== "1") return null;

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt: prompt.slice(0, 900), n: 1, size: "1024x1024" }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429 || /insufficient|quota|billing|credits/i.test(text)) {
      disableOpenAI("no credits / rate limited (429)");
      return null;
    }
    console.warn("[ai-social] openai image skipped:", res.status, text.slice(0, 120));
    return null;
  }
  const data = await res.json();
  return data.data?.[0]?.url || null;
}

async function downloadToPost(url, seed, source) {
  const res = await fetch(url, {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache", "User-Agent": "AquaNest/1.0" },
  });
  if (!res.ok) throw new Error(`${source} download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800) throw new Error(`${source} empty image`);
  ensurePostsDir();
  const fileName = `post-${Date.now()}-${seed}.jpg`;
  const filePath = join(postsDir, fileName);
  writeFileSync(filePath, buf);
  return {
    localPath: filePath,
    imagePath: `/media/ai-posts/${fileName}`,
    // Keep original CDN URL so Render redeploys don't break images
    remoteUrl: String(url).split("?")[0].includes("pollinations.ai")
      ? url
      : String(url).replace(/[?&]cb=[^&]+/, "").replace(/\?$/, "") || url,
    source,
    seed,
  };
}

async function pollinationsImage(prompt, seed) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&enhance=true&seed=${seed}&ts=${Date.now()}`;
  return downloadToPost(url, seed, "pollinations");
}

/** Always unique file — picsum + lifestyle pool (works without OpenAI credits). */
async function uniqueStockImage(product, seed) {
  const attempts = [
    `https://picsum.photos/seed/aquanest-${seed}/1024/1024`,
    `https://picsum.photos/seed/water-${seed + 91}/1024/1024`,
    LIFESTYLE_POOL[seed % LIFESTYLE_POOL.length],
    LIFESTYLE_POOL[(seed + 3) % LIFESTYLE_POOL.length],
    product.image,
  ].filter(Boolean);

  let lastErr;
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const src = i < 2 ? "picsum" : i < 4 ? "lifestyle" : "catalog-file";
      return await downloadToPost(`${attempts[i]}${attempts[i].includes("?") ? "&" : "?"}cb=${seed}-${i}`, seed + i, src);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("No image source worked");
}

/**
 * Generate one social post: unique image file every run + caption/hashtags.
 * Published to the mobile app (product-wise).
 */
export async function generateDailySocialPost() {
  const recent = listSocialPosts(12).map((p) => p.product?.id).filter(Boolean);
  const recentImageSeeds = new Set(listSocialPosts(20).map((p) => p.seed).filter((n) => n != null));
  const product = pickProduct(recent);
  const scene = pickOne(SCENES);
  const angle = pickOne(ANGLES);
  let seed = Math.floor(Math.random() * 1_000_000_000) + (Date.now() % 100_000);
  while (recentImageSeeds.has(seed)) seed += 137;

  const imagePrompt = [
    "Unique Instagram product marketing photo,",
    `${product.name} ${product.category || "water purifier"} by ${product.brand},`,
    `${angle}, ${scene},`,
    "AquaNest branding vibe, ocean teal accents, no text overlay, photorealistic,",
    `variation id ${seed}`,
  ].join(" ");

  let captionResult = templateCaption(product);
  try {
    const aiCaption = await openaiCaption(product);
    if (aiCaption?.caption) captionResult = aiCaption;
  } catch {
    // keep template
  }

  let image = null;
  try {
    const dalle = await openaiImage(imagePrompt);
    if (dalle) image = await downloadToPost(dalle, seed, "openai");
  } catch {
    // ignore
  }
  if (!image) {
    try {
      image = await pollinationsImage(imagePrompt, seed);
    } catch {
      image = await uniqueStockImage(product, seed);
    }
  }
  if (!image?.imagePath) {
    image = await uniqueStockImage(product, seed + 99);
  }

  const fullCaption = [captionResult.caption, "", (captionResult.hashtags || []).join(" ")].join("\n").trim();

  return {
    id: `SP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    status: "published",
    product: {
      id: product.id,
      name: product.name,
      brand: product.brand,
      price: product.price,
      category: product.category,
    },
    caption: captionResult.caption,
    hashtags: captionResult.hashtags || [],
    fullCaption,
    imagePath: image.imagePath,
    imageUrl: image.remoteUrl || image.imagePath,
    imagePrompt,
    imageSource: image.source,
    imageLocalPath: image.localPath,
    seed,
    ai: {
      caption: openaiEnabled(),
      image: image.source,
      openai: openaiEnabled() ? "on" : openaiDisabledReason || "off",
    },
  };
}

export function removeLocalPostImage(post) {
  const path = post?.imageLocalPath;
  if (!path) return;
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch (err) {
    console.warn("[ai-social] delete image file:", err.message);
  }
}

export function resolvePostImageUrl(post, req) {
  if (!post) return null;
  // Prefer durable absolute URLs (CDN / previous resolve) over ephemeral /media on Render disk
  if (post.imageUrl && /^https?:\/\//i.test(post.imageUrl) && !/localhost|127\.0\.0\.1/i.test(post.imageUrl)) {
    return post.imageUrl;
  }
  if (post.imagePath) {
    const host = req?.get?.("host");
    const proto =
      req?.headers?.["x-forwarded-proto"] ||
      (host && !host.includes("localhost") ? "https" : null) ||
      req?.protocol ||
      "http";
    if (host) return `${proto}://${host}${post.imagePath}`;
    const base = (
      process.env.RENDER_EXTERNAL_URL ||
      process.env.APP_PUBLIC_URL ||
      `http://localhost:${process.env.PORT || 4000}`
    ).replace(/\/$/, "");
    return `${base}${post.imagePath}`;
  }
  return post.imageUrl || null;
}

export function aiSocialStatus() {
  const hour = Number(process.env.AI_POST_HOUR ?? 9);
  const now = new Date();
  const ranToday = listSocialPosts(40).some((p) => {
    if (p.status !== "published" && p.status !== "live") return false;
    const t = p.publishedAt || p.createdAt;
    if (!t) return false;
    const d = new Date(t);
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  });
  let next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
  return {
    openai: openaiEnabled(),
    openaiMode:
      String(process.env.OPENAI_AI_POSTS || "0").trim() === "1"
        ? openaiDisabledReason || "enabled"
        : "template+stock (set OPENAI_AI_POSTS=1 when you have credits)",
    scheduleHour: hour,
    scheduleEnabled: String(process.env.AI_POST_SCHEDULE || "1") !== "0",
    ranToday,
    nextRunAt: next.toISOString(),
    serverLocalHour: now.getHours(),
    serverLocalTime: now.toLocaleString(),
  };
}
