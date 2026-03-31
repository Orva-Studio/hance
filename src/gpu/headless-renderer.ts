import { chromium, type Browser, type Page } from "playwright";
import { join } from "node:path";

export interface HeadlessRenderer {
  init(width: number, height: number): Promise<void>;
  renderFrame(
    rgba: Uint8Array,
    width: number,
    height: number,
    params: Record<string, unknown>
  ): Promise<Uint8Array>;
  close(): Promise<void>;
}

class HeadlessRendererImpl implements HeadlessRenderer {
  private browser: Browser;
  private page: Page;

  constructor(browser: Browser, page: Page) {
    this.browser = browser;
    this.page = page;
  }

  async init(width: number, height: number): Promise<void> {
    await this.page.evaluate(
      ({ w, h }: { w: number; h: number }) => window.__initRenderer(w, h),
      { w: width, h: height }
    );
  }

  async renderFrame(
    rgba: Uint8Array,
    width: number,
    height: number,
    params: Record<string, unknown>
  ): Promise<Uint8Array> {
    const b64 = Buffer.from(rgba).toString("base64");
    await this.page.evaluate(
      ({ data, w, h, p }: { data: string; w: number; h: number; p: Record<string, unknown> }) => {
        const binary = atob(data);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        return window.__renderFrame(arr, w, h, p as never);
      },
      { data: b64, w: width, h: height, p: params }
    );

    const resultB64 = await this.page.evaluate(() => {
      const pixels = window.__readPixels();
      const arr = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels as number[]);
      let binary = "";
      for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
      return btoa(binary);
    });
    return new Uint8Array(Buffer.from(resultB64 as string, "base64"));
  }

  async close(): Promise<void> {
    await this.page.evaluate(() => window.__destroy());
    await this.browser.close();
  }
}

async function setupPage(page: Page): Promise<void> {
  await page.setContent(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body><canvas id="c"></canvas></body>
</html>`);

  const scriptPath = join(import.meta.dir, "dist", "render-worker-entry.js");
  await page.addScriptTag({ path: scriptPath });

  await page.waitForFunction(() => typeof window.__initRenderer === "function", {
    timeout: 10000,
  });
}

export async function createHeadlessRenderer(): Promise<HeadlessRenderer> {
  const browser = await chromium.launch({
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan"],
  });

  const page = await browser.newPage();
  await setupPage(page);
  return new HeadlessRendererImpl(browser, page);
}
