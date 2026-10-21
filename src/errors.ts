/*
    HTTP ERRORS - THROW THESE FROM ANYWHERE, middleware/errorHandler.ts TURNS THEM INTO { detail } RESPONSES.

    400 badRequest   business rule broken (e.g. min_selections > max_selections)
    401 unauthorized missing / invalid auth credentials
    403 forbidden    authenticated but not allowed
    404 notFound     row does not exist
    409 conflict     duplicate / still referenced
    413 payloadTooLarge  request exceeds an upload size limit
    429 tooManyRequests  asked again too soon (e.g. a second password reset code)
    422 unprocessable request body failed schema validation (thrown by middleware/validate.ts)
*/

export class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}

export const badRequest = (message: string): HttpError => new HttpError(400, message);
export const unauthorized = (message: string): HttpError => new HttpError(401, message);
export const forbidden = (message: string): HttpError => new HttpError(403, message);
export const notFound = (message: string): HttpError => new HttpError(404, message);
export const conflict = (message: string): HttpError => new HttpError(409, message);
export const payloadTooLarge = (message: string): HttpError => new HttpError(413, message);
export const tooManyRequests = (message: string): HttpError => new HttpError(429, message);
export const unprocessable = (message: string): HttpError => new HttpError(422, message);
