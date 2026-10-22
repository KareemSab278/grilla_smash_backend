import assert from "node:assert/strict";
import test from "node:test";
import { associateUploadedImage } from "../src/imageHandler/imageAssociation";

const uploaded = { path: "products/new.webp", publicUrl: "https://storage.test/new.webp" };

test("removes the new upload when persisting its image URL fails and preserves the active image", async () => {
    let activeUrl = "https://storage.test/active.webp";
    const removedPaths: string[] = [];
    const removedUrls: string[] = [];

    await assert.rejects(
        associateUploadedImage({
            upload: async () => uploaded,
            persistUrl: async () => {
                throw new Error("database unavailable");
            },
            removeUploaded: async path => { removedPaths.push(path); },
            removePrevious: async url => {
                if (url) {
                    removedUrls.push(url);
                    if (url === activeUrl) activeUrl = "";
                }
            },
        }),
        /database unavailable/
    );

    assert.deepEqual(removedPaths, [uploaded.path]);
    assert.deepEqual(removedUrls, []);
    assert.equal(activeUrl, "https://storage.test/active.webp");
});

test("removes the old image only after its replacement URL has been persisted", async () => {
    const events: string[] = [];

    const result = await associateUploadedImage({
        upload: async () => {
            events.push("uploaded");
            return uploaded;
        },
        persistUrl: async () => {
            events.push("persisted");
            return "https://storage.test/old.webp";
        },
        removeUploaded: async path => { events.push(`removed:${path}`); },
        removePrevious: async url => { events.push(`removed:${url}`); },
    });

    assert.equal(result.path, uploaded.path);
    assert.deepEqual(events, [
        "uploaded",
        "persisted",
        "removed:https://storage.test/old.webp",
    ]);
});

test("surfaces both database and storage cleanup failures", async () => {
    await assert.rejects(
        associateUploadedImage({
            upload: async () => uploaded,
            persistUrl: async () => { throw new Error("database unavailable"); },
            removeUploaded: async () => { throw new Error("storage unavailable"); },
            removePrevious: async () => {},
        }),
        error => error instanceof AggregateError && error.errors.length === 2
    );
});
