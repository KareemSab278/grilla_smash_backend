import { conflict } from "../helpers/errors";

export const MAX_BUCKET_SIZE_BYTES = 5 * 1024 * 1024;

let pendingMutation: Promise<void> = Promise.resolve();

export const withLocalBucketQuotaLock = <T>(work: () => Promise<T>): Promise<T> => {
    const result = pendingMutation.then(work);
    pendingMutation = result.then(() => undefined, () => undefined);
    return result;
};

export const projectedBucketUsage = (usedBytes: number, replacedBytes: number, incomingBytes: number): number => {
    if (
        !Number.isSafeInteger(usedBytes) ||
        !Number.isSafeInteger(replacedBytes) ||
        !Number.isSafeInteger(incomingBytes) ||
        usedBytes < 0 ||
        replacedBytes < 0 ||
        incomingBytes < 0 ||
        replacedBytes > usedBytes
    ) {
        throw new Error("Unable to determine image storage usage");
    }

    return usedBytes - replacedBytes + incomingBytes;
};

export const assertWithinBucketQuota = (usedBytes: number, replacedBytes: number, incomingBytes: number): void => {
    if (projectedBucketUsage(usedBytes, replacedBytes, incomingBytes) > MAX_BUCKET_SIZE_BYTES) {
        throw conflict("Image storage quota exceeded: the bucket is limited to 5 MB total");
    }
};
