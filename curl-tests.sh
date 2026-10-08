#!/usr/bin/env bash
set -euo pipefail

# End to end smoke test of every endpoint, in dependency order (business -> branch -> category -> product ->
# modifiers -> offer -> order). Each POST captures the returned id and the later calls reuse it.
#
#   ./curl-tests.sh                                     against http://127.0.0.1:8000
#   BASE_URL=https://your-host ./curl-tests.sh          against another server
#
# Needs: the backend running, curl, python3. It creates real rows, and only one business is allowed,
# so a second run against the same database stops at TEST 02 ("Business already exists").

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
JSON="Content-Type: application/json"

extract_id() {
  python3 -c 'import json, sys; data=json.load(sys.stdin); print(data.get("id") or data.get("order_id"))'
}

section() {
  printf '\n###############################################################################\n'
  printf '# %s\n' "$1"
  printf '###############################################################################\n\n'
}

section "TEST 01 - HEALTH"
curl -sS "$BASE_URL/"
echo
curl -sS "$BASE_URL/health"
echo

section "TEST 02 - BUSINESS"
curl -sS -X GET "$BASE_URL/business"
echo

business_id="$(
  curl -sS -X POST "$BASE_URL/business" \
    -H "$JSON" \
    -d '{
      "name": "Grill'"'"'a Smash",
      "slug": "grilla-smash",
      "logo_url": null,
      "currency": "GBP"
    }' | extract_id
)"
curl -sS -X GET "$BASE_URL/business"
echo
curl -sS -X PUT "$BASE_URL/business/$business_id" \
  -H "$JSON" \
  -d '{
    "name": "Grill'"'"'a Smash Updated",
    "active": true
  }'
echo

section "TEST 03 - BRANCHES"
branch_id="$(
  curl -sS -X POST "$BASE_URL/branches" \
    -H "$JSON" \
    -d '{
      "name": "Main Branch",
      "address_line1": "1 High Street",
      "address_line2": null,
      "city": "London",
      "postcode": "SW1A 1AA",
      "phone": "02000000000",
      "latitude": 51.5074,
      "longitude": -0.1278
    }' | extract_id
)"
curl -sS -X GET "$BASE_URL/branches"
echo
curl -sS -X GET "$BASE_URL/branches/$branch_id"
echo
curl -sS -X PUT "$BASE_URL/branches/$branch_id" \
  -H "$JSON" \
  -d '{
    "name": "Main Branch Updated",
    "active": false
  }'
echo

section "TEST 04 - CATEGORIES"
category_id="$(
  curl -sS -X POST "$BASE_URL/categories" \
    -H "$JSON" \
    -d '{
      "name": "Burgers",
      "description": "All burgers",
      "image_url": null,
      "sort_order": 0
    }' | extract_id
)"
curl -sS -X GET "$BASE_URL/categories"
echo
curl -sS -X GET "$BASE_URL/categories/$category_id"
echo
curl -sS -X PUT "$BASE_URL/categories/$category_id" \
  -H "$JSON" \
  -d '{
    "name": "Burgers & Smash",
    "active": true
  }'
echo

section "TEST 05 - PRODUCTS"
product_id="$(
  curl -sS -X POST "$BASE_URL/products" \
    -H "$JSON" \
    -d "{
      \"name\": \"Classic Smash Burger\",
      \"description\": \"Single patty burger\",
      \"price\": 899,
      \"image_url\": null,
      \"sort_order\": 0,
      \"category_ids\": [\"$category_id\"]
    }" | extract_id
)"
curl -sS -X GET "$BASE_URL/products"
echo
curl -sS -X GET "$BASE_URL/products?active_only=true"
echo
curl -sS -X GET "$BASE_URL/products/$product_id"
echo
curl -sS -X PUT "$BASE_URL/products/$product_id" \
  -H "$JSON" \
  -d "{
    \"name\": \"Classic Smash Burger XL\",
    \"price\": 999,
    \"active\": true,
    \"category_ids\": [\"$category_id\"]
  }"
echo

section "TEST 06 - MODIFIER GROUPS"
group_id="$(
  curl -sS -X POST "$BASE_URL/modifier-groups" \
    -H "$JSON" \
    -d '{
      "name": "Sauce Choice",
      "required": true,
      "min_selections": 1,
      "max_selections": 2,
      "sort_order": 0
    }' | extract_id
)"
curl -sS -X GET "$BASE_URL/modifier-groups"
echo
curl -sS -X GET "$BASE_URL/modifier-groups/$group_id"
echo
curl -sS -X PUT "$BASE_URL/modifier-groups/$group_id" \
  -H "$JSON" \
  -d '{
    "name": "Sauce Choice Updated",
    "required": true,
    "min_selections": 1,
    "max_selections": 2
  }'
echo

section "TEST 07 - MODIFIERS"
modifier_id="$(
  curl -sS -X POST "$BASE_URL/modifier-groups/$group_id/modifiers" \
    -H "$JSON" \
    -d '{
      "name": "Mayo",
      "price": 0,
      "sort_order": 0
    }' | extract_id
)"
curl -sS -X PUT "$BASE_URL/modifiers/$modifier_id" \
  -H "$JSON" \
  -d '{
    "name": "Spicy Mayo",
    "price": 25,
    "active": true
  }'
echo

section "TEST 08 - PRODUCT / MODIFIER GROUP LINKS"
curl -sS -X POST "$BASE_URL/products/$product_id/modifier-groups" \
  -H "$JSON" \
  -d "{
    \"modifier_group_id\": \"$group_id\",
    \"sort_order\": 0
  }"
echo
curl -sS -X GET "$BASE_URL/products/$product_id/modifier-groups"
echo
curl -sS -X DELETE "$BASE_URL/products/$product_id/modifier-groups/$group_id"
echo

section "TEST 09 - BRANCH PRODUCT OVERRIDES"
curl -sS -X GET "$BASE_URL/branches/$branch_id/products"
echo
curl -sS -X PUT "$BASE_URL/branches/$branch_id/products/$product_id" \
  -H "$JSON" \
  -d '{
    "active": true,
    "price_override": 799
  }'
echo
curl -sS -X GET "$BASE_URL/branches/$branch_id/products"
echo
curl -sS -X DELETE "$BASE_URL/branches/$branch_id/products/$product_id"
echo

section "TEST 10 - OFFERS"
offer_id="$(
  curl -sS -X POST "$BASE_URL/offers" \
    -H "$JSON" \
    -d "{
      \"name\": \"Burger Meal Deal\",
      \"description\": \"Burger + sauce\",
      \"type\": \"FIXED_PRICE\",
      \"price\": 1199,
      \"percentage\": null,
      \"discount_amount\": null,
      \"starts_at\": \"2026-10-08T12:00:00Z\",
      \"ends_at\": \"2026-10-09T12:00:00Z\",
      \"sort_order\": 0,
      \"active\": true,
      \"rules\": [
        {
          \"name\": \"Main\",
          \"quantity\": 1,
          \"sort_order\": 0,
          \"product_ids\": [\"$product_id\"],
          \"modifier_groups\": [
            {
              \"modifier_group_id\": \"$group_id\",
              \"required\": true,
              \"min_selections\": 1,
              \"max_selections\": 2,
              \"modifier_ids\": [\"$modifier_id\"]
            }
          ]
        }
      ]
    }" | extract_id
)"
curl -sS -X GET "$BASE_URL/offers"
echo
curl -sS -X GET "$BASE_URL/offers/$offer_id"
echo
curl -sS -X PUT "$BASE_URL/offers/$offer_id" \
  -H "$JSON" \
  -d '{
    "name": "Burger Meal Deal Updated",
    "active": false
  }'
echo

section "TEST 11 - ORDERS"
# TEST 08 detached the sauce group, attach it again so the modifier below is valid for the product
curl -sS -X POST "$BASE_URL/products/$product_id/modifier-groups" \
  -H "$JSON" \
  -d "{\"modifier_group_id\": \"$group_id\", \"sort_order\": 0}"
echo

echo "-- create order (prices are calculated by the server, only ids are sent)"
order_id="$(
  curl -sS -X POST "$BASE_URL/orders" \
    -H "$JSON" \
    -d "{
      \"branch_id\": \"$branch_id\",
      \"order_type\": \"DELIVERY\",
      \"customer_name\": \"Jordan Test\",
      \"customer_phone\": \"07000000000\",
      \"customer_email\": \"jordan@example.com\",
      \"address_line1\": \"1 Test Street\",
      \"city\": \"London\",
      \"postcode\": \"SW1A 1AA\",
      \"delivery_fee\": 250,
      \"notes\": \"No onions please\",
      \"items\": [
        {
          \"product_id\": \"$product_id\",
          \"quantity\": 2,
          \"notes\": \"Extra crispy\",
          \"modifier_ids\": [\"$modifier_id\"]
        }
      ],
      \"payment\": { \"provider\": \"stripe\", \"provider_payment_id\": \"pi_test_123\" }
    }" | extract_id
)"
echo "Created order id: $order_id"

echo "-- missing required modifier is rejected (400)"
curl -sS -X POST "$BASE_URL/orders" \
  -H "$JSON" \
  -d "{
    \"branch_id\": \"$branch_id\",
    \"customer_name\": \"Jordan Test\",
    \"items\": [{ \"product_id\": \"$product_id\", \"quantity\": 1 }]
  }"
echo

echo "-- active orders for the branch"
curl -sS -X GET "$BASE_URL/orders/$branch_id"
echo

echo "-- last 30 days of orders for the branch"
curl -sS -X GET "$BASE_URL/orders/history/$branch_id"
echo

echo "-- update status"
curl -sS -X PATCH "$BASE_URL/orders/status" \
  -H "$JSON" \
  -d "{ \"id\": \"$order_id\", \"status\": \"PREPARING\" }"
echo

section "TEST 12 - NOT IMPLEMENTED YET"
echo "No /deals endpoints are implemented yet in this backend."
