// Inlines styles.css, data/people.js and app.js into one self-contained HTML file.
// Used for the hosted artifact and for anyone who wants a single file to email.
//   node scripts/build-single.mjs   -> dist/index.html
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const css = readFileSync("styles.css", "utf8");
const data = readFileSync("data/people.js", "utf8");
const app = readFileSync("app.js", "utf8");
const esc = (s) => s.replace(/<\/script/gi, "<\\/script");

const out = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script src="data/people.js"></script>', `<script>\n${esc(data)}\n</script>`)
  .replace('<script src="app.js"></script>', `<script>\n${esc(app)}\n</script>`);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", out);
// artifact.html: same page without the document skeleton, for hosts that wrap the page themselves.
const bodyStart = out.indexOf("<body>") + "<body>".length, bodyEnd = out.lastIndexOf("</body>");
const artifact = `<title>Hunniford Chalmers</title>\n<meta name="theme-color" content="#0f2a1f">\n<style>\n${css}\n</style>\n` + out.slice(bodyStart, bodyEnd);
writeFileSync("dist/artifact.html", artifact);
console.log(`dist/index.html: ${(out.length / 1024).toFixed(0)} KB, dist/artifact.html: ${(artifact.length / 1024).toFixed(0)} KB`);
