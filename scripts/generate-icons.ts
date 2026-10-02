/**
 * Generates the PNG app icons and iOS startup images from public/icons/favicon.svg.
 * Run once after changing the SVG: npm run icons
 */
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  SPLASH_BACKGROUND,
  SPLASH_DEVICES,
  SPLASH_THEMES,
  splashFileName,
  type SplashOrientation,
} from './splashScreens.ts';

const dir = new URL('../public/icons/', import.meta.url);
const splashDir = new URL('../public/splash/', import.meta.url);
const rounded = readFileSync(new URL('favicon.svg', dir), 'utf8');
/**
 * Square variant without the rounded corners: iOS and maskable icons get their mask from the
 * system, so the background must fill the whole canvas (no transparent corners).
 */
const fullBleed = rounded.replaceAll(' rx="112"', '');

async function render(svg: string, size: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(new URL(file, dir).pathname);
  console.log(`✓ ${file}`);
}

// Regular icons: rounded square with transparent corners.
await render(rounded, 192, 'pwa-192x192.png');
await render(rounded, 512, 'pwa-512x512.png');
// Maskable: full bleed; the instrument stays within the 80 % safe zone.
await render(fullBleed, 512, 'maskable-icon-512x512.png');
// iOS applies its own rounded mask and does not support transparency.
await render(fullBleed, 180, 'apple-touch-icon-180x180.png');

// Startup images: theme background with the icon (128 CSS px) in the middle.
mkdirSync(splashDir, { recursive: true });
const orientations: SplashOrientation[] = ['portrait', 'landscape'];
for (const device of SPLASH_DEVICES) {
  const iconSize = 128 * device.ratio;
  const icon = await sharp(Buffer.from(rounded), { density: 384 })
    .resize(iconSize, iconSize)
    .png()
    .toBuffer();
  for (const orientation of orientations) {
    for (const theme of SPLASH_THEMES) {
      const w = device.width * device.ratio;
      const h = device.height * device.ratio;
      const [width, height] = orientation === 'portrait' ? [w, h] : [h, w];
      const file = splashFileName(device, orientation, theme);
      await sharp({
        create: { width, height, channels: 3, background: SPLASH_BACKGROUND[theme] },
      })
        .composite([{ input: icon, gravity: 'center' }])
        .png({ palette: true, compressionLevel: 9 })
        .toFile(new URL(file, splashDir).pathname);
      console.log(`✓ splash/${file}`);
    }
  }
}
