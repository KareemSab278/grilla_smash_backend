import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_DB_URL ??= "******localhost:5432/test";
process.env.STRIPE_SECRET_TEST_KEY ??= "test-stripe-key";
process.env.RESEND_API_KEY ??= "test-resend-key";
process.env.GOOGLE_MAPS_API_KEY ??= "test-google-key";

import type { BranchRow } from "../src/types";

const branch = (coordinates: { latitude: number | null; longitude: number | null }): BranchRow => ({
    id: "branch-1",
    name: "Test branch",
    address_line1: "1 Branch Street",
    address_line2: null,
    city: "London",
    postcode: "SW1A 1AA",
    phone: null,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
    opening_hours: {
        monday: { open: "09:00", close: "17:00", is_closed: false },
        tuesday: { open: "09:00", close: "17:00", is_closed: false },
        wednesday: { open: "09:00", close: "17:00", is_closed: false },
        thursday: { open: "09:00", close: "17:00", is_closed: false },
        friday: { open: "09:00", close: "17:00", is_closed: false },
        saturday: { open: "09:00", close: "17:00", is_closed: false },
        sunday: { open: "09:00", close: "17:00", is_closed: false },
    },
    unavailable_products: [],
    delivery_disabled: false,
    pickup_disabled: false,
    delivery_range_km: 5,
});

const address = {
    address_line1: "10 Customer Street",
    address_line2: "Flat 2",
    city: "London",
    postcode: "SW1A 2AA",
};

const response = (body: unknown, ok = true): Response =>
    new Response(JSON.stringify(body), { status: ok ? 200 : 500 });

test("calculateDeliveryPricing geocodes the destination and uses branch coordinates", async () => {
    const { calculateDeliveryPricing } = await import("../src/payment/deliveryPricing");
    const originalFetch = globalThis.fetch;
    const requests: { input: string; init?: RequestInit }[] = [];

    globalThis.fetch = async (input, init) => {
        requests.push({ input: String(input), init });
        return requests.length === 1
            ? response({ status: "OK", results: [{ geometry: { location: { lat: 51.5, lng: -0.1 } } }] })
            : response({ routes: [{ distanceMeters: 4000 }] });
    };

    try {
        const result = await calculateDeliveryPricing(branch({ latitude: 51.52, longitude: -0.12 }), address);

        assert.deepEqual(result, { distanceKm: 4, feePence: 300 });
        assert.match(requests[0]!.input, /geocode\/json/);
        assert.match(requests[0]!.input, /10\+Customer\+Street/);
        assert.equal(requests[1]!.init?.method, "POST");
        assert.match(String(requests[1]!.init?.body), /"travelMode":"DRIVE"/);
        assert.match(String(requests[1]!.init?.body), /"latitude":51.52/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("calculateDeliveryPricing enforces the branch delivery range and accepts its boundary", async () => {
    const { calculateDeliveryPricing } = await import("../src/payment/deliveryPricing");
    const originalFetch = globalThis.fetch;
    let distanceMeters = 9200;
    globalThis.fetch = async (input) => String(input).includes("geocode")
        ? response({ status: "OK", results: [{ geometry: { location: { lat: 51.5, lng: -0.1 } } }] })
        : response({ routes: [{ distanceMeters }] });

    try {
        await assert.rejects(
            calculateDeliveryPricing(
                { ...branch({ latitude: 51.52, longitude: -0.12 }), delivery_range_km: 1 },
                address
            ),
            { status: 400, message: "Delivery address is outside this branch's delivery area" }
        );

        distanceMeters = 1000;
        const result = await calculateDeliveryPricing(
            { ...branch({ latitude: 51.52, longitude: -0.12 }), delivery_range_km: 1 },
            address
        );
        assert.equal(result.distanceKm, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("calculateDeliveryPricing geocodes the branch when stored coordinates are invalid", async () => {
    const { calculateDeliveryPricing } = await import("../src/payment/deliveryPricing");
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return calls === 1
            ? response({ status: "OK", results: [{ geometry: { location: { lat: 51.5, lng: -0.1 } } }] })
            : calls === 2
                ? response({ status: "OK", results: [{ geometry: { location: { lat: 51.6, lng: -0.2 } } }] })
                : response({ routes: [{ distanceMeters: 1000 }] });
    };

    try {
        const result = await calculateDeliveryPricing(branch({ latitude: 999, longitude: null }), address);
        assert.equal(result.distanceKm, 1);
        assert.equal(calls, 3);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("calculateDeliveryPricing maps geocoding and routing failures to safe HTTP errors", async () => {
    const { calculateDeliveryPricing } = await import("../src/payment/deliveryPricing");
    const originalFetch = globalThis.fetch;

    for (const [body, expected] of [
        [{ status: "ZERO_RESULTS" }, "Delivery address could not be located"],
        [{ status: "OK", results: [] }, "Google Maps returned invalid delivery coordinates"],
        [{ status: "INVALID_REQUEST" }, "Google Maps could not geocode the delivery address"],
    ] as const) {
        globalThis.fetch = async () => response(body);
        await assert.rejects(
            calculateDeliveryPricing(branch({ latitude: 51.52, longitude: -0.12 }), address),
            { message: expected }
        );
    }

    calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return calls === 1
            ? response({ status: "OK", results: [{ geometry: { location: { lat: 51.5, lng: -0.1 } } }] })
            : response({ routes: [{ distanceMeters: -1 }] });
    };
    await assert.rejects(
        calculateDeliveryPricing(branch({ latitude: 51.52, longitude: -0.12 }), address),
        { message: "No driving route was found for this delivery address" }
    );

    globalThis.fetch = originalFetch;
});

test("calculateDeliveryPricing rejects unavailable Google responses and excessive distances", async () => {
    const { calculateDeliveryPricing } = await import("../src/payment/deliveryPricing");
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => new Response("bad gateway", { status: 503 });
    await assert.rejects(
        calculateDeliveryPricing(branch({ latitude: 51.52, longitude: -0.12 }), address),
        { status: 502, message: "Unable to geocode the delivery address" }
    );

    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return calls === 1
            ? response({ status: "OK", results: [{ geometry: { location: { lat: 51.5, lng: -0.1 } } }] })
            : response({ routes: [{ distanceMeters: 100_000 }] });
    };
    await assert.rejects(
        calculateDeliveryPricing(branch({ latitude: 51.52, longitude: -0.12 }), address),
        { status: 400, message: "Delivery address is outside this branch's delivery area" }
    );

    globalThis.fetch = originalFetch;
});
