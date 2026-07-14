#!/usr/bin/env node
// Usage: node scripts/set-hermes-webhook.mjs <public-url>
// Example: node scripts/set-hermes-webhook.mjs https://your-app.vercel.app
//
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env.local.
// Registers the Telegram webhook so Telegram delivers updates to our route.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Load .env.local ──────────────────────────────────────────────────────────
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env.local not found — rely on existing process.env
}

// ── Validate ─────────────────────────────────────────────────────────────────
const publicUrl = process.argv[2];
if (!publicUrl) {
  console.error("Error: pass the public URL as the first argument.");
  console.error("  node scripts/set-hermes-webhook.mjs https://your-app.vercel.app");
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error("Error: TELEGRAM_BOT_TOKEN is not set in .env.local or environment.");
  process.exit(1);
}
if (!secret) {
  console.error("Error: TELEGRAM_WEBHOOK_SECRET is not set in .env.local or environment.");
  process.exit(1);
}

const webhookUrl = `${publicUrl.replace(/\/$/, "")}/api/hermes-webhook`;

// ── Call setWebhook ───────────────────────────────────────────────────────────
console.log(`Registering webhook → ${webhookUrl}`);

const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;
const res = await fetch(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
  }),
});

const raw = await res.text();
console.log("\nTelegram raw response:");
console.log(raw);
