export type StoredImage = {
    readonly path: string;
    readonly publicUrl: string;
};

type AssociateImageOptions = {
    readonly upload: () => Promise<StoredImage>;
    readonly persistUrl: (publicUrl: string) => Promise<string | null>;
    readonly removeUploaded: (path: string) => Promise<void>;
    readonly removePrevious: (publicUrl: string | null) => Promise<void>;
};

export const associateUploadedImage = async ({
    upload,
    persistUrl,
    removeUploaded,
    removePrevious,
}: AssociateImageOptions): Promise<StoredImage> => {
    const uploaded = await upload();
    let previousUrl: string | null;

    try {
        previousUrl = await persistUrl(uploaded.publicUrl);
    } catch (databaseError) {
        try {
            await removeUploaded(uploaded.path);
        } catch (cleanupError) {
            throw new AggregateError(
                [databaseError, cleanupError],
                "Image association failed and the new upload could not be removed"
            );
        }
        throw databaseError;
    }

    if (previousUrl !== uploaded.publicUrl) await removePrevious(previousUrl);
    return uploaded;
};
