export const normalizeAmount = (amount: string | number | undefined) => {
    if (amount === undefined || amount === null || amount === "") {
        throw new Error("Invalid amount");
    }

    if (typeof amount === "number") {
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Invalid amount");
        }
        return Math.round(amount);
    }

    const parsed = String(amount).trim();
    if (!parsed) {
        throw new Error("Invalid amount");
    }

    if (parsed.includes(".")) {
        const [whole, fraction = ""] = parsed.split(".");
        const normalizedFraction = (fraction + "00").slice(0, 2);
        const minorUnitAmount = Number(`${whole}${normalizedFraction}`);

        if (!Number.isFinite(minorUnitAmount) || minorUnitAmount <= 0) {
            throw new Error("Invalid amount");
        }

        return minorUnitAmount;
    }

    const minorUnitAmount = Number(parsed);
    if (!Number.isFinite(minorUnitAmount) || minorUnitAmount <= 0) {
        throw new Error("Invalid amount");
    }

    return minorUnitAmount;
};

export const buildCheckoutRequest = ({ amount, currency = "GBP" }: {
    amount: string | number;
    currency?: string;
}) => {
    const charge: Record<string, any> = {
        amount: normalizeAmount(amount),
        currency: currency.toUpperCase(),
    };
    return { charge };
};

