/*
    IMAGE ROUTES.

    POST /images - uploads one multipart image and assigns it to a product or category.
    DELETE /images/:entityType/:entityId - removes the current product/category image.
    Only users allowed by the existing branch-manager guard can upload through this route.
*/

import express, { type RequestHandler } from "express";
import multer from "multer";
import { badRequest, forbidden, notFound, payloadTooLarge } from "../errors";
import { CONFIG } from "../config";
import { Images, MAX_IMAGE_SIZE_BYTES } from "../imageHandler/imageUpload";
import { MAX_BUCKET_SIZE_BYTES } from "../imageHandler/imageQuota";
import { associateUploadedImage } from "../imageHandler/imageAssociation";
import { dbAll, dbGet, transaction } from "../db";
import { requireBranchManager } from "../middleware/requireBranchManager";
import { QUERIES } from "../queries";
import { requireRow } from "../helpers";

const router = express.Router();
const parseImage = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_IMAGE_SIZE_BYTES,
        files: 1,
        fields: 2,
        fieldNameSize: 100,
        fieldSize: 256,
    },
});

const requireAdmin: RequestHandler = async (req, _res, next) => {
    if (!CONFIG.branchSettingsAuthEnabled) {
        throw forbidden("Enable BRANCH_SETTINGS_AUTH_ENABLED before accepting image uploads");
    }
    await requireBranchManager(req);
    next();
};

const parseMultipartImage: RequestHandler = (req, res, next) => {
    parseImage.single("image")(req, res, error => {
        if (!error) {
            next();
            return;
        }

        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
            next(payloadTooLarge(`Image exceeds the ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB upload limit`));
            return;
        }
        if (error instanceof multer.MulterError) {
            next(badRequest(`Invalid image upload: ${error.message}`));
            return;
        }

        next(error);
    });
};

router.get("/images", requireAdmin, async (_req, res) => {
    const images = await Images.listAll();
    const usedBytes = images.reduce((total, image) => total + image.sizeBytes, 0);
    res.json({
        images: images.map(image => ({
            path: image.path,
            image_url: image.publicUrl,
            size_bytes: image.sizeBytes,
            content_type: image.contentType,
            created_at: image.createdAt,
            updated_at: image.updatedAt,
        })),
        used_bytes: usedBytes,
        limit_bytes: MAX_BUCKET_SIZE_BYTES,
    });
});

router.delete("/images/file", requireAdmin, async (req, res) => {
    const path = req.body?.path;
    if (typeof path !== "string" || path.trim() === "") {
        throw badRequest('Provide a non-empty "path"');
    }

    const image = (await Images.listAll()).find(item => item.path === path);
    if (!image) throw notFound("Image not found in the configured bucket");

    const references = await transaction(async tx => {
        const products = await dbAll<{ id: string }>(tx, QUERIES.PUT.CLEAR_PRODUCT_IMAGE_REFERENCES, [image.publicUrl]);
        const categories = await dbAll<{ id: string }>(tx, QUERIES.PUT.CLEAR_CATEGORY_IMAGE_REFERENCES, [image.publicUrl]);
        return { products: products.map(product => product.id), categories: categories.map(category => category.id) };
    });

    await Images.delete(path);
    res.json({ success: true, path, ...references });
});

router.post("/images", requireAdmin, parseMultipartImage, async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Missing image file in multipart field "image"');

    const productId = req.body.product_id;
    const categoryId = req.body.category_id;
    if ((productId === undefined) === (categoryId === undefined)) {
        throw badRequest('Provide exactly one of "product_id" or "category_id"');
    }
    const targetId = productId ?? categoryId;
    if (typeof targetId !== "string" || targetId.trim() === "") {
        throw badRequest("Image target id must be a non-empty string");
    }
    const target = productId === undefined
        ? { label: "category", id: targetId, lockQuery: QUERIES.GET.CATEGORY_IMAGE_FOR_UPDATE, updateQuery: QUERIES.PUT.CATEGORY_IMAGE }
        : { label: "product", id: targetId, lockQuery: QUERIES.GET.PRODUCT_IMAGE_FOR_UPDATE, updateQuery: QUERIES.PUT.PRODUCT_IMAGE };

    const folder = req.body.folder;
    if (folder !== undefined && typeof folder !== "string") {
        throw badRequest("Image folder must be a string");
    }

    const uploaded = await associateUploadedImage({
        upload: () => Images.upload({ data: file.buffer, folder }),
        persistUrl: publicUrl => transaction(async tx => {
            const current = requireRow(
                await dbGet<{ image_url: string | null }>(tx, target.lockQuery, [target.id]),
                target.label
            );
            requireRow(
                await dbGet<{ image_url: string | null }>(tx, target.updateQuery, [publicUrl, target.id]),
                target.label
            );
            return current.image_url;
        }),
        removeUploaded: path => Images.delete(path),
        removePrevious: publicUrl => Images.deletePublicUrl(publicUrl),
    });

    res.status(201).json({
        image_url: uploaded.publicUrl,
        path: uploaded.path,
        entity_type: target.label,
        entity_id: target.id,
    });
});

router.delete("/images/:entityType/:entityId", requireAdmin, async (req, res) => {
    const { entityType, entityId } = req.params;
    if (typeof entityId !== "string" || entityId.trim() === "") {
        throw badRequest("Image target id must be a non-empty string");
    }
    const target = entityType === "product"
        ? { label: "product", id: entityId, lockQuery: QUERIES.GET.PRODUCT_IMAGE_FOR_UPDATE, updateQuery: QUERIES.PUT.PRODUCT_IMAGE }
        : entityType === "category"
            ? { label: "category", id: entityId, lockQuery: QUERIES.GET.CATEGORY_IMAGE_FOR_UPDATE, updateQuery: QUERIES.PUT.CATEGORY_IMAGE }
            : undefined;
    if (!target) throw badRequest('Image entity type must be "product" or "category"');

    const previousImageUrl = await transaction(async tx => {
        const current = requireRow(
            await dbGet<{ image_url: string | null }>(tx, target.lockQuery, [target.id]),
            target.label
        );
        requireRow(
            await dbGet<{ image_url: string | null }>(tx, target.updateQuery, [null, target.id]),
            target.label
        );
        return current.image_url;
    });

    await Images.deletePublicUrl(previousImageUrl);
    res.json({ success: true, entity_type: target.label, entity_id: target.id });
});

export default router;
