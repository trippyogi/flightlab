/* global console, fetch, process, setTimeout */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const port = Number(process.env.FLIGHTLAB_QA_PORT ?? 5197);
const baseUrl = `http://127.0.0.1:${port}`;
const artifactDir = path.resolve('qa-artifacts', new Date().toISOString().replace(/[:.]/g, '-'));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still booting.
    }
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function capture(page, name, action) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (action) await action(page);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(800);
  const canvasBox = await page.locator('canvas').boundingBox();
  if (!canvasBox || canvasBox.width < 240 || canvasBox.height < 180) {
    throw new Error(`${name}: canvas is missing or too small`);
  }
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: false });
}

const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
});

const output = [];
server.stdout.on('data', (chunk) => output.push(chunk.toString()));
server.stderr.on('data', (chunk) => output.push(chunk.toString()));

try {
  await mkdir(artifactDir, { recursive: true });
  await waitForServer();

  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const makePage = async (viewport) => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${viewport.width}x${viewport.height}: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
    return page;
  };

  const desktop = await makePage({ width: 1440, height: 900 });
  await capture(desktop, 'desktop-impact-player');
  await capture(desktop, 'desktop-impact-top', (page) => page.getByRole('button', { name: 'Top' }).click());
  await capture(desktop, 'desktop-impact-side', (page) => page.getByRole('button', { name: 'Side' }).click());
  await capture(desktop, 'desktop-green', (page) => page.getByRole('button', { name: 'Green' }).click());
  await capture(desktop, 'desktop-short', (page) => page.getByRole('button', { name: 'Short' }).click());
  await desktop.close();

  const mobile = await makePage({ width: 390, height: 844 });
  await capture(mobile, 'mobile-impact-player');
  await capture(mobile, 'mobile-impact-top', (page) => page.getByRole('button', { name: 'Top' }).click());
  await capture(mobile, 'mobile-green', (page) => page.getByRole('button', { name: 'Green' }).click());
  await capture(mobile, 'mobile-short', (page) => page.getByRole('button', { name: 'Short' }).click());
  await mobile.close();

  await browser.close();

  if (errors.length > 0) {
    throw new Error(`Browser errors:\n${errors.join('\n')}`);
  }

  console.log(`Visual QA screenshots: ${artifactDir}`);
} catch (error) {
  console.error(output.join(''));
  console.error(error);
  process.exitCode = 1;
} finally {
  if (server.pid) {
    try {
      if (process.platform === 'win32') {
        server.kill('SIGTERM');
      } else {
        process.kill(-server.pid, 'SIGTERM');
      }
    } catch {
      // Server may already be gone.
    }
  }
}
