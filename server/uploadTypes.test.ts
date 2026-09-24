import { describe, expect, it } from "vitest";
import { resolveUploadType } from "./routers";

describe("resolveUploadType", () => {
  it("accepts allowed declared types and strips parameters", () => {
    expect(resolveUploadType("photo.jpg", "image/jpeg")).toBe("image/jpeg");
    expect(resolveUploadType("clip.webm", "video/webm; codecs=vp9")).toBe("video/webm");
    expect(resolveUploadType("a.zip", "application/x-zip-compressed")).toBe("application/x-zip-compressed");
  });

  it("falls back to the extension when the declared type is generic", () => {
    expect(resolveUploadType("resume.docx", "")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(resolveUploadType("REEL.MOV", "application/octet-stream")).toBe("video/quicktime");
  });

  it("rejects types that could run script in the browser", () => {
    expect(resolveUploadType("logo.svg", "image/svg+xml")).toBeNull();
    expect(resolveUploadType("page.html", "text/html")).toBeNull();
    expect(resolveUploadType("noext", "application/octet-stream")).toBeNull();
  });

  it("never stores a disallowed declared type, even with an allowed extension", () => {
    expect(resolveUploadType("trick.png", "text/html")).toBe("image/png");
  });
});
