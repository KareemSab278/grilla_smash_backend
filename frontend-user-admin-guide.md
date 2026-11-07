# Frontend guide: users, admins, and managers

This guide describes the current backend behavior for the admin panel. It is important not to infer
permissions from the role names: the backend has only limited role enforcement today.

## Roles and authorization today

The `users` table supports two roles: `ADMIN` and `MANAGER`. Both roles can log in and receive
`{ id, username, role }`.

| Capability | ADMIN | MANAGER | What the backend currently enforces |
|---|---:|---:|---|
| Sign in | Yes | Yes | Username and password; no business-key header is required |
| Write branch settings | Yes | Yes | Only when `BRANCH_SETTINGS_AUTH_ENABLED=true`; then `Authorization: Bearer <user-id>` must refer to an active user |
| Create another admin | Not by role identity alone | Not by role identity alone | Business key plus a one-time code delivered to every active admin with an email address |
| Create a manager | Not by role identity alone | Not by role identity alone | Business key |
| Use other API routes | No role distinction | No role distinction | Most routes are currently public; role-based authorization is not generally wired in |

Branch settings accept both roles equally; the API does not currently define separate manager
permissions or branch assignments. The branch-settings bearer value is a user ID, not a secure
authentication token. Do not present it as production-grade authentication. `BRANCH_SETTINGS_AUTH_ENABLED`
defaults to `false`, which bypasses that role check for local development.

The business key is a shared secret for the admin panel, not the identity of a logged-in admin. Do
not treat a successful login response as proof that an API request was authorized; secure per-user
authentication and role policies still need to be implemented.

## Admin account creation

The first admin must be provisioned manually in the database. There is no way to obtain a verification
code until at least one active `ADMIN` has a non-null email address. Manager creation does not have
this bootstrap limitation.

Creating each additional admin is a two-request flow. Both requests require:

```http
X-Business-Key: <business-key>
Content-Type: application/json
```

### 1. Request a code

```http
POST /user/admin_creation_code
```

Body:

```json
{
  "username": "new_admin",
  "email": "new-admin@example.com"
}
```

The backend emails the same six-digit verification code and proposed username/email to every active
admin with an email address. Codes expire after five minutes, are single-use, allow five incorrect
attempts, and cannot be re-requested for the same username/email during the expiry window. The code
is held as a hash in the backend process memory; restarting the process invalidates it.

Success (`200`):

```json
{
  "message": "Verification code sent to all active administrators",
  "expires_in_seconds": 300
}
```

Possible errors include `401` for a missing/invalid business key, `409` when there are no active
admin email addresses, `422` for invalid request data, `429` if a code was recently sent, and `500`
if delivery to any admin address failed. On delivery failure the code is invalidated and no account
is created; request a fresh code after resolving the email delivery issue.

### 2. Submit the account and code

```http
POST /user/new_admin
```

Body:

```json
{
  "username": "new_admin",
  "password": "a-long-password",
  "email": "new-admin@example.com",
  "verification_code": "123456"
}
```

`username` must be 3–50 characters, `password` 8–128 characters, and `email` valid. The username
and email must exactly match the request that received the code (email comparison is case-insensitive).
The code is consumed once; a wrong/expired code returns `400`. A duplicate username or email returns
`409`.

Success (`201`):

```json
{
  "user": {
    "id": "a1b2c3d4e5f6",
    "username": "new_admin",
    "email": "new-admin@example.com",
    "role": "ADMIN",
    "active": true,
    "created_at": "2026-10-18T18:00:00.000Z",
    "updated_at": "2026-10-18T18:00:00.000Z"
  },
  "admin_notifications": {
    "sent": 2,
    "failed": 0
  }
}
```

The account is created before the completion notifications are sent. `admin_notifications` reports
how many completion emails succeeded/failed; a non-zero `failed` count means the account exists but
some active admins did not receive the completion email. The verification email already notified
those admins of the pending request and provided the code.

## Creating a manager

```http
POST /user/new_manager
X-Business-Key: <business-key>
Content-Type: application/json
```

Body:

```json
{
  "username": "branch_manager",
  "password": "a-long-password",
  "email": "manager@example.com"
}
```

Returns `201` with the created public user (no password hash). This operation currently does not
require a logged-in admin identity or email verification; possession of the business key is the gate.

## Login and password reset

`POST /user/login` takes `{ "username": "...", "password": "..." }` and returns
`{ "id": "...", "username": "...", "role": "ADMIN" }` or `"MANAGER"`. Invalid/inactive credentials
return `401`. Login does not require the business key.

Password reset routes also do not require the business key:

- `POST /user/reset_password_request` with `{ "email": "..." }` emails a reset code when the active account exists. Its response does not disclose whether the account exists.
- `POST /user/reset_password` with `{ "email": "...", "reset_code": "123456", "new_password": "..." }` consumes the code and changes the password.

Reset codes have the same five-minute lifetime and five-attempt limit as admin-creation codes.

## Editing product ingredients

The admin product editor can load a product with `GET /products/:productId` (or use the
`ingredients` array returned by `GET /products`) and edit that list. These are the ingredients
customers may request to remove from the product.

To replace the list, send the complete array to the existing product update route:

```http
PUT /products/:productId
Content-Type: application/json
```

```json
{
  "ingredients": ["Lettuce", "Tomato", "Pickles"]
}
```

The response contains the updated product, including `ingredients`. The array replaces the old
list: send `[]` to clear it, or omit `ingredients` to leave it unchanged. Product creation also
accepts `ingredients`; it defaults to `[]`.

When placing an order, the storefront sends the exact selected names in that item's
`removed_ingredients` array. The backend rejects names not present in the product's ingredient
list and includes accepted removals in the order item returned by the order GET routes.

Product routes follow the existing API authorization behavior: they are not currently restricted
to `ADMIN` users. The role model is not generally enforced for product management.

## Updating unavailable products for a branch

Use this endpoint when saving the full set of products that should be unavailable at a branch:

```http
PUT /branches/:branchId/unavailable-products
Content-Type: application/json
Authorization: Bearer <user-id>
```

The authorization header is only required when `BRANCH_SETTINGS_AUTH_ENABLED=true`; the current
branch-settings guard expects the logged-in user's ID as the bearer value. Do not send the business
key for this endpoint.

Send the complete list of unavailable product IDs, not only the IDs changed in the UI:

```json
{
  "unavailable_products": ["product-id-1", "product-id-2"]
}
```

An empty array clears the branch's unavailable list:

```json
{
  "unavailable_products": []
}
```

Example frontend helper:

```ts
type Branch = {
  id: string;
  unavailable_products: string[];
  // Other branch fields are returned too.
};

async function saveUnavailableProducts(
  apiBaseUrl: string,
  branchId: string,
  unavailableProductIds: string[],
  userId?: string
): Promise<Branch> {
  const response = await fetch(
    `${apiBaseUrl}/branches/${encodeURIComponent(branchId)}/unavailable-products`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(userId ? { Authorization: `Bearer ${userId}` } : {}),
      },
      body: JSON.stringify({ unavailable_products: unavailableProductIds }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail ?? `Unable to save branch availability (${response.status})`);
  }

  return response.json() as Promise<Branch>;
}
```

On success (`200`), the response is the updated branch row; use its `unavailable_products` value to
refresh local state. Product IDs must exist. Invalid input returns `422`; a missing branch or product
returns `404`; enabled branch authorization can return `401` or `403`. Since this replaces the whole
list, send the full current selection when saving and send `[]` only when the intent is to clear it.

## Frontend implementation notes

- Keep the business key out of public/customer-facing bundles. It is a shared secret and is not a substitute for user authentication.
- After requesting an admin code, show the user a message that all current admins were emailed. Do not assume a code was sent if the request returned an error.
- Do not retry admin creation blindly after a network timeout: the account could have been created and completion notifications may have been sent. Resolve by attempting login or checking the user through a trusted administrative process.
- Do not use `role` to unlock sensitive UI actions as if the backend enforces those actions. The backend role model is not yet a complete authorization system.
