#!/usr/bin/env node
// Run locally after telegram-login.mjs has been run and TELEGRAM_USER_SESSION is saved.
// Usage: node scripts/list-telegram-dialogs.mjs
//
// Lists all your Telegram groups and channels with their names and numeric chat IDs.
// Copy the ID of your news group into TELEGRAM_GROUP_IDENTIFIER in .env.local and Vercel.
// That value can be either the numeric ID printed here, or the group's @username if it has one.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

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
} catch {}

// ── Validate env ─────────────────────────────────────────────────────────────
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionStr = process.env.TELEGRAM_USER_SESSION;

if (!apiId || !apiHash) {
  console.error("Error: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env.local.");
  process.exit(1);
}
if (!sessionStr) {
  console.error("Error: TELEGRAM_USER_SESSION is not set in .env.local.");
  console.error("Run scripts/telegram-login.mjs first to generate a session string.");
  process.exit(1);
}

// ── Connect with saved session ────────────────────────────────────────────────
const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
  connectionRetries: 3,
});
client.setLogLevel("none");

await client.connect();

// ── List dialogs ──────────────────────────────────────────────────────────────
console.log("\nFetching your dialogs (groups and channels)…\n");

const dialogs = await client.getDialogs({ limit: 200 });

const groups = dialogs.filter((d) => {
  const cls = d.entity?.className;
  return cls === "Chat" || cls === "Channel";
});

if (groups.length === 0) {
  console.log("No groups or channels found.");
} else {
  console.log(`Found ${groups.length} group(s)/channel(s):\n`);
  console.log(
    "TYPE".padEnd(12) +
    "ID".padEnd(16) +
    "USERNAME".padEnd(24) +
    "TITLE"
  );
  console.log("─".repeat(72));
  for (const d of groups) {
    const entity = d.entity;
    const type = entity.className === "Channel" && entity.megagroup
      ? "Supergroup"
      : entity.className === "Channel"
        ? "Channel"
        : "Group";
    const id = entity.id?.toString() ?? "?";
    const username = entity.username ? `@${entity.username}` : "—";
    const title = entity.title ?? "—";
    console.log(
      type.padEnd(12) +
      id.padEnd(16) +
      username.padEnd(24) +
      title
    );
  }
  console.log(
    "\nSet TELEGRAM_GROUP_IDENTIFIER in .env.local to the numeric ID"
  );
  console.log("(or the @username if shown) of your news group.\n");
}

await client.disconnect();
process.exit(0);
