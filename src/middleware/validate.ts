/*
    VALIDATION MIDDLEWARE - parseInput(schema, input) RETURNS TYPED DATA OR THROWS A 422.

    The message lists every failing field, e.g. "price: Too small: expected number to be >=0".
*/

import type { z } from "zod";
import { unprocessable } from "../errors";

const formatIssues = (error: z.ZodError): string =>
    error.issues
        .map(issue => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
        .join("; ");

export const parseInput = <S extends z.ZodType>(schema: S, input: unknown): z.infer<S> => {
    const result = schema.safeParse(input ?? {});
    if (!result.success) throw unprocessable(formatIssues(result.error));
    return result.data;
};
