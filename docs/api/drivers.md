# Driver & Vehicle API

The driver and vehicle endpoints expose the logistics tracking data stored in
delivery manifests, letting third-party logistics providers integrate without
needing direct database access.

---

## Authentication

Every endpoint requires a valid `Authorization: Bearer <token>` header.  Obtain
a token through the standard auth flow:

1. `POST /auth/challenge` with your Stellar public key.
2. Sign the returned challenge with your wallet.
3. `POST /auth/verify` with the signature — the response contains the token.

Requests without a valid token receive **401 Unauthorized**.

## Roles & visibility

| Role      | Visible records                              |
|-----------|----------------------------------------------|
| `seller`  | Manifests where they are the trade seller     |
| `mediator`| All manifests                                |
| `admin`   | All manifests                                |
| `buyer`   | Not permitted (403)                          |

Buyer accounts do not receive driver identity information because the manifest
intentionally masks driver details from buyers (see `GET /trades/{id}/manifest`).

---

## Endpoints

### GET /drivers

List all driver assignment records visible to the caller.

**Roles:** seller, mediator, admin

**Response `200`**

```json
{
  "drivers": [
    {
      "id": 1,
      "tradeId": "trade-abc-123",
      "driverName": "John Doe",
      "driverIdNumber": "DRV-12345",
      "driverNameHash": "a3f1...",
      "driverIdHash": "b7c2...",
      "vehicleRegistration": "ABC-001",
      "routeDescription": "Lagos to Abuja via Lokoja",
      "expectedDeliveryAt": "2026-12-01T09:00:00.000Z",
      "createdAt": "2026-11-25T08:00:00.000Z"
    }
  ]
}
```

---

### GET /drivers/{driverId}

Fetch the full driver and vehicle record for a single delivery manifest.

**Path parameter**

| Name       | Type    | Description                    |
|------------|---------|--------------------------------|
| `driverId` | integer | Manifest (driver record) ID    |

**Roles:** seller (own trades), mediator, admin

**Response `200`**

```json
{
  "id": 1,
  "tradeId": "trade-abc-123",
  "driverName": "John Doe",
  "driverIdNumber": "DRV-12345",
  "driverNameHash": "a3f1...",
  "driverIdHash": "b7c2...",
  "vehicleRegistration": "ABC-001",
  "routeDescription": "Lagos to Abuja via Lokoja",
  "expectedDeliveryAt": "2026-12-01T09:00:00.000Z",
  "createdAt": "2026-11-25T08:00:00.000Z"
}
```

**Error responses**

| Status | Condition                               |
|--------|-----------------------------------------|
| 400    | `driverId` is not a positive integer    |
| 401    | Missing or invalid bearer token         |
| 403    | Caller role is not allowed              |
| 404    | No manifest found for that ID           |

---

### GET /vehicles

List all vehicle assignment records visible to the caller.

**Roles:** seller, mediator, admin

**Response `200`**

```json
{
  "vehicles": [
    {
      "id": 1,
      "tradeId": "trade-abc-123",
      "vehicleRegistration": "ABC-001",
      "routeDescription": "Lagos to Abuja via Lokoja",
      "expectedDeliveryAt": "2026-12-01T09:00:00.000Z",
      "createdAt": "2026-11-25T08:00:00.000Z"
    }
  ]
}
```

---

### GET /vehicles/{registration}

Fetch all manifests that used a specific vehicle registration plate.  A single
plate may appear on multiple historical manifests.

**Path parameter**

| Name           | Type   | Description                     |
|----------------|--------|---------------------------------|
| `registration` | string | Vehicle registration plate, e.g. `ABC-001` |

**Roles:** seller (own trades), mediator, admin

**Response `200`**

```json
{
  "vehicles": [
    {
      "id": 1,
      "tradeId": "trade-abc-123",
      "vehicleRegistration": "ABC-001",
      "routeDescription": "Lagos to Abuja via Lokoja",
      "expectedDeliveryAt": "2026-12-01T09:00:00.000Z",
      "createdAt": "2026-11-25T08:00:00.000Z"
    }
  ]
}
```

**Error responses**

| Status | Condition                               |
|--------|-----------------------------------------|
| 401    | Missing or invalid bearer token         |
| 403    | Caller role is not allowed              |
| 404    | No records found for that registration  |

---

## Data notes

### Driver identity fields

`driverName` and `driverIdNumber` are stored in plaintext on the
`DeliveryManifest` record for mediator review during disputes.  Their SHA-256
hashes (`driverNameHash`, `driverIdHash`) are what gets committed on-chain so
that identity can be verified without exposing raw PII to the blockchain.

Logistics providers should use the hash values to confirm a driver's identity
against a known pre-image rather than transmitting the plaintext over their own
systems.

### Vehicle records

The `/vehicles` endpoints return manifest-level records, not a canonical vehicle
registry.  If the same plate appears on two trades you get two records, each
linked to its own `tradeId`.

---

## OpenAPI spec

The machine-readable definitions for these endpoints live in
`backend/src/docs/openapi.yaml` under the `Drivers` and `Vehicles` tags.  Run
`npm run spec:package` from the `backend/` directory to generate the
distributable `dist/openapi.json`.
