import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  sanitizeImage,
  storeImage,
  analyzeImage,
  ImageServiceError,
  MAX_IMAGE_BYTES,
} from "./images.js";

test("sanitizes supported image bytes to JPEG, rotates and removes GPS/EXIF metadata", async () => {
  const original = await sharp({
    create: { width: 64, height: 32, channels: 3, background: "#226644" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Copyright: "private user detail" } })
    .toBuffer();
  const before = await sharp(original).metadata();
  assert.ok(before.exif);
  const result = await sanitizeImage(original);
  const after = await sharp(result.bytes).metadata();
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(after.format, "jpeg");
  assert.equal(after.width, 32);
  assert.equal(after.height, 64);
  assert.equal(after.exif, undefined);
  assert.equal(after.orientation, undefined);
});

test("PNG and WebP decode; oversized dimensions are reduced", async () => {
  for (const format of ["png", "webp"] as const) {
    const original = await sharp({
      create: { width: 2600, height: 20, channels: 4, background: "#0088aaff" },
    })
      .toFormat(format)
      .toBuffer();
    const result = await sanitizeImage(original);
    const after = await sharp(result.bytes).metadata();
    assert.equal(after.format, "jpeg");
    assert.equal(after.width, 2400);
  }
});

test("rejects empty, forged, unsupported, and oversized image payloads", async () => {
  const cases: [Buffer, number, string][] = [
    [Buffer.alloc(0), 400, "empty_image"],
    [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      415,
      "unsupported_image",
    ],
    [Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]), 422, "invalid_image"],
    [Buffer.alloc(MAX_IMAGE_BYTES + 1), 413, "image_too_large"],
  ];
  for (const [bytes, status, code] of cases) {
    await assert.rejects(sanitizeImage(bytes), (error: unknown) => {
      assert.ok(error instanceof ImageServiceError);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      return true;
    });
  }
});

test("storage and Gemini fail explicitly without credentials; local storage persists sanitized bytes", async () => {
  const names = [
    "IMAGE_STORAGE",
    "LOCAL_UPLOAD_PATH",
    "PUBLIC_API_URL",
    "NODE_ENV",
    "GEMINI_API_KEY",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  const directory = await mkdtemp(join(tmpdir(), "draindispatch-images-"));
  try {
    for (const name of names) delete process.env[name];
    const image = await sanitizeImage(
      await sharp({
        create: { width: 16, height: 16, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer(),
    );
    await assert.rejects(
      storeImage(image),
      (error: unknown) =>
        error instanceof ImageServiceError &&
        error.code === "storage_not_configured",
    );
    await assert.rejects(
      analyzeImage(image),
      (error: unknown) =>
        error instanceof ImageServiceError &&
        error.code === "ai_not_configured",
    );
    process.env.IMAGE_STORAGE = "local";
    process.env.LOCAL_UPLOAD_PATH = directory;
    process.env.PUBLIC_API_URL = "http://localhost:3001";
    const stored = await storeImage(image);
    assert.match(stored.storageKey, /^local:[0-9a-f-]+\.jpg$/);
    const filename = stored.storageKey.slice("local:".length);
    assert.equal(stored.url, `http://localhost:3001/uploads/${filename}`);
    assert.deepEqual(await readFile(join(directory, filename)), image.bytes);
    process.env.NODE_ENV = "production";
    await assert.rejects(
      storeImage(image),
      (error: unknown) =>
        error instanceof ImageServiceError &&
        error.code === "storage_not_configured",
    );
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await rm(directory, { recursive: true, force: true });
  }
});
