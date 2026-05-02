# Postman collection — Tuk-Tuk Tracking API

Two files in this folder:

- **`tuk-track-api.postman_collection.json`** — all 30+ requests organised by module
- **`tuk-track-api.postman_environment.json`** — variables (base URL, captured tokens, captured device credentials)

## Importing

1. Open Postman → **File → Import**
2. Drag both files in (or pick them via "Files")
3. In the top-right **environment dropdown**, select **`Tuk-Tuk API (Production)`**

The base URL is pre-filled to <https://tuk-track-api.onrender.com>. Change the `base_url` variable if you're running locally (e.g. `http://localhost:3000`).

## Demo flow (the order to run requests in for a viva walk-through)

| #   | Request                                                    | What it shows                                                              |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | **🔐 Auth → Login (HQ admin)**                             | JWT issuance — token auto-captured to env                                  |
| 2   | **📍 Master Data → List provinces**                        | Province master data (auto-captures `province_id` for WP)                  |
| 3   | **📍 Master Data → List districts (province=WP)**          | Filtering by province (captures `district_id` for COL)                     |
| 4   | **📍 Master Data → List stations (district=COL)**          | Filtering by district (captures `station_id`)                              |
| 5   | **📍 Master Data → List stations (province=WP)**           | JOIN-based filtering across station→district→province                      |
| 6   | **🚙 Vehicles → List vehicles (basic)**                    | 200 vehicles, paginated (auto-captures `vehicle_id`)                       |
| 7   | **🚙 Vehicles → List vehicles (filter status + province)** | Multi-criteria filter                                                      |
| 8   | **🚙 Vehicles → List vehicles (sort + sparse fields)**     | `?sort=-created_at&fields=id,plate_no` (L5 features)                       |
| 9   | **🚙 Vehicles → List vehicles (BAD sort)**                 | `?sort=password_hash` → **400 BAD_SORT** (allow-list defence)              |
| 10  | **🚙 Vehicles → Create vehicle**                           | `POST` returns 201 with `Location` header                                  |
| 11  | **📡 Devices → Provision NEW device**                      | Returns `key_id` + `hmac_secret` **once**; auto-captures both              |
| 12  | **🛰 Tracking (Device) → Submit single ping**              | HMAC-signed request via folder-level pre-request script — **202 Accepted** |
| 13  | **🛰 Tracking (Device) → Submit batch**                    | One signed request, 3 pings persisted                                      |
| 14  | **🛰 Tracking (Reads) → Last-known location**              | Live view for `vehicle_id`                                                 |
| 15  | **🛰 Tracking (Reads) → Vehicle history**                  | Time-window playback (last 7 days)                                         |
| 16  | **🛰 Tracking (Reads) → Live ops view (province=WP)**      | Cross-fleet "where is everyone now"                                        |
| 17  | **🔐 Auth → Login (Station officer)**                      | Switch identity to a station officer                                       |
| 18  | **🚙 Vehicles → List vehicles**                            | Now scope-filtered to that officer's station only                          |

That's the full Level-5 demonstration in 18 clicks.

## How auth flow works (no manual copy-paste)

`Login` requests have a **test script** that runs after the response and writes the tokens to environment variables:

```js
const body = pm.response.json();
pm.environment.set('access_token', body.accessToken);
pm.environment.set('refresh_token', body.refreshToken);
```

The collection has a default `Bearer {{access_token}}` auth, so every other request automatically sends the right header. When the access token expires (15 min), run **🔐 Auth → Refresh** to rotate it.

## How HMAC signing works in Postman

The folder **🛰 Tracking (Device Ingest)** has a **folder-level pre-request script** that runs before every request inside it. The script:

1. Reads `device_key_id` and `device_hmac_secret` from the environment (captured by **Provision NEW device**)
2. Generates a fresh `timestamp` and `nonce`
3. Builds the canonical signing string: `<ts>\n<nonce>\n<METHOD>\n<path>\n<sha256(body)>`
4. Computes `HMAC_SHA256(secret, signing_string)` using Postman's built-in `CryptoJS`
5. Adds `x-key-id`, `x-timestamp`, `x-nonce`, `x-signature` headers via `pm.request.headers.upsert()`

You'll see the signed request logged in the Postman Console (View → Show Postman Console) for debugging.

## Tips

- **The free Render tier sleeps after 15 min of idle.** First request after waking can take 30–60s. Subsequent requests are fast.
- **The `If-None-Match` demo** in the Master Data folder needs a real ETag value pasted in. Run `List provinces` first, copy the `ETag` response header, paste into the request, send — should return **304 Not Modified**.
- **Tampering demo:** edit `lat` in the body of the `Submit ping with TAMPERED body` request after the pre-request signs it; server returns **401 DEVICE_SIGNATURE_INVALID** because the signature was computed over the original body.
- **Replay demo:** send the same single ping request twice in quick succession; the second hits the nonce cache and returns **409 DEVICE_NONCE_REPLAY**.
