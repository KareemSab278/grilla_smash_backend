import { z } from "zod";

// ========================================
// SHARED
// ========================================

const name = z.string().trim().min(1);
const optionalText = z.string().nullish();
const pence = z.int().min(0);
const sortOrder = z.int();
const id = z.string().min(1);

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
// BRANCHES
// ========================================

export const branchCreateSchema = z.object({
    name,
    address_line1: name,
    address_line2: optionalText,
    city: name,
    postcode: name,
    phone: optionalText,
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
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
// INFERRED REQUEST TYPES
// ========================================

export type BusinessCreate = z.infer<typeof businessCreateSchema>;
export type BusinessUpdate = z.infer<typeof businessUpdateSchema>;
export type BranchCreate = z.infer<typeof branchCreateSchema>;
export type BranchUpdate = z.infer<typeof branchUpdateSchema>;
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
