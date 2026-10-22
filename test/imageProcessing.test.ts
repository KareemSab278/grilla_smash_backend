import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { HttpError } from "../src/errors";
import { MAX_IMAGE_OUTPUT_BYTES, MAX_IMAGE_SIZE_BYTES, processImage } from "../src/imageHandler/imageProcessing";
import {
    assertWithinBucketQuota,
    MAX_BUCKET_SIZE_BYTES,
    projectedBucketUsage,
    withLocalBucketQuotaLock,
} from "../src/imageHandler/imageQuota";

const makeJpeg = async (width = 1200, height = 800): Promise<Buffer> =>
    sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 180, g: 90, b: 40 },
        },
    }).jpeg({ quality: 90 }).toBuffer();

const makeNoisyPng = async (): Promise<Buffer> => {
    const width = 256;
    const height = 256;
    const pixels = Buffer.alloc(width * height * 4);
    let seed = 123456789;
    for (let index = 0; index < pixels.length; index++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        pixels[index] = seed >>> 24;
    }
    return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
};

const isHttpError = (status: number, message: RegExp) => (error: unknown): boolean =>
    error instanceof HttpError && error.status === status && message.test(error.message);

test("converts a typical iPhone JPEG to a bounded 512-pixel WebP", async () => {
    const output = await processImage(await makeJpeg());
    const metadata = await sharp(output).metadata();

    assert.equal(metadata.format, "webp");
    assert.ok(metadata.width! <= 512);
    assert.ok(metadata.height! <= 512);
    assert.ok(output.byteLength <= MAX_IMAGE_OUTPUT_BYTES);
});

test("converts HEIF when the installed Sharp build can encode and decode it", async t => {
    if (!sharp.format.heif.input.buffer || !sharp.format.heif.output.buffer) {
        t.skip("Installed Sharp/libvips build does not support HEIF buffers");
        return;
    }

    let heif: Buffer;
    try {
        heif = await sharp({
            create: {
                width: 64,
                height: 48,
                channels: 3,
                background: { r: 20, g: 120, b: 200 },
            },
        }).heif({ compression: "av1", quality: 80 }).toBuffer();
    } catch {
        t.skip("Installed HEIF codec cannot generate a test fixture");
        return;
    }

    const output = await processImage(heif);
    assert.equal((await sharp(output).metadata()).format, "webp");
    assert.ok(output.byteLength <= MAX_IMAGE_OUTPUT_BYTES);
});

test("rejects original uploads larger than 10 MB before decoding", async () => {
    await assert.rejects(
        processImage(Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1)),
        isHttpError(413, /10 MB upload limit/)
    );
});

test("rejects malformed bytes even if they are named or labelled as an image", async () => {
    await assert.rejects(processImage(Buffer.from("not an image")), isHttpError(400, /malformed|decoded/i));
});

test("rejects a valid but unsupported image format based on its content", async () => {
    const tiff = await sharp({
        create: {
            width: 16,
            height: 16,
            channels: 3,
            background: { r: 100, g: 100, b: 100 },
        },
    }).tiff().toBuffer();

    await assert.rejects(processImage(tiff), isHttpError(400, /Unsupported image format/));
});

test("rejects valid image content that cannot meet the 80 KB limit at the minimum dimensions", async () => {
    await assert.rejects(
        processImage(await makeNoisyPng()),
        isHttpError(400, /could not be compressed to the 80 KB limit/)
    );
});

test("quota calculations include the full 5 MB bucket and account for replacements and deletion", () => {
    assert.equal(projectedBucketUsage(MAX_BUCKET_SIZE_BYTES, 80_000, 81_920), MAX_BUCKET_SIZE_BYTES + 1_920);
    assert.doesNotThrow(() => assertWithinBucketQuota(MAX_BUCKET_SIZE_BYTES, 80_000, 80_000));
    assert.throws(
        () => assertWithinBucketQuota(MAX_BUCKET_SIZE_BYTES, 0, 1),
        isHttpError(409, /5 MB total/)
    );
    assert.throws(() => assertWithinBucketQuota(MAX_BUCKET_SIZE_BYTES, 10, 11), isHttpError(409, /5 MB total/));
    assert.equal(projectedBucketUsage(MAX_BUCKET_SIZE_BYTES, 81_920, 0), MAX_BUCKET_SIZE_BYTES - 81_920);
});

test("concurrent bucket writes serialize quota checks before reserving capacity", async () => {
    let usedBytes = MAX_BUCKET_SIZE_BYTES - 100;
    const incomingBytes = 80;
    const reserve = () => withLocalBucketQuotaLock(async () => {
        assertWithinBucketQuota(usedBytes, 0, incomingBytes);
        await new Promise(resolve => setTimeout(resolve, 5));
        usedBytes += incomingBytes;
    });

    const results = await Promise.allSettled([reserve(), reserve()]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.filter(result => result.status === "rejected").length, 1);
    assert.ok(usedBytes <= MAX_BUCKET_SIZE_BYTES);
});

test("concurrent replacements, uploads, and deletion update one serialized usage total", async () => {
    let usedBytes = MAX_BUCKET_SIZE_BYTES - 40;
    const replace = () => withLocalBucketQuotaLock(async () => {
        assertWithinBucketQuota(usedBytes, 80, 60);
        await new Promise(resolve => setTimeout(resolve, 5));
        usedBytes = projectedBucketUsage(usedBytes, 80, 60);
    });
    const upload = () => withLocalBucketQuotaLock(async () => {
        assertWithinBucketQuota(usedBytes, 0, 50);
        usedBytes += 50;
    });
    const remove = () => withLocalBucketQuotaLock(async () => {
        usedBytes = projectedBucketUsage(usedBytes, 100, 0);
    });

    await Promise.all([replace(), upload(), remove()]);
    assert.equal(usedBytes, MAX_BUCKET_SIZE_BYTES - 110);
});
