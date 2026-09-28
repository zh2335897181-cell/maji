const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'public', 'favicon.svg'), 'utf8');
const sizes = [16, 24, 32, 48, 64, 128, 256];

function makeIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

async function main() {
  const buildDir = path.join(root, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  const browserRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  const installedChromiums = fs.existsSync(browserRoot)
    ? fs.readdirSync(browserRoot).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse()
    : [];
  const fallbackChrome = installedChromiums
    .map((name) => path.join(browserRoot, name, 'chrome-win64', 'chrome.exe'))
    .find((candidate) => fs.existsSync(candidate));
  const packagedChrome = chromium.executablePath();
  const executablePath = process.env.CHROME_PATH || (fs.existsSync(packagedChrome) ? packagedChrome : fallbackChrome);
  if (!executablePath) throw new Error('未找到 Chromium；请运行 npx playwright install chromium。');
  const browser = await chromium.launch({ headless: true, executablePath });
  const images = [];

  try {
    for (const size of sizes) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      const sizedSvg = svg.replace('<svg ', '<svg width="100%" height="100%" ');
      await page.setContent(`<html><body style="margin:0;width:100vw;height:100vh">${sizedSvg}</body></html>`);
      const png = await page.screenshot({ type: 'png', omitBackground: true });
      images.push({ size, png });
      if (size === 256) fs.writeFileSync(path.join(buildDir, 'icon-preview.png'), png);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(buildDir, 'icon.ico'), makeIco(images));
  process.stdout.write(`Generated ${path.join(buildDir, 'icon.ico')} (${sizes.join(', ')} px)\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
