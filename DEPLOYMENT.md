# Deployment Guide

## Environment Variables

Set the following in Firebase App Hosting (or your `.env.local` for local dev):

```
# Public (client-side)
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=   # Required for Google Sign-In

# Server-side secrets
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
OPENAI_API_KEY=
CRON_SECRET=          # Random secret for cron endpoint authentication

# News API keys (at least one required)
NEWSDATA_API_KEY=
GNEWS_API_KEY=
GUARDIAN_API_KEY=
CURRENTS_API_KEY=
MEDIASTACK_API_KEY=
```

## Firebase Auth Setup

1. In Firebase Console → Authentication → Sign-in method → Enable **Google**
2. Add your deployed domain to the list of authorized domains

## Firestore Indexes

Deploy indexes from `firestore.indexes.json`:

```bash
firebase deploy --only firestore:indexes
```

## Firestore Rules

Deploy security rules from `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

## Cloud Scheduler — Automatic Case Refresh

Cases are refreshed automatically via a Cloud Scheduler job. Configure it in GCP Console:

1. Go to **Cloud Scheduler** → **Create Job**
2. Fill in:
   - **Name**: `refresh-cases`
   - **Frequency**: `0 6 * * *` (daily at 6am UTC)
   - **Timezone**: UTC
   - **Target**: HTTP
   - **URL**: `https://<your-domain>/api/cases/refresh`
   - **HTTP method**: GET
   - **Headers**: `Authorization: Bearer <CRON_SECRET>`

3. Also update the existing cron job for task processing:
   - **URL**: `https://<your-domain>/api/cron`
   - **HTTP method**: GET
   - **Headers**: `Authorization: Bearer <CRON_SECRET>`

## Google Maps / World Atlas

The world map uses `world-atlas` CDN (no API key needed):
`https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`

This is fetched client-side — ensure your CSP allows jsdelivr.net if applicable.
