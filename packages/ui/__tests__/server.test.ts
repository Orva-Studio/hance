import { describe, expect, test, afterAll } from "bun:test";
import { createServer, setInitialFile } from "../server";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";

describe("API server", () => {
  const server = createServer(0);
  const base = `http://localhost:${server.port}`;

  afterAll(() => server.stop());

  test("GET /api/schema returns effect schema", async () => {
    const res = await fetch(`${base}/api/schema`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].key).toBe("inputLut");
  });

  test("GET /api/looks lists available looks", async () => {
    const res = await fetch(`${base}/api/looks`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).not.toContain("default");
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test("GET /api/look?name=default returns look data", async () => {
    const res = await fetch(`${base}/api/look?name=default`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data["exposure"]).toBe(0);
  });

  test("GET /api/look is seeded with schema defaults", async () => {
    // The renderer relies on fully-populated params (no inline fallbacks), so
    // even keys a look omits must come back at their schema default.
    const { getDefaults } = await import("@hance/core");
    const defaults = getDefaults();
    const res = await fetch(`${base}/api/look?name=default`);
    const data = await res.json();
    for (const key of Object.keys(defaults)) {
      expect(data[key]).toBeDefined();
    }
  });

  test("GET /api/look fills omitted keys from schema defaults", async () => {
    // A minimal look that omits most params still comes back fully populated.
    const { userPresetsDir } = await import("@hance/core");
    const dir = userPresetsDir();
    const file = join(dir, "__defaults_probe.hlook");
    writeFileSync(file, JSON.stringify({ name: "probe", params: { exposure: 0.5 } }));
    try {
      const res = await fetch(`${base}/api/look?name=__defaults_probe`);
      const data = await res.json();
      expect(data["exposure"]).toBe(0.5);
    } finally {
      unlinkSync(file);
    }
  });

  async function importLook(name: string, filename = "probe.hlook"): Promise<Response> {
    const form = new FormData();
    form.append("file", new File([JSON.stringify({ name, params: {} })], filename));
    return await fetch(`${base}/api/look/import`, { method: "POST", body: form });
  }

  test("POST /api/look/import reports overwritten:false for a new look", async () => {
    const { userPresetsDir } = await import("@hance/core");
    const name = `__import_probe_${Date.now()}`;
    const file = join(userPresetsDir(), `${name}.hlook`);
    try {
      const data = await (await importLook(name)).json();
      expect(data.name).toBe(name);
      expect(data.overwritten).toBe(false);
    } finally {
      try { unlinkSync(file); } catch {}
    }
  });

  test("POST /api/look/import reports overwritten:true when it replaces a look", async () => {
    const { userPresetsDir } = await import("@hance/core");
    const name = `__import_probe_dup_${Date.now()}`;
    const file = join(userPresetsDir(), `${name}.hlook`);
    try {
      await importLook(name);
      const data = await (await importLook(name)).json();
      expect(data.overwritten).toBe(true);
    } finally {
      try { unlinkSync(file); } catch {}
    }
  });

  test("POST /api/look/import stores under the look's name, not the filename", async () => {
    // The overwrite report is only meaningful if it names the file actually
    // written: importing clay_new.hlook whose internal name is "clay" replaces
    // the existing "clay".
    const { userPresetsDir } = await import("@hance/core");
    const name = `__import_probe_named_${Date.now()}`;
    const file = join(userPresetsDir(), `${name}.hlook`);
    try {
      const data = await (await importLook(name, "something_else.hlook")).json();
      expect(data.name).toBe(name);
      expect(existsSync(file)).toBe(true);
    } finally {
      try { unlinkSync(file); } catch {}
    }
  });

  test("POST /api/look/import rejects a name that escapes the presets dir", async () => {
    // `name` is read out of the uploaded file, so it is attacker-chosen.
    const { userPresetsDir } = await import("@hance/core");
    const escaped = join(userPresetsDir(), "..", "__traversal_probe.hlook");
    try {
      const res = await importLook("../__traversal_probe");
      expect(res.status).toBe(400);
      expect(existsSync(escaped)).toBe(false);
    } finally {
      try { unlinkSync(escaped); } catch {}
    }
  });

  test("GET /api/version returns the package version", async () => {
    const res = await fetch(`${base}/api/version`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.version).toBe((await import("../package.json")).version);
  });

  test("GET /api/initial-file returns 404 when no file set", async () => {
    setInitialFile(null);
    const res = await fetch(`${base}/api/initial-file`);
    expect(res.status).toBe(404);
  });

  test("GET /api/initial-file serves file bytes with X-Filename", async () => {
    const filePath = join(tmpdir(), `hance-initial-test-${Date.now()}.mp4`);
    const contents = new Uint8Array([1, 2, 3, 4, 5]);
    writeFileSync(filePath, contents);
    setInitialFile(filePath);
    try {
      const res = await fetch(`${base}/api/initial-file`);
      expect(res.status).toBe(200);
      const name = decodeURIComponent(res.headers.get("X-Filename") || "");
      expect(name).toBe(filePath.split("/").pop());
      expect(res.headers.get("Content-Type")).toContain("video/mp4");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      setInitialFile(null);
      try { unlinkSync(filePath); } catch {}
    }
  });
});
