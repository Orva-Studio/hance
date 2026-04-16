import { describe, test, expect } from "bun:test";
import { MAX_UPLOAD_BYTES, formatBytes, validateUploadSize } from "../app/hooks/useUpload";

describe("validateUploadSize", () => {
  test("accepts files at or below the limit", () => {
    expect(validateUploadSize(0)).toBeNull();
    expect(validateUploadSize(1024)).toBeNull();
    expect(validateUploadSize(MAX_UPLOAD_BYTES)).toBeNull();
  });

  test("rejects files over the limit with a user-facing message", () => {
    const msg = validateUploadSize(MAX_UPLOAD_BYTES + 1);
    expect(msg).not.toBeNull();
    expect(msg).toContain("Maximum");
  });
});

describe("formatBytes", () => {
  test("formats MB under 1 GB", () => {
    expect(formatBytes(500 * 1024 * 1024)).toBe("500 MB");
  });

  test("formats GB at or above 1 GB", () => {
    expect(formatBytes(2.5 * 1024 ** 3)).toBe("2.5 GB");
    expect(formatBytes(MAX_UPLOAD_BYTES)).toBe("16.0 GB");
  });
});
