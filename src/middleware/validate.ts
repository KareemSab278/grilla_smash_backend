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
