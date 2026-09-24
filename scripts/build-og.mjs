// Renders scripts/og-template.html to og.png (1200x630) for link previews.
//   node scripts/build-og.mjs      (needs Playwright + Chromium available to Node)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
import { resolve } from "node:path";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto("file://" + resolve("scripts/og-template.html"));
await page.screenshot({ path: "og.png", type: "png" });
await browser.close();
console.log("wrote og.png");
