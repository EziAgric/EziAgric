# Admin API

Endpoints under the admin surface. Only the feature-flag section is documented
here so far. Other admin endpoints are described in
[`backend/src/docs/openapi.yaml`](../../backend/src/docs/openapi.yaml).

## Feature flags

See [Feature flags](../feature-flags.md) for the overall status and the gaps.

### `GET /api/admin/features`

Returns the flag map.

- **Auth:** admin bearer token (`adminAuth` in the spec).
- **Responses:** `200` with the flag status map; `401` unauthorized.
- **Response shape** (from the mobile client's types in `mobile/src/api/admin.ts`):

  ```json
  {
    "flags": {
      "beta": { "enabled": true, "rolloutPercentage": 25 }
    }
  }
  ```

  `rolloutPercentage` is optional.

### `PATCH /admin/features/{name}`

Sets a flag. **Not in the OpenAPI spec.** This is what the mobile client sends:

- **Path param:** `name`, alphanumeric with `.`, `-` or `_`, max 100 characters.
- **Body:** `{ "enabled": boolean, "rolloutPercentage"?: number }`
- **Response:** `{ "name": string, "flag": { "enabled": boolean, "rolloutPercentage"?: number } }`

The path does not include `/api`, unlike the `GET` above. Confirm the prefix
before relying on this section.

The backend handler for either endpoint is not in this repository. Calling
these endpoints against the current tree is unverified.
