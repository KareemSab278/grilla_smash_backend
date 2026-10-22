import sharp from "sharp";
import { badRequest, payloadTooLarge } from "../errors";

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_OUTPUT_BYTES = 80 * 1024;
export const MAX_IMAGE_DIMENSION = 512;
const MIN_IMAGE_DIMENSION = 256;
const MAX_IMAGE_PIXELS = 40_000_000;
const WEBP_QUALITIES = [80, 75, 70, 65, 60, 55] as const;
const IMAGE_DIMENSIONS = [512, 448, 384, 320, 256] as const;
const SUPPORTED_FORMATS = new Set(["avif", "gif", "heif", "jpeg", "png", "webp"]);

export const processImage = async (data: Uint8Array): Promise<Uint8Array> => {
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
        throw badRequest("Image data must be a non-empty Uint8Array");
    }
    if (data.byteLength > MAX_IMAGE_SIZE_BYTES) {
        throw payloadTooLarge(`Original image exceeds the ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB upload limit`);
    }

    let metadata: sharp.Metadata;
    try {
        metadata = await sharp(Buffer.from(data), {
            animated: true,
            limitInputPixels: MAX_IMAGE_PIXELS,
        }).metadata();
    } catch {
        throw badRequest("The uploaded file is malformed or cannot be decoded by this server");
    }

    if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
        throw badRequest("Unsupported image format; upload a JPEG, PNG, HEIC/HEIF, WebP, AVIF, or GIF image");
    }
    if (!metadata.width || !metadata.height) {
        throw badRequest("The uploaded image has invalid dimensions");
    }
    if ((metadata.pages ?? 1) > 1) {
        throw badRequest("Animated or multi-page images are not supported; upload a still image");
    }

    const source = Buffer.from(data);
    let lastAttemptedDimension = Number.POSITIVE_INFINITY;

    for (const dimension of IMAGE_DIMENSIONS) {
        const effectiveDimension = Math.min(dimension, Math.max(metadata.width, metadata.height));
        if (effectiveDimension >= lastAttemptedDimension) continue;
        lastAttemptedDimension = effectiveDimension;

        for (const quality of WEBP_QUALITIES) {
            let output: Buffer;
            try {
                output = await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS })
                    .rotate()
                    .resize({
                        width: dimension,
                        height: dimension,
                        fit: "inside",
                        withoutEnlargement: true,
                    })
                    .webp({ quality, effort: 4 })
                    .toBuffer();
            } catch {
                throw badRequest("The uploaded file could not be decoded or converted to WebP");
            }

            if (output.byteLength <= MAX_IMAGE_OUTPUT_BYTES) return output;
        }
    }

    throw badRequest(
        `Image could not be compressed to the ${MAX_IMAGE_OUTPUT_BYTES / 1024} KB limit after resizing to the ${MIN_IMAGE_DIMENSION}-pixel minimum`
    );
};
