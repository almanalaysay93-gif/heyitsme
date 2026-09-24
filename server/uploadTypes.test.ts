import { describe, expect, it } from "vitest";
import { confirmUploadType, resolveUploadType } from "./routers";

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

const bytes = (...parts: (number[] | string)[]) =>
  Buffer.concat(parts.map((part) => (typeof part === "string" ? Buffer.from(part, "latin1") : Buffer.from(part))));

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF");
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "IHDR");
const WEBP = bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ");
const MP4 = bytes([0, 0, 0, 0x20], "ftypisom");
const ZIP = bytes([0x50, 0x4b, 0x03, 0x04], "[Content_Types].xml");
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("confirmUploadType", () => {
  it("accepts files whose bytes match their type", () => {
    expect(confirmUploadType(JPEG, "image/jpeg")).toBe("image/jpeg");
    expect(confirmUploadType(bytes("GIF89a"), "image/gif")).toBe("image/gif");
    expect(confirmUploadType(WEBP, "image/webp")).toBe("image/webp");
    expect(confirmUploadType(bytes([0x1a, 0x45, 0xdf, 0xa3]), "video/webm")).toBe("video/webm");
    expect(confirmUploadType(bytes("%PDF-1.7"), "application/pdf")).toBe("application/pdf");
    expect(confirmUploadType(bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "application/msword")).toBe("application/msword");
  });

  it("accepts the types that share a container", () => {
    expect(confirmUploadType(MP4, "video/mp4")).toBe("video/mp4");
    expect(confirmUploadType(MP4, "video/quicktime")).toBe("video/quicktime");
    expect(confirmUploadType(bytes([0, 0, 0, 0x1c], "ftypavif"), "image/avif")).toBe("image/avif");
    expect(confirmUploadType(bytes([0, 0, 0, 8], "wide"), "video/quicktime")).toBe("video/quicktime");
    expect(confirmUploadType(ZIP, DOCX)).toBe(DOCX);
    expect(confirmUploadType(ZIP, "application/zip")).toBe("application/zip");
  });

  it("stores a photo with the wrong image extension under its real type", () => {
    expect(confirmUploadType(PNG, "image/jpeg")).toBe("image/png");
    expect(confirmUploadType(JPEG, "image/webp")).toBe("image/jpeg");
  });

  it("rejects bytes that are not the declared kind of file", () => {
    expect(confirmUploadType(bytes("<!doctype html><script>alert(1)</script>"), "image/png")).toBeNull();
    expect(confirmUploadType(bytes("<svg onload=alert(1)>"), "image/jpeg")).toBeNull();
    expect(confirmUploadType(ZIP, "application/pdf")).toBeNull();
    expect(confirmUploadType(JPEG, "application/pdf")).toBeNull();
    expect(confirmUploadType(MP4, "image/jpeg")).toBeNull();
    expect(confirmUploadType(bytes([0, 0, 0, 8], "wide"), "video/mp4")).toBeNull();
    expect(confirmUploadType(Buffer.alloc(0), "image/png")).toBeNull();
  });
});
