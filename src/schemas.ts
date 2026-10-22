/*
    REQUEST VALIDATION - ZOD SCHEMAS FOR EVERY REQUEST BODY / QUERY.

    Handlers call parseInput(schema, req.body) (middleware/validate.ts), which returns fully typed data or
    throws a 422. The exported types at the bottom are inferred from the schemas, so validation and
    TypeScript types can never drift apart.

    Conventions:
    - *CreateSchema   required fields + defaults
    - *UpdateSchema   every field optional, null / omitted means "leave unchanged"
    - money is an integer in pence (£8.99 = 899)
    - unknown fields are stripped (e.g. a client sending its own price on an order is simply ignored)
*/

import { z } from "zod";

// ========================================
// SHARED
// ========================================

const name = z.string().trim().min(1);
const optionalText = z.string().nullish();
const pence = z.int().min(0);
const sortOrder = z.int();
const id = z.string().min(1);
const timeHHMM = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid time");

// accepts anything Date can parse, e.g. "2026-01-31T18:30" from the admin datetime-local inputs
const dateTime = z
    .string()
    .refine(value => !Number.isNaN(Date.parse(value)), "Invalid date/time")
    .nullish();

const OFFER_TYPES = ["FIXED_PRICE", "PERCENTAGE", "FIXED_DISCOUNT", "BUY_X_GET_Y"] as const;
const offerType = z.enum(OFFER_TYPES);

// ========================================
// BUSINESS
// ========================================

export const businessCreateSchema = z.object({
    name,
    slug: name,
    logo_url: optionalText,
    currency: z.string().trim().min(1).default("GBP"),
});

export const businessUpdateSchema = z.object({
    name: name.nullish(),
    slug: name.nullish(),
    logo_url: optionalText,
    currency: z.string().trim().min(1).nullish(),
    active: z.boolean().nullish(),
});

// ========================================
// USERS
// ========================================

const password = z.string().min(8).max(128);

export const userCreateSchema = z.object({
    username: z.string().trim().min(3).max(50),
    password,
    email: z.email().toLowerCase(),
});

export const adminCreationCodeRequestSchema = z.object({
    username: z.string().trim().min(3).max(50),
    email: z.email().toLowerCase(),
});

export const adminCreateSchema = userCreateSchema.extend({
    verification_code: z.string().regex(/^\d{6}$/, "Invalid verification code"),
});

export const userLoginSchema = z.object({
    username: z.string().trim().min(3).max(50),
    password,
});

export const userPasswordResetRequestSchema = z.object({
    email: z.email().toLowerCase(),
});

export const userPasswordResetSchema = z.object({
    email: z.email().toLowerCase(),
    reset_code: z.string().regex(/^\d{6}$/, "Invalid reset code"),
    new_password: password,
});

export const userPasswordResetLegacySchema = z.object({
    reset_code: z.string().regex(/^\d{6}$/, "Invalid reset code"),
    new_password: password,
});

// ========================================
// BRANCHES
// ========================================

const dayHoursSchema = z
    .object({
        open: timeHHMM,
        close: timeHHMM,
        is_closed: z.boolean().default(false),
    })
    .refine(value => value.is_closed || value.open < value.close, "open must be before close");

const dayHoursPatchSchema = z.object({
    open: timeHHMM.optional(),
    close: timeHHMM.optional(),
    is_closed: z.boolean().optional(),
});

export const openingHoursSchema = z.object({
    monday: dayHoursSchema,
    tuesday: dayHoursSchema,
    wednesday: dayHoursSchema,
    thursday: dayHoursSchema,
    friday: dayHoursSchema,
    saturday: dayHoursSchema,
    sunday: dayHoursSchema,
});

export const openingHoursPatchSchema = z
    .object({
        monday: dayHoursPatchSchema.optional(),
        tuesday: dayHoursPatchSchema.optional(),
        wednesday: dayHoursPatchSchema.optional(),
        thursday: dayHoursPatchSchema.optional(),
        friday: dayHoursPatchSchema.optional(),
        saturday: dayHoursPatchSchema.optional(),
        sunday: dayHoursPatchSchema.optional(),
    })
    .partial();

export const branchCreateSchema = z.object({
    name,
    address_line1: name,
    address_line2: optionalText,
    city: name,
    postcode: name,
    phone: optionalText,
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    opening_hours: openingHoursSchema.nullish(),
});

export const branchUpdateSchema = z.object({
    name: name.nullish(),
    address_line1: name.nullish(),
    address_line2: optionalText,
    city: name.nullish(),
    postcode: name.nullish(),
    phone: optionalText,
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    active: z.boolean().nullish(),
});

export const branchUnavailableProductsSchema = z.object({
    unavailable_products: z.array(id),
});

// ========================================
// CATEGORIES
// ========================================

export const categoryCreateSchema = z.object({
    name,
    description: optionalText,
    image_url: optionalText,
    sort_order: sortOrder.default(0),
});

export const categoryUpdateSchema = z.object({
    name: name.nullish(),
    description: optionalText,
    image_url: optionalText,
    sort_order: sortOrder.nullish(),
    active: z.boolean().nullish(),
});

// ========================================
// PRODUCTS
// ========================================

export const productCreateSchema = z.object({
    name,
    description: optionalText,
    price: pence,
    image_url: optionalText,
    sort_order: sortOrder.default(0),
    category_ids: z.array(id).default([]),
});

export const productUpdateSchema = z.object({
    name: name.nullish(),
    description: optionalText,
    price: pence.nullish(),
    image_url: optionalText,
    sort_order: sortOrder.nullish(),
    active: z.boolean().nullish(),
    category_ids: z.array(id).nullish(),
});

export const productListQuerySchema = z.object({
    active_only: z.stringbool().default(false),
});

// ========================================
// MODIFIER GROUPS
// ========================================

export const modifierGroupCreateSchema = z.object({
    name,
    required: z.boolean().default(false),
    min_selections: z.int().min(0).default(0),
    max_selections: z.int().min(1).default(1),
    sort_order: sortOrder.default(0),
});

export const modifierGroupUpdateSchema = z.object({
    name: name.nullish(),
    required: z.boolean().nullish(),
    min_selections: z.int().min(0).nullish(),
    max_selections: z.int().min(1).nullish(),
    sort_order: sortOrder.nullish(),
    active: z.boolean().nullish(),
});

// ========================================
// MODIFIERS
// ========================================

export const modifierCreateSchema = z.object({
    name,
    price: pence.default(0),
    sort_order: sortOrder.default(0),
});

export const modifierUpdateSchema = z.object({
    name: name.nullish(),
    price: pence.nullish(),
    sort_order: sortOrder.nullish(),
    active: z.boolean().nullish(),
});

// ========================================
// PRODUCT <-> MODIFIER GROUP
// ========================================

export const productModifierGroupSchema = z.object({
    modifier_group_id: id,
    sort_order: sortOrder.default(0),
});

// ========================================
// BRANCH PRODUCT OVERRIDES
// ========================================

export const branchProductOverrideSchema = z.object({
    active: z.boolean().nullish(),
    price_override: pence.nullish(),
});

// ========================================
// OFFERS
// ========================================

const offerRuleModifierGroupSchema = z.object({
    modifier_group_id: id,
    required: z.boolean().default(false),
    min_selections: z.int().min(0).default(0),
    max_selections: z.int().min(1).default(1),
    modifier_ids: z.array(id).default([]),
});

const offerRuleSchema = z.object({
    name,
    quantity: z.int().min(1).default(1),
    sort_order: sortOrder.default(0),
    product_ids: z.array(id).default([]),
    modifier_groups: z.array(offerRuleModifierGroupSchema).default([]),
});

export const offerCreateSchema = z.object({
    name,
    description: optionalText,
    type: offerType.default("FIXED_PRICE"),
    price: pence.nullish(),
    percentage: z.int().min(0).max(100).nullish(),
    discount_amount: pence.nullish(),
    starts_at: dateTime,
    ends_at: dateTime,
    sort_order: sortOrder.default(0),
    active: z.boolean().default(true),
    rules: z.array(offerRuleSchema).default([]),
});

export const offerUpdateSchema = z.object({
    name: name.nullish(),
    description: optionalText,
    type: offerType.nullish(),
    price: pence.nullish(),
    percentage: z.int().min(0).max(100).nullish(),
    discount_amount: pence.nullish(),
    starts_at: dateTime,
    ends_at: dateTime,
    sort_order: sortOrder.nullish(),
    active: z.boolean().nullish(),
    rules: z.array(offerRuleSchema).nullish(),
});

// ========================================
// ORDERS
// Prices are never accepted from the client, the server prices every order from the database
// ========================================

export const ORDER_TYPES = ["PICKUP", "DELIVERY"] as const;
export const ORDER_STATUSES = ["PENDING", "ACCEPTED", "PREPARING", "READY", "COMPLETED", "CANCELLED"] as const;

const optionalShortText = z.string().trim().min(1).nullish();

const orderItemSchema = z.object({
    product_id: id,
    quantity: z.int().min(1).max(99),
    notes: z.string().trim().max(1000).nullish(),
    modifier_ids: z.array(id).default([]),
});

// one bundle: the offer plus the products (and modifiers) picked for each of its rules
const orderOfferItemSchema = z.object({
    product_id: id,
    modifier_ids: z.array(id).default([]),
});

const orderOfferRuleSchema = z.object({
    offer_rule_id: id,
    items: z.array(orderOfferItemSchema).min(1).max(100),
});

const orderOfferSchema = z.object({
    offer_id: id,
    quantity: z.int().min(1).max(99).default(1),
    rules: z.array(orderOfferRuleSchema).min(1).max(50),
});

const orderPaymentSchema = z.object({
    provider: name,
    payment_reference: optionalShortText,
    provider_payment_id: optionalShortText,
}).transform(({ provider, payment_reference, provider_payment_id }) => ({
    provider,
    payment_reference: payment_reference ?? provider_payment_id ?? null,
}));

export const orderCreateSchema = z
    .object({
        branch_id: id,
        order_type: z.enum(ORDER_TYPES).default("PICKUP"),
        customer_name: name,
        customer_phone: optionalShortText,
        customer_email: z.email().nullish(),
        address_line1: optionalShortText,
        address_line2: optionalShortText,
        city: optionalShortText,
        postcode: optionalShortText,
        delivery_fee: pence.default(0),
        notes: z.string().trim().max(2000).nullish(),
        items: z.array(orderItemSchema).max(100).default([]),
        offers: z.array(orderOfferSchema).max(50).default([]),
        payment: orderPaymentSchema.nullish(),
    })
    .refine(order => order.items.length + order.offers.length > 0, "An order needs at least one item or offer")
    .refine(
        order => order.order_type === "PICKUP" || (order.address_line1 && order.city && order.postcode),
        "address_line1, city and postcode are required for DELIVERY orders"
    );

export const orderStatusUpdateSchema = z.object({
    id,
    status: z.enum(ORDER_STATUSES),
});

// ========================================
// INFERRED REQUEST TYPES
// ========================================

export type BusinessCreate = z.infer<typeof businessCreateSchema>;
export type BusinessUpdate = z.infer<typeof businessUpdateSchema>;
export type UserCreate = z.infer<typeof userCreateSchema>;
export type UserLogin = z.infer<typeof userLoginSchema>;
export type UserPasswordResetRequest = z.infer<typeof userPasswordResetRequestSchema>;
export type UserPasswordReset = z.infer<typeof userPasswordResetSchema>;
export type UserPasswordResetLegacy = z.infer<typeof userPasswordResetLegacySchema>;
export type BranchCreate = z.infer<typeof branchCreateSchema>;
export type BranchUpdate = z.infer<typeof branchUpdateSchema>;
export type OpeningHoursInput = z.infer<typeof openingHoursSchema>;
export type OpeningHoursPatch = z.infer<typeof openingHoursPatchSchema>;
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type ModifierGroupCreate = z.infer<typeof modifierGroupCreateSchema>;
export type ModifierGroupUpdate = z.infer<typeof modifierGroupUpdateSchema>;
export type ModifierCreate = z.infer<typeof modifierCreateSchema>;
export type ModifierUpdate = z.infer<typeof modifierUpdateSchema>;
export type ProductModifierGroupCreate = z.infer<typeof productModifierGroupSchema>;
export type BranchProductOverrideCreate = z.infer<typeof branchProductOverrideSchema>;
export type OfferRuleModifierGroupInput = z.infer<typeof offerRuleModifierGroupSchema>;
export type OfferRuleInput = z.infer<typeof offerRuleSchema>;
export type OfferCreate = z.infer<typeof offerCreateSchema>;
export type OfferUpdate = z.infer<typeof offerUpdateSchema>;
export type OrderOfferCreate = z.infer<typeof orderOfferSchema>;
export type OrderCreate = z.infer<typeof orderCreateSchema>;
export type OrderStatusUpdate = z.infer<typeof orderStatusUpdateSchema>;
