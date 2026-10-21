/*
    IMAGE ROUTES.

    POST /images - uploads one multipart image in the `image` field; optional `folder` groups uploads.
    Only users allowed by the existing branch-manager guard can upload through this route.
*/

import express, { type RequestHandler } from "express";
import multer from "multer";
import { badRequest, forbidden, payloadTooLarge } from "../errors";
import { CONFIG } from "../config";
import { Images, MAX_IMAGE_SIZE_BYTES } from "../imageUpload";
import { requireBranchManager } from "../middleware/requireBranchManager";

const router = express.Router();
const parseImage = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_IMAGE_SIZE_BYTES,
        files: 1,
        fields: 1,
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

router.post("/images", requireAdmin, parseMultipartImage, async (req, res) => {
    if (!req.file) throw badRequest('Missing image file in multipart field "image"');

    const folder = req.body.folder;
    if (folder !== undefined && typeof folder !== "string") {
        throw badRequest("Image folder must be a string");
    }

    const uploaded = await Images.upload({
        data: req.file.buffer,
        contentType: req.file.mimetype,
        folder,
    });

    res.status(201).json({
        image_url: uploaded.publicUrl,
        path: uploaded.path,
    });
});

export default router;
