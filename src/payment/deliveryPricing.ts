import { CONFIG } from "../config";
import { badRequest, HttpError } from "../helpers/errors";
import type { BranchRow } from "../types";

const KM_TO_MILES = 0.621371;
const MINIMUM_DELIVERY_FEE_PENCE = 300;
const CHARGE_PER_TENTH_MILE_PENCE = 10;
const BASE_DISTANCE_MILES = 3;

type Coordinates = {
    lat: number;
    lng: number;
};

type DeliveryAddress = {
    address_line1: string;
    address_line2?: string | null;
    city: string;
    postcode: string;
};

type GeocodeResponse = {
    status?: string;
    results?: Array<{
        geometry?: {
            location?: {
                lat?: number;
                lng?: number;
            };
        };
    }>;
};

type RouteResponse = {
    routes?: Array<{ distanceMeters?: number }>;
};

const addressText = (parts: readonly (string | null | undefined)[]): string =>
    parts.map(part => part?.trim()).filter((part): part is string => Boolean(part)).join(", ");

const parseCoordinates = (
    latitude: number | null | undefined,
    longitude: number | null | undefined
): Coordinates | undefined => {
    if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return undefined;
    }

    return { lat: latitude, lng: longitude };
};

const getLatLng = async (address: string, apiKey: string): Promise<Coordinates> => {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", apiKey);

    let response: globalThis.Response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch {
        throw new HttpError(502, "Unable to geocode the delivery address");
    }

    if (!response.ok) throw new HttpError(502, "Unable to geocode the delivery address");

    let data: GeocodeResponse;
    try {
        data = (await response.json()) as GeocodeResponse;
    } catch {
        throw new HttpError(502, "Google Maps returned an invalid geocoding response");
    }

    if (data.status === "ZERO_RESULTS") throw badRequest("Delivery address could not be located");
    if (data.status !== "OK" || !Array.isArray(data.results)) {
        throw new HttpError(502, "Google Maps could not geocode the delivery address");
    }

    const location = data.results[0]?.geometry?.location;
    const coordinates = parseCoordinates(location?.lat, location?.lng);
    if (!coordinates) {
        throw new HttpError(502, "Google Maps returned invalid delivery coordinates");
    }

    return coordinates;
};

const getDrivingDistanceKm = async (
    origin: Coordinates,
    destination: Coordinates,
    apiKey: string
): Promise<number> => {
    let response: globalThis.Response;
    try {
        response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "routes.distanceMeters",
            },
            body: JSON.stringify({
                origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
                destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
                travelMode: "DRIVE",
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        throw new HttpError(502, "Unable to calculate the driving distance");
    }

    if (!response.ok) throw new HttpError(502, "Google Maps could not calculate a driving route");

    let data: RouteResponse;
    try {
        data = (await response.json()) as RouteResponse;
    } catch {
        throw new HttpError(502, "Google Maps returned an invalid route response");
    }

    const distanceMeters = data.routes?.[0]?.distanceMeters;
    if (!Number.isFinite(distanceMeters) || distanceMeters! < 0) {
        throw badRequest("No driving route was found for this delivery address");
    }

    return distanceMeters! / 1000;
};

export const chargeDeliveryFee = (isPickUp: boolean, distanceKm: number | null): number => {
    if (isPickUp) return 0;
    if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm <= 0) {
        return MINIMUM_DELIVERY_FEE_PENCE;
    }

    const miles = distanceKm * KM_TO_MILES;
    if (miles <= BASE_DISTANCE_MILES) return MINIMUM_DELIVERY_FEE_PENCE;

    const extraTenths = Math.ceil((miles - BASE_DISTANCE_MILES) * 10 - 1e-9);
    return MINIMUM_DELIVERY_FEE_PENCE + extraTenths * CHARGE_PER_TENTH_MILE_PENCE;
};

export const calculateDeliveryPricing = async (
    branch: BranchRow,
    address: DeliveryAddress
): Promise<{ feePence: number; distanceKm: number }> => {
    const apiKey = CONFIG.googleMapsApiKey;
    if (!apiKey) throw new HttpError(503, "Google Maps delivery pricing is not configured");

    const destinationAddress = addressText([
        address.address_line1,
        address.address_line2,
        address.city,
        address.postcode,
    ]);
    const destination = await getLatLng(destinationAddress, apiKey);

    const origin =
        parseCoordinates(branch.latitude, branch.longitude) ??
        (await getLatLng(addressText([branch.address_line1, branch.address_line2, branch.city, branch.postcode]), apiKey));

    const distanceKm = await getDrivingDistanceKm(origin, destination, apiKey);
    if (distanceKm > CONFIG.maxDeliveryDistanceKm) {
        throw badRequest("Delivery address is outside this branch's delivery area");
    }

    return {
        feePence: chargeDeliveryFee(false, distanceKm),
        distanceKm,
    };
};