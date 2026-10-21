/*
    IMAGE STORAGE - VALIDATES IMAGE CONTENT AND MANAGES FILES IN THE CONFIGURED SUPABASE STORAGE BUCKET.

    Uploads use generated paths to avoid filename collisions. The bucket credentials are read from config
    only when an operation runs, so image storage remains optional for deployments that do not use it.

    resizes to 512 x 512 pixels
    compresses images to reduce file size while maintaining quality
    validates image content to ensure it matches the declared content type
    enforces a maximum file size of 5 MB
    manages storage bucket usage to prevent exceeding quota

*/

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { CONFIG } from "./config";
import { dbRun, transaction, type Db } from "./db";

const toMB = (bytes: number) => bytes / (1024 * 1024);

const SUPABASE_URL = CONFIG.supabaseUrl;
const SUPABASE_SECRET_KEY = CONFIG.supabaseSecretKey;
const SUPABASE_IMAGE_BUCKET = CONFIG.imageBucketName;

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGE_DIMENSION = 512;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_BUCKET_SIZE_BYTES = 4_000_000_000; // 4 gb cap
const BUCKET_QUOTA_LOCK = "supabase-image-bucket-quota";
const STORAGE_PAGE_SIZE = 1000;

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpeg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

const compressImage = async (data: Uint8Array, contentType: string): Promise<Uint8Array> => {
    const image = sharp(Buffer.from(data), {
        animated: contentType === "image/gif",
        limitInputPixels: MAX_IMAGE_PIXELS,
    }).rotate().resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
    });

    switch (contentType) {
        case "image/avif":
            image.avif({ quality: 60, effort: 5 });
            break;
        case "image/gif":
            image.gif({ effort: 7 });
            break;
        case "image/jpeg":
        case "image/jpg":
            image.jpeg({ quality: 80, mozjpeg: true });
            break;
        case "image/png":
            image.png({ compressionLevel: 9, effort: 10, palette: true });
            break;
        case "image/webp":
            image.webp({ quality: 80, effort: 5 });
            break;
    }

    return image.toBuffer();
};


const hasBytesAt = (data: Uint8Array, offset: number, bytes: readonly number[]): boolean =>
    bytes.every((byte, index) => data[offset + index] === byte);

const matchesContentType = (data: Uint8Array, contentType: string): boolean => {
    switch (contentType) {
        case "image/avif":
            return hasBytesAt(data, 4, [0x66, 0x74, 0x79, 0x70]) &&
                (hasBytesAt(data, 8, [0x61, 0x76, 0x69, 0x66]) || hasBytesAt(data, 8, [0x61, 0x76, 0x69, 0x73]));
        case "image/gif":
            return hasBytesAt(data, 0, [0x47, 0x49, 0x46, 0x38]) &&
                (data[4] === 0x37 || data[4] === 0x39) && data[5] === 0x61;
        case "image/jpeg":
        case "image/jpg":
            return hasBytesAt(data, 0, [0xff, 0xd8, 0xff]);
        case "image/png":
            return hasBytesAt(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        case "image/webp":
            return hasBytesAt(data, 0, [0x52, 0x49, 0x46, 0x46]) &&
                hasBytesAt(data, 8, [0x57, 0x45, 0x42, 0x50]);
        default:
            return false;
    }
};

export type UploadImageInput = {
    readonly data: Uint8Array;
    readonly contentType: string;
    readonly folder?: string;
};

export type ImageListOptions = {
    readonly folder?: string;
    readonly limit?: number;
    readonly offset?: number;
};

export type UploadedImage = {
    readonly path: string;
    readonly publicUrl: string;
};

let supabase: ReturnType<typeof createClient> | undefined;

const getStorage = () => {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_IMAGE_BUCKET) {
        throw new Error(
            "Image storage is not configured; set SUPABASE_URL, SUPABASE_SECRET_KEY, and SUPABASE_IMAGE_BUCKET"
        );
    }

    supabase ??= createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
    return supabase.storage.from(SUPABASE_IMAGE_BUCKET);
};

const withBucketQuotaLock = <T>(work: () => Promise<T>): Promise<T> =>
    transaction(async (tx: Db) => {
        // The transaction-scoped lock serializes quota checks across backend instances.
        await dbRun(tx, "SELECT pg_advisory_xact_lock(hashtext($1))", [BUCKET_QUOTA_LOCK]);
        return work();
    });

const getBucketUsage = async (
    storage: ReturnType<typeof getStorage>,
    targetPath?: string
): Promise<{ usedBytes: number; targetPathBytes: number }> => {
    const folders = [""];
    let usedBytes = 0;
    let targetPathBytes = 0;

    while (folders.length > 0) {
        const folder = folders.pop();
        if (folder === undefined) break;
        let offset = 0;

        while (true) {
            const { data, error } = await storage.list(folder, {
                limit: STORAGE_PAGE_SIZE,
                offset,
                sortBy: { column: "name", order: "asc" },
            });
            if (error) throw error;

            for (const item of data) {
                const itemPath = folder ? `${folder}/${item.name}` : item.name;
                if (item.id === null) {
                    folders.push(itemPath);
                    continue;
                }

                const size = item.metadata?.size;
                if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
                    throw new Error(`Unable to determine storage size for image: ${itemPath}`);
                }

                usedBytes += size;
                if (itemPath === targetPath) targetPathBytes = size;
            }

            offset += data.length;
            if (data.length < STORAGE_PAGE_SIZE) break;
        }
    }

    return { usedBytes, targetPathBytes };
};

const validateImage = (input: UploadImageInput): string => {
    if (!(input.data instanceof Uint8Array) || input.data.byteLength === 0) {
        throw new Error("Image data must be a non-empty Uint8Array");
    }
    if (input.data.byteLength > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(`Image exceeds the ${toMB(MAX_IMAGE_SIZE_BYTES)} MB size limit`);
    }

    const extension = IMAGE_EXTENSIONS[input.contentType];
    if (!extension) {
        throw new Error(`Unsupported image content type: ${input.contentType}`);
    }
    if (!matchesContentType(input.data, input.contentType)) {
        throw new Error(`Image data does not match content type: ${input.contentType}`);
    }

    return extension;
};

const validateFolder = (folder: string | undefined): string => {
    if (!folder) return "";

    const segments = folder.split("/");
    if (segments.some(segment => !/^[a-zA-Z0-9_-]+$/.test(segment))) {
        throw new Error("Image folder may only contain letters, numbers, underscores, and hyphens");
    }

    return segments.join("/");
};

const validatePath = (path: string): void => {
    if (
        path.length === 0 ||
        path.startsWith("/") ||
        path.split("/").some(segment => !/^[a-zA-Z0-9_.-]+$/.test(segment) || segment === "." || segment === "..")
    ) {
        throw new Error("Image path must be a relative path inside the configured bucket");
    }
};

const store = async (path: string, input: UploadImageInput, upsert: boolean): Promise<UploadedImage> => {
    validateImage(input);
    const compressedImage = await compressImage(input.data, input.contentType);
    const storage = getStorage();

    return withBucketQuotaLock(async () => {
        const { usedBytes, targetPathBytes } = await getBucketUsage(storage, upsert ? path : undefined);
        const projectedBytes = usedBytes - targetPathBytes + compressedImage.byteLength;
        if (projectedBytes > MAX_BUCKET_SIZE_BYTES) {
            throw new Error("Image storage quota exceeded: uploads may not use more than 4 GB");
        }

        const { data, error } = await storage.upload(path, compressedImage, {
            cacheControl: "3600",
            contentType: input.contentType,
            upsert,
        });
        if (error) throw error;

        return {
            path: data.path,
            publicUrl: storage.getPublicUrl(data.path).data.publicUrl,
        };
    });
};


const upload = async (input: UploadImageInput): Promise<UploadedImage> => {
    const extension = validateImage(input);
    const folder = validateFolder(input.folder);
    const path = [folder, `${randomUUID()}.${extension}`].filter(Boolean).join("/");
    return store(path, input, false);
};

const list = async (options: ImageListOptions = {}): Promise<any> => {
    const folder = validateFolder(options.folder);
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
        throw new Error("Image list limit must be an integer between 1 and 1000");
    }
    if (!Number.isInteger(offset) || offset < 0) {
        throw new Error("Image list offset must be a non-negative integer");
    }

    const { data, error } = await getStorage().list(folder, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    return data;
};

const deleteImage = async (path: string): Promise<void> => {
    validatePath(path);
    const storage = getStorage();
    await withBucketQuotaLock(async () => {
        const { error } = await storage.remove([path]);
        if (error) throw error;
    });
};


const update = async (path: string, input: UploadImageInput): Promise<UploadedImage> => {
    validatePath(path);
    validateImage(input);
    return store(path, input, true);
};

export const Images = {
    upload: (input: UploadImageInput) => upload(input),
    list: (options: ImageListOptions = {}) => list(options),
    delete: (path: string) => deleteImage(path),
    update: (path: string, input: UploadImageInput) => update(path, input),
};
