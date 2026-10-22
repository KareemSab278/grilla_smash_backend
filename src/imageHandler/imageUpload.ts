/*
    IMAGE STORAGE - VALIDATES IMAGE CONTENT AND MANAGES FILES IN THE CONFIGURED SUPABASE STORAGE BUCKET.

    Uploads use generated paths to avoid filename collisions. The bucket credentials are read from config
    only when an operation runs, so image storage remains optional for deployments that do not use it.

    converts supported still images to WebP within the configured dimension and byte limits
    validates content by decoding it with Sharp rather than trusting the declared MIME type
    serializes quota mutations and enforces the total application bucket budget
*/

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { CONFIG } from "../config";
import { dbRun, transaction, type Db } from "../db";
import { badRequest } from "../errors";
import { assertWithinBucketQuota, withLocalBucketQuotaLock } from "./imageQuota";
import { MAX_IMAGE_OUTPUT_BYTES, processImage } from "./imageProcessing";

export { MAX_IMAGE_SIZE_BYTES } from "./imageProcessing";

const SUPABASE_URL = CONFIG.supabaseUrl;
const SUPABASE_SECRET_KEY = CONFIG.supabaseSecretKey;
const SUPABASE_IMAGE_BUCKET = CONFIG.imageBucketName;

const BUCKET_QUOTA_LOCK = "supabase-image-bucket-quota";
const STORAGE_PAGE_SIZE = 1000;

export type UploadImageInput = {
    readonly data: Uint8Array;
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

export type StoredImageDetails = {
    readonly path: string;
    readonly publicUrl: string;
    readonly sizeBytes: number;
    readonly contentType: string | null;
    readonly createdAt: string | null;
    readonly updatedAt: string | null;
};

let supabase: ReturnType<typeof createClient> | undefined;
let bucketConfigurationCheck: Promise<void> | undefined;

const getStorage = () => {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_IMAGE_BUCKET) {
        throw new Error(
            "Image storage is not configured; set SUPABASE_URL, SUPABASE_SECRET_KEY, and SUPABASE_IMAGE_BUCKET"
        );
    }

    supabase ??= createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
    return supabase.storage.from(SUPABASE_IMAGE_BUCKET);
};

const verifyBucketConfiguration = async (): Promise<void> => {
    if (!SUPABASE_IMAGE_BUCKET) {
        throw new Error("Image storage is not configured; set SUPABASE_IMAGE_BUCKET");
    }
    if (!supabase) throw new Error("Image storage client is not initialized");

    bucketConfigurationCheck ??= supabase.storage.getBucket(SUPABASE_IMAGE_BUCKET).then(({ data, error }) => {
        if (error) throw error;
        if (!data.public) {
            throw new Error("The configured image bucket must be public because product and category image_url values use public URLs");
        }
        if (typeof data.file_size_limit === "number" && data.file_size_limit < MAX_IMAGE_OUTPUT_BYTES) {
            throw new Error(
                `The configured image bucket file limit must allow at least ${MAX_IMAGE_OUTPUT_BYTES / 1024} KB WebP files`
            );
        }
        const allowedTypes = data.allowed_mime_types;
        if (allowedTypes && !allowedTypes.some(type => type === "image/webp" || type === "image/*" || type === "*/*")) {
            throw new Error("The configured image bucket must allow image/webp uploads");
        }
    }).catch(error => {
        bucketConfigurationCheck = undefined;
        throw error;
    });
    await bucketConfigurationCheck;
};

const withBucketQuotaLock = <T>(work: () => Promise<T>): Promise<T> =>
    withLocalBucketQuotaLock(() =>
        transaction(async (tx: Db) => {
            // The transaction-scoped lock serializes quota checks across backend instances.
            await dbRun(tx, "SELECT pg_advisory_xact_lock(hashtext($1))", [BUCKET_QUOTA_LOCK]);
            return work();
        })
    );

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

const validateFolder = (folder: string | undefined): string => {
    if (!folder) return "";

    const segments = folder.split("/");
    if (segments.some(segment => !/^[a-zA-Z0-9_-]+$/.test(segment))) {
        throw badRequest("Image folder may only contain letters, numbers, underscores, and hyphens");
    }

    return segments.join("/");
};

const validatePath = (path: string): void => {
    if (
        path.length === 0 ||
        path.startsWith("/") ||
        path.split("/").some(segment => !/^[a-zA-Z0-9_.-]+$/.test(segment) || segment === "." || segment === "..")
    ) {
        throw badRequest("Image path must be a relative path inside the configured bucket");
    }
};

const getManagedPathFromPublicUrl = (publicUrl: string | null): string | undefined => {
    if (!publicUrl) return undefined;
    const storage = getStorage();
    const baseUrl = new URL(storage.getPublicUrl("").data.publicUrl);
    let candidateUrl: URL;
    try {
        candidateUrl = new URL(publicUrl);
    } catch {
        return undefined;
    }

    const basePath = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;
    if (candidateUrl.origin !== baseUrl.origin || !candidateUrl.pathname.startsWith(basePath)) return undefined;

    const path = decodeURIComponent(candidateUrl.pathname.slice(basePath.length));
    validatePath(path);
    return path;
};

const store = async (path: string, input: UploadImageInput, upsert: boolean): Promise<UploadedImage> => {
    const compressedImage = await processImage(input.data);
    const storage = getStorage();
    await verifyBucketConfiguration();

    let newPathMayHaveBeenWritten = false;
    try {
        return await withBucketQuotaLock(async () => {
            const { usedBytes, targetPathBytes } = await getBucketUsage(storage, upsert ? path : undefined);
            assertWithinBucketQuota(usedBytes, targetPathBytes, compressedImage.byteLength);

            newPathMayHaveBeenWritten = true;
            const { data, error } = await storage.upload(path, compressedImage, {
                cacheControl: "3600",
                contentType: "image/webp",
                upsert,
            });
            if (error) throw error;

            return {
                path: data.path,
                publicUrl: storage.getPublicUrl(data.path).data.publicUrl,
            };
        });
    } catch (error) {
        if (newPathMayHaveBeenWritten && !upsert) {
            try {
                const { error: cleanupError } = await storage.remove([path]);
                if (cleanupError) throw cleanupError;
            } catch (cleanupError) {
                throw new AggregateError(
                    [error, cleanupError],
                    "Image upload failed and its new object could not be removed"
                );
            }
        }
        throw error;
    }
};


const upload = async (input: UploadImageInput): Promise<UploadedImage> => {
    const folder = validateFolder(input.folder);
    const path = [folder, `${randomUUID()}.webp`].filter(Boolean).join("/");
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

const listAll = async (): Promise<StoredImageDetails[]> => {
    const storage = getStorage();
    return withBucketQuotaLock(async () => {
        const folders = [""];
        const images: StoredImageDetails[] = [];

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
                    const path = folder ? `${folder}/${item.name}` : item.name;
                    if (item.id === null) {
                        folders.push(path);
                        continue;
                    }

                    const sizeBytes = item.metadata?.size;
                    if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
                        throw new Error(`Unable to determine storage size for image: ${path}`);
                    }

                    images.push({
                        path,
                        publicUrl: storage.getPublicUrl(path).data.publicUrl,
                        sizeBytes,
                        contentType: typeof item.metadata?.mimetype === "string" ? item.metadata.mimetype : null,
                        createdAt: typeof item.created_at === "string" ? item.created_at : null,
                        updatedAt: typeof item.updated_at === "string" ? item.updated_at : null,
                    });
                }

                offset += data.length;
                if (data.length < STORAGE_PAGE_SIZE) break;
            }
        }

        return images;
    });
};

const deleteImage = async (path: string): Promise<void> => {
    validatePath(path);
    const storage = getStorage();
    await withBucketQuotaLock(async () => {
        const { error } = await storage.remove([path]);
        if (error) throw error;
    });
};

const deletePublicUrl = async (publicUrl: string | null): Promise<void> => {
    const path = getManagedPathFromPublicUrl(publicUrl);
    if (path) await deleteImage(path);
};


const update = async (path: string, input: UploadImageInput): Promise<UploadedImage> => {
    validatePath(path);
    if (!path.toLowerCase().endsWith(".webp")) {
        throw badRequest("Image replacement paths must use the .webp extension");
    }
    return store(path, input, true);
};

export const Images = {
    upload: (input: UploadImageInput) => upload(input),
    list: (options: ImageListOptions = {}) => list(options),
    listAll: () => listAll(),
    delete: (path: string) => deleteImage(path),
    deletePublicUrl: (publicUrl: string | null) => deletePublicUrl(publicUrl),
    update: (path: string, input: UploadImageInput) => update(path, input),
};
