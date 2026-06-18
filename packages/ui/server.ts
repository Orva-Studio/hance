import { EFFECT_SCHEMA, seedDefaults, loadPreset, builtinPresetsDir, userPresetsDir, listPresetNames, probe, rebuildPresetIndex, requireCodecLicense, fetchDepthMap } from "@hance/core";
import type { PresetData, LicenseContext } from "@hance/core";
import { runGpuExport } from "@hance/gpu";
import { join, extname, basename, resolve } from "node:path";
import { existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { streamFragmentedMp4, proxyDonePath } from "./lib/transcode";

// Cache key from cheap file metadata (name + size + mtime), so a cache hit can
// be detected from a tiny lookup request without uploading or hashing the whole
// multi-GB source. A different file sharing all three is vanishingly unlikely.
function proxyKey(name: string, size: number, lastModified: number): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`${name}:${size}:${lastModified}`);
  return hasher.digest("hex").slice(0, 16);
}

// Total bytes of the proxy cache dir, so the client can warn when it grows
// large. Cheap stat walk over a flat directory.
function proxyCacheBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const name of readdirSync(dir)) {
    try { total += statSync(join(dir, name)).size; } catch {}
  }
  return total;
}

// Resolve a client-supplied path and confirm it stays inside `allowedDir`,
// defeating `..` traversal that a raw startsWith() check would let through.
// Returns the normalized path only if it exists within the dir, else null.
function resolveWithinDir(rawPath: string | null, allowedDir: string): string | null {
  if (!rawPath) return null;
  const resolved = resolve(rawPath);
  const root = resolve(allowedDir);
  if (resolved !== root && !resolved.startsWith(root + "/")) return null;
  if (!existsSync(resolved)) return null;
  return resolved;
}

function safeExt(name: string): string {
  const ext = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function preparePresetWrite(name: unknown, data: unknown): { ok: true; path: string } | { ok: false; res: Response } {
  if (!name || !data) return { ok: false, res: new Response("name and data required", { status: 400 }) };
  const dir = userPresetsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return { ok: true, path: join(dir, `${name}.hlook`) };
}

function listLooks(): string[] {
  return listPresetNames();
}

let initialFilePath: string | null = null;
const allowedFilePaths = new Set<string>();

export function allowFilePath(path: string): void {
  allowedFilePaths.add(resolve(path));
}

export function setInitialFile(path: string | null): void {
  initialFilePath = path;
}

function safeRebuildIndex(): void {
  try { rebuildPresetIndex(); } catch (err) { console.error("preset index rebuild failed:", err); }
}

export function createServer(port: number) {
  return Bun.serve({
    port,
    maxRequestBodySize: 1024 * 1024 * 1024 * 16,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/api/schema") {
        return Response.json(EFFECT_SCHEMA);
      }

      if (url.pathname === "/api/license") {
        const tier = process.env.HANCE_LICENSE === "pro" ? "pro" : "free";
        return Response.json({ tier });
      }

      if (url.pathname === "/api/initial-file" && req.method === "GET") {
        if (!initialFilePath || !existsSync(initialFilePath)) {
          return new Response("no initial file", { status: 404 });
        }
        const file = Bun.file(initialFilePath);
        const name = initialFilePath.split("/").pop() || "file";
        return new Response(file, {
          headers: {
            "X-Filename": encodeURIComponent(name),
            "Content-Type": file.type || "application/octet-stream",
          },
        });
      }

      if (url.pathname === "/api/local-file" && req.method === "GET") {
        const rawPath = url.searchParams.get("path");
        const filePath = rawPath ? resolve(rawPath) : null;
        if (!filePath || !allowedFilePaths.has(filePath) || !existsSync(filePath)) {
          return new Response("File not found", { status: 404 });
        }
        const file = Bun.file(filePath);
        return new Response(file, {
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
      }

      if (url.pathname === "/api/looks" && req.method === "GET") {
        return Response.json(listLooks());
      }

      if (url.pathname === "/api/look/info" && req.method === "GET") {
        const name = url.searchParams.get("name") || "default";
        try {
          const raw = loadPreset(name);
          const params = raw.params ?? raw;
          return Response.json({
            name: raw.name ?? name,
            description: raw.description ?? "",
            keywords: raw.keywords ?? [],
            characteristics: raw.characteristics ?? [],
            params,
          });
        } catch {
          return new Response("Look not found", { status: 404 });
        }
      }

      if (url.pathname === "/api/look" && req.method === "GET") {
        const name = url.searchParams.get("name") || "default";
        try {
          const raw = loadPreset(name);
          // .hlook files have params nested; .json files have them at top level.
          // Seed schema defaults so the renderer receives fully-populated params
          // (single defaults source — see seedDefaults).
          const params = seedDefaults(raw.params ?? raw);
          return Response.json(params);
        } catch {
          return new Response("Look not found", { status: 404 });
        }
      }

      if (url.pathname === "/api/looks" && req.method === "POST") {
        const body = await req.json();
        const { name, data, description, keywords, characteristics } = body;
        const prep = preparePresetWrite(name, data);
        if (!prep.ok) return prep.res;
        const lookData = { name, description: description || "", keywords: keywords || [], characteristics: characteristics || [], params: data };
        writeFileSync(prep.path, JSON.stringify(lookData, null, 2));
        safeRebuildIndex();
        return Response.json({ ok: true });
      }

      if (url.pathname === "/api/look" && req.method === "PUT") {
        const body = await req.json();
        const { name, data } = body;
        const prep = preparePresetWrite(name, data);
        if (!prep.ok) return prep.res;
        const filePath = prep.path;
        let existing: Record<string, unknown> = {};
        try {
          existing = JSON.parse(await Bun.file(filePath).text());
        } catch {
          for (const ext of [".hlook", ".json"]) {
            const builtinPath = join(builtinPresetsDir(), `${name}${ext}`);
            if (existsSync(builtinPath)) {
              try { existing = JSON.parse(await Bun.file(builtinPath).text()); } catch {}
              break;
            }
          }
        }
        const updated = { ...existing, params: data };
        writeFileSync(filePath, JSON.stringify(updated, null, 2));
        safeRebuildIndex();
        return Response.json({ ok: true });
      }

      if (url.pathname === "/api/look" && req.method === "DELETE") {
        const name = url.searchParams.get("name");
        if (!name) return new Response("name required", { status: 400 });
        for (const dir of [userPresetsDir(), builtinPresetsDir()]) {
          for (const ext of [".hlook", ".json"]) {
            const filePath = join(dir, `${name}${ext}`);
            if (existsSync(filePath)) unlinkSync(filePath);
          }
        }
        safeRebuildIndex();
        return Response.json({ ok: true });
      }

      if (url.pathname === "/api/look/rename" && req.method === "POST") {
        const body = await req.json();
        const { oldName, newName } = body;
        if (!oldName || !newName) return new Response("oldName and newName required", { status: 400 });
        for (const dir of [userPresetsDir(), builtinPresetsDir()]) {
          for (const ext of [".hlook", ".json"]) {
            const oldPath = join(dir, `${oldName}${ext}`);
            if (existsSync(oldPath)) {
              const newPath = join(dir, `${newName}.hlook`);
              renameSync(oldPath, newPath);
              safeRebuildIndex();
              return Response.json({ ok: true });
            }
          }
        }
        return new Response("Look not found", { status: 404 });
      }

      if (url.pathname === "/api/look/import" && req.method === "POST") {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file || !file.name.endsWith(".hlook")) {
          return new Response("Valid .hlook file required", { status: 400 });
        }
        const text = await file.text();
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(text);
        } catch {
          return new Response("Invalid JSON in .hlook file", { status: 400 });
        }
        const dir = userPresetsDir();
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const name = (parsed.name as string) || file.name.replace(".hlook", "");
        writeFileSync(join(dir, `${name}.hlook`), JSON.stringify(parsed, null, 2));
        safeRebuildIndex();
        return Response.json({ ok: true, name });
      }

      if (url.pathname === "/api/export" && req.method === "POST") {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const paramsJson = formData.get("params") as string | null;
        if (!file || !paramsJson) {
          return new Response("file and params required", { status: 400 });
        }

        const params: PresetData = JSON.parse(paramsJson);
        const codecLabel = String(formData.get("codec") ?? "H.264");
        const crf = Number(formData.get("crf") ?? 23);
        const outputName = String(formData.get("outputName") ?? "");
        const codec: "h264" | "h265" | "prores" =
          codecLabel === "ProRes 422" ? "prores" :
          codecLabel === "H.265" ? "h265" : "h264";

        const license: LicenseContext = { tier: process.env.HANCE_LICENSE === "pro" ? "pro" : "free" };
        try {
          requireCodecLicense(codec, license);
        } catch (err) {
          return new Response((err as Error).message, { status: 403 });
        }

        const pixelFormat = codec === "prores" ? "yuv422p10le" : "yuv420p";
        const tempDir = join(tmpdir(), "hance-export");
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
        const inputPath = join(tempDir, file.name);
        await Bun.write(inputPath, file);

        const probeResult = await probe(inputPath);

        if (probeResult.isImage) {
          return new Response("Image export is handled client-side", { status: 400 });
        }

        const defaultExt = codec === "prores" ? "mov" : "mp4";
        const candidate = outputName ? basename(outputName) : "";
        const safeName = /^[A-Za-z0-9._-]+\.(mp4|mov)$/.test(candidate)
          ? candidate
          : `export_${Date.now()}.${defaultExt}`;
        const outputPath = join(tempDir, safeName);

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            try {
              await runGpuExport(
                inputPath,
                outputPath,
                params as Record<string, unknown>,
                probeResult,
                (ratio) => {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ progress: ratio })}\n\n`));
                },
                { codec, crf, encodePreset: "medium", pixelFormat: pixelFormat as "yuv420p" | "yuv422p10le" },
              );
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, downloadUrl: `/api/download?path=${encodeURIComponent(outputPath)}` })}\n\n`));
            } catch (err) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`));
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }

      // AI depth-of-field: fetch (or load the cached) depth map for the source.
      // The client uploads an image File for stills, or a captured frame PNG for
      // the per-frame video preview. Token comes from REPLICATE_API_TOKEN; a
      // missing token surfaces fetchDepthMap's actionable message as a 400.
      if (url.pathname === "/api/depth" && req.method === "POST") {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file) return new Response("file required", { status: 400 });
        const tempDir = join(tmpdir(), "hance-depth-src");
        if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
        const inputPath = join(tempDir, file.name || "frame.png");
        await Bun.write(inputPath, file);
        try {
          const depth = await fetchDepthMap(inputPath);
          return Response.json({ width: depth.width, height: depth.height, data: Array.from(depth.data) });
        } catch (err) {
          console.error("depth fetch failed:", (err as Error).message);
          return new Response((err as Error).message, { status: 400 });
        } finally {
          try { unlinkSync(inputPath); } catch {}
        }
      }

      // Cheap cache probe: the client sends only file metadata, so a hit costs
      // no upload and no hashing. Miss falls through to the streaming POST.
      if (url.pathname === "/api/proxy/lookup" && req.method === "POST") {
        const { name, size, lastModified } = await req.json();
        const proxyDir = join(tmpdir(), "hance-proxy");
        const outputPath = join(proxyDir, `proxy_${proxyKey(name, size, lastModified)}.mp4`);
        const donePath = proxyDonePath(outputPath);
        const hit = existsSync(outputPath) && existsSync(donePath);
        return Response.json({
          cached: hit,
          proxyPath: hit ? outputPath : null,
          durationSec: hit ? Number(readFileSync(donePath, "utf8").trim()) || 0 : 0,
          cacheBytes: proxyCacheBytes(proxyDir),
        });
      }

      if (url.pathname === "/api/proxy" && req.method === "POST") {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        if (!file) return new Response("file required", { status: 400 });

        const proxyDir = join(tmpdir(), "hance-proxy");
        mkdirSync(proxyDir, { recursive: true });
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const inputPath = join(proxyDir, `input_${id}${safeExt(file.name)}`);
        await Bun.write(inputPath, file);

        // Key the proxy by the same metadata the lookup uses, so a later upload
        // of the same file is found without re-transcoding. The .done marker
        // means the file is complete (a partial proxy has none and is rebuilt).
        const lastModified = Number(formData.get("lastModified") ?? file.lastModified ?? 0);
        const outputPath = join(proxyDir, `proxy_${proxyKey(file.name, file.size, lastModified)}.mp4`);
        const donePath = proxyDonePath(outputPath);
        if (existsSync(outputPath) && existsSync(donePath)) {
          try { unlinkSync(inputPath); } catch {}
          const cachedDuration = readFileSync(donePath, "utf8").trim();
          return new Response(Bun.file(outputPath), {
            headers: {
              "Content-Type": "video/mp4",
              "Cache-Control": "no-store",
              "X-Proxy-Duration": cachedDuration || "0",
              "X-Proxy-Path": outputPath,
              "X-Proxy-Cached": "1",
              "X-Proxy-Cache-Bytes": String(proxyCacheBytes(proxyDir)),
            },
          });
        }

        let proxy;
        try {
          proxy = await streamFragmentedMp4(inputPath, outputPath);
        } catch (err) {
          try { unlinkSync(inputPath); } catch {}
          return new Response((err as Error).message, { status: 500 });
        }

        const reader = proxy.stream.getReader();
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
              controller.close();
            } catch (err) {
              controller.error(err);
            } finally {
              try { unlinkSync(inputPath); } catch {}
            }
          },
          cancel() {
            reader.cancel();
            try { unlinkSync(inputPath); } catch {}
          },
        });

        return new Response(body, {
          headers: {
            "Content-Type": "video/mp4",
            "Cache-Control": "no-store",
            "X-Proxy-Duration": String(proxy.durationSec),
            "X-Proxy-Path": outputPath,
            "X-Proxy-Cache-Bytes": String(proxyCacheBytes(proxyDir)),
          },
        });
      }

      if (url.pathname === "/api/proxy-file" && req.method === "GET") {
        const filePath = resolveWithinDir(url.searchParams.get("path"), join(tmpdir(), "hance-proxy"));
        if (!filePath) {
          return new Response("File not found", { status: 404 });
        }
        return new Response(Bun.file(filePath), {
          headers: {
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
          },
        });
      }

      if (url.pathname === "/api/download" && req.method === "GET") {
        const filePath = resolveWithinDir(url.searchParams.get("path"), join(tmpdir(), "hance-export"));
        if (!filePath) {
          return new Response("File not found", { status: 404 });
        }
        return new Response(Bun.file(filePath), {
          headers: { "Content-Disposition": `attachment; filename="${filePath.split("/").pop()}"` },
        });
      }

      // Static file serving (SPA)
      const localDist = join(import.meta.dir, "dist");
      const staticDir = existsSync(localDist) ? localDist : join(homedir(), ".hance", "ui");
      const filePath = join(staticDir, url.pathname === "/" ? "index.html" : url.pathname);
      if (existsSync(filePath)) {
        return new Response(Bun.file(filePath));
      }
      const indexPath = join(staticDir, "index.html");
      if (existsSync(indexPath)) {
        return new Response(Bun.file(indexPath));
      }
      return new Response("Not found", { status: 404 });
    },
  });
}

const STARTUP_ASCII_ART = [
  "",
  "\x1b[36m  \u2588\u2588\u2557  \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "  \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d",
  "  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2557  ",
  "  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551\u255a\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u255d  ",
  "  \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551 \u255a\u2588\u2588\u2588\u2588\u2551\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "  \u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u2550\u2550\u255d \u255a\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\x1b[0m",
].join("\n");

export async function startUI(port: number, openBrowser = true, initialFile?: string): Promise<void> {
  initialFilePath = initialFile ?? null;
  const proxyDir = join(tmpdir(), "hance-proxy");
  const cleanup = () => { try { rmSync(proxyDir, { recursive: true, force: true }); } catch {} };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  const server = createServer(port);
  console.log(STARTUP_ASCII_ART);
  console.log(`\n  \x1b[2mRunning at\x1b[0m \x1b[1mhttp://localhost:${server.port}\x1b[0m\n`);
  if (openBrowser) {
    const open = process.platform === "darwin" ? "open" : "xdg-open";
    Bun.spawn([open, `http://localhost:${server.port}`], { stdout: "ignore", stderr: "ignore" });
  }
}
