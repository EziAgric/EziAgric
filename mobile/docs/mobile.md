# Mobile Environment Setup

This document defines the minimal mobile backend environment requirements for the Amana project.

## Purpose

Provide a small, stable setup for mobile developers to integrate with the Amana backend without imposing a full mobile app implementation.

## Environment setup

Copy the example file to create mobile-specific runtime variables:

```bash
cp .env.mobile.example .env.mobile
```

### Required variables

- `MOBILE_PUSH_PROVIDER=expo`
- `MOBILE_PUSH_SECRET=`
- `MOBILE_API_URL=https://api.amana.example.com`
- `MOBILE_CDN_BASE_URL=https://cdn.amana.example.com`
- `MOBILE_TOKEN_LIFETIME_SECONDS=3600`
- `MOBILE_REFRESH_TOKEN_LIFETIME_SECONDS=1209600`

## Notes

- This setup is intentionally minimal: it provides environment configuration only.
- The backend still uses the same authentication, trade, and evidence services as the web application.
- Mobile client implementation can be developed separately in `Amana-Mobile/`.
