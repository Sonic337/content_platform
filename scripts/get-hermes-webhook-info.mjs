#!/usr/bin/env node
// Usage: node scripts/get-hermes-webhook-info.mjs
//
// Reads TELEGRAM_BOT_TOKEN from .env.local and calls getWebhookInfo.
// Prints the raw Telegram JSON response verbatim — use this to verify
// webhook status, check the last error message, and see pending update counts.

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
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Error: TELEGRAM_BOT_TOKEN is not set in .env.local or environment.");
  process.exit(1);
}

// ── Call getWebhookInfo ───────────────────────────────────────────────────────
const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const raw = await res.text();
console.log("Telegram raw response:");
console.log(raw);
