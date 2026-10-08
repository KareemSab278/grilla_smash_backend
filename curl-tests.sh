# Backend curl tests
#
# Set your server URL here:
#   export BASE_URL=http://127.0.0.1:8000
#
# These are separated by test so you can run them one at a time.
# Replace {businessId}, {branchId}, etc. with the IDs returned by earlier tests.

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
JSON="Content-Type: application/json"

###############################################################################
# TEST 01 - HEALTH
###############################################################################

curl -s "$BASE_URL/"
echo
curl -s "$BASE_URL/health"
echo

###############################################################################
# TEST 02 - BUSINESS
###############################################################################

curl -s -X GET "$BASE_URL/business"
echo

curl -s -X POST "$BASE_URL/business" \
  -H "$JSON" \
  -d '{
    "name": "Grill'"'"'a Smash",
    "slug": "grilla-smash",
    "logo_url": null,
    "currency": "GBP"
  }'
echo

# Replace {businessId} with the id returned by the POST above
curl -s -X PUT "$BASE_URL/business/{businessId}" \
  -H "$JSON" \
  -d '{
    "name": "Grill'"'"'a Smash Updated",
    "active": true
  }'
echo

###############################################################################
# TEST 03 - BRANCHES
###############################################################################

curl -s -X GET "$BASE_URL/branches"
echo

curl -s -X POST "$BASE_URL/branches" \
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
  }'
echo

# Replace {branchId} with the id returned by the POST above
curl -s -X GET "$BASE_URL/branches/{branchId}"
echo

curl -s -X PUT "$BASE_URL/branches/{branchId}" \
  -H "$JSON" \
  -d '{
    "name": "Main Branch Updated",
    "active": false
  }'
echo

###############################################################################
# TEST 04 - CATEGORIES
###############################################################################

curl -s -X GET "$BASE_URL/categories"
echo

curl -s -X POST "$BASE_URL/categories" \
  -H "$JSON" \
  -d '{
    "name": "Burgers",
    "description": "All burgers",
    "image_url": null,
    "sort_order": 0
  }'
echo

# Replace {categoryId} with the id returned by the POST above
curl -s -X GET "$BASE_URL/categories/{categoryId}"
echo

curl -s -X PUT "$BASE_URL/categories/{categoryId}" \
  -H "$JSON" \
  -d '{
    "name": "Burgers & Smash",
    "active": true
  }'
echo

###############################################################################
# TEST 05 - PRODUCTS
###############################################################################

curl -s -X GET "$BASE_URL/products"
echo

curl -s -X GET "$BASE_URL/products?active_only=true"
echo

# Replace {categoryId} with a real category id
curl -s -X POST "$BASE_URL/products" \
  -H "$JSON" \
  -d '{
    "name": "Classic Smash Burger",
    "description": "Single patty burger",
    "price": 899,
    "image_url": null,
    "sort_order": 0,
    "category_ids": ["{categoryId}"]
  }'
echo

# Replace {productId} with the id returned by the POST above
curl -s -X GET "$BASE_URL/products/{productId}"
echo

curl -s -X PUT "$BASE_URL/products/{productId}" \
  -H "$JSON" \
  -d '{
    "name": "Classic Smash Burger XL",
    "price": 999,
    "active": true,
    "category_ids": ["{categoryId}"]
  }'
echo

curl -s -X DELETE "$BASE_URL/products/{productId}"
echo

###############################################################################
# TEST 06 - MODIFIER GROUPS
###############################################################################

curl -s -X GET "$BASE_URL/modifier-groups"
echo

curl -s -X POST "$BASE_URL/modifier-groups" \
  -H "$JSON" \
  -d '{
    "name": "Sauce Choice",
    "required": true,
    "min_selections": 1,
    "max_selections": 2,
    "sort_order": 0
  }'
echo

# Replace {groupId} with the id returned by the POST above
curl -s -X GET "$BASE_URL/modifier-groups/{groupId}"
echo

curl -s -X PUT "$BASE_URL/modifier-groups/{groupId}" \
  -H "$JSON" \
  -d '{
    "name": "Sauce Choice Updated",
    "required": true,
    "min_selections": 1,
    "max_selections": 2
  }'
echo

###############################################################################
# TEST 07 - MODIFIERS
###############################################################################

# Replace {groupId} with a real modifier group id
curl -s -X POST "$BASE_URL/modifier-groups/{groupId}/modifiers" \
  -H "$JSON" \
  -d '{
    "name": "Mayo",
    "price": 0,
    "sort_order": 0
  }'
echo

# Replace {modifierId} with the id returned by the POST above
curl -s -X PUT "$BASE_URL/modifiers/{modifierId}" \
  -H "$JSON" \
  -d '{
    "name": "Spicy Mayo",
    "price": 25,
    "active": true
  }'
echo

curl -s -X DELETE "$BASE_URL/modifiers/{modifierId}"
echo

###############################################################################
# TEST 08 - PRODUCT / MODIFIER GROUP LINKS
###############################################################################

# Replace {productId} and {groupId} with real ids
curl -s -X POST "$BASE_URL/products/{productId}/modifier-groups" \
  -H "$JSON" \
  -d '{
    "modifier_group_id": "{groupId}",
    "sort_order": 0
  }'
echo

curl -s -X GET "$BASE_URL/products/{productId}/modifier-groups"
echo

curl -s -X DELETE "$BASE_URL/products/{productId}/modifier-groups/{groupId}"
echo

###############################################################################
# TEST 09 - BRANCH PRODUCT OVERRIDES
###############################################################################

# Replace {branchId} and {productId} with real ids
curl -s -X GET "$BASE_URL/branches/{branchId}/products"
echo

curl -s -X PUT "$BASE_URL/branches/{branchId}/products/{productId}" \
  -H "$JSON" \
  -d '{
    "active": true,
    "price_override": 799
  }'
echo

curl -s -X GET "$BASE_URL/branches/{branchId}/products"
echo

curl -s -X DELETE "$BASE_URL/branches/{branchId}/products/{productId}"
echo

###############################################################################
# TEST 10 - OFFERS
###############################################################################

curl -s -X GET "$BASE_URL/offers"
echo

# Replace {productId}, {groupId}, {modifierId} with real ids
curl -s -X POST "$BASE_URL/offers" \
  -H "$JSON" \
  -d '{
    "name": "Burger Meal Deal",
    "description": "Burger + sauce",
    "type": "FIXED_PRICE",
    "price": 1199,
    "percentage": null,
    "discount_amount": null,
    "starts_at": "2026-10-08T12:00:00Z",
    "ends_at": "2026-10-09T12:00:00Z",
    "sort_order": 0,
    "active": true,
    "rules": [
      {
        "name": "Main",
        "quantity": 1,
        "sort_order": 0,
        "product_ids": ["{productId}"],
        "modifier_groups": [
          {
            "modifier_group_id": "{groupId}",
            "required": true,
            "min_selections": 1,
            "max_selections": 2,
            "modifier_ids": ["{modifierId}"]
          }
        ]
      }
    ]
  }'
echo

# Replace {offerId} with the id returned by the POST above
curl -s -X GET "$BASE_URL/offers/{offerId}"
echo

curl -s -X PUT "$BASE_URL/offers/{offerId}" \
  -H "$JSON" \
  -d '{
    "name": "Burger Meal Deal Updated",
    "active": false
  }'
echo

curl -s -X DELETE "$BASE_URL/offers/{offerId}"
echo

###############################################################################
# TEST 11 - NOT IMPLEMENTED YET
###############################################################################

echo "No /orders endpoints are implemented yet in this backend."
echo "No /deals endpoints are implemented yet in this backend."
