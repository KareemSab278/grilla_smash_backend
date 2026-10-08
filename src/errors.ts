/*
    HTTP ERRORS - THROW THESE FROM ANYWHERE, middleware/errorHandler.ts TURNS THEM INTO { detail } RESPONSES.

    400 badRequest   business rule broken (e.g. min_selections > max_selections)
    404 notFound     row does not exist
    409 conflict     duplicate / still referenced
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
export const notFound = (message: string): HttpError => new HttpError(404, message);
export const conflict = (message: string): HttpError => new HttpError(409, message);
export const unprocessable = (message: string): HttpError => new HttpError(422, message);
