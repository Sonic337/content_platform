#!/usr/bin/env node
// Run once, locally — NEVER deployed, NEVER called from the web app.
// Usage: node scripts/telegram-login.mjs
//
// Authenticates your personal Telegram account via MTProto (GramJS) and
// prints a session string to save as TELEGRAM_USER_SESSION in .env.local
// and Vercel. The session string is NOT written to any file — you copy it
// manually to keep it out of any file that could be committed.
//
// Prerequisites:
//   1. Go to https://my.telegram.org/apps and create an app.
//   2. Add TELEGRAM_API_ID and TELEGRAM_API_HASH to .env.local.
//   3. Run this script: node scripts/telegram-login.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import readline from "node:readline";
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
} catch {
  // .env.local not found — rely on existing process.env
}

// ── Validate env ─────────────────────────────────────────────────────────────
const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

if (!apiId || !apiHash) {
  console.error("Error: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env.local.");
  console.error("Get them from https://my.telegram.org/apps (create an app if needed).");
  process.exit(1);
}

// ── Terminal prompts ─────────────────────────────────────────────────────────
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Password prompt — hides typed characters using raw mode.
function askPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let input = "";
    const onData = (char) => {
      if (char === "\n" || char === "\r" || char === "") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (char === "") {
        process.exit();
      } else if (char === "") {
        if (input.length > 0) input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on("data", onData);
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────
console.log("\nTelegram account login — this runs locally only, once.");
console.log("Telegram will send a login code to your account.\n");

const session = new StringSession("");
const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });

await client.start({
  phoneNumber: () => ask("Phone number (with country code, e.g. +14155551234): "),
  phoneCode: () => ask("Login code from Telegram: "),
  password: () => askPassword("2FA password (leave blank if not enabled): "),
  onError: (err) => {
    console.error("Auth error:", err.message ?? err);
  },
});

const sessionString = client.session.save();

console.log("\n────────────────────────────────────────────────────────────────────");
console.log("SAVE THIS as TELEGRAM_USER_SESSION in .env.local and Vercel:");
console.log("");
console.log(sessionString);
console.log("");
console.log("────────────────────────────────────────────────────────────────────");
console.log("Do NOT paste this string into git or any committed file.");
console.log("\nDone. You can now run scripts/list-telegram-dialogs.mjs to find");
console.log("your group's chat ID and set TELEGRAM_GROUP_IDENTIFIER.\n");

await client.disconnect();
process.exit(0);
