# Tappy

An iOS app that tells people whether a grocery product fits their diet: scan a barcode, and Tappy checks the ingredients against their dietary profile.

Built with Expo (SDK 58) + React Native + Expo Router + TypeScript.

## Run it on your iPhone

```bash
npm install
```

```bash
npx expo start
```

Scan the QR code with the iPhone Camera app (requires the **Expo Go** app). The barcode scanner, haptics, and notifications all work in Expo Go.

To preview in a browser (camera scanning is iOS-only, but every other screen works):

```bash
npx expo start --web
```

## Ship to TestFlight / App Store

No Mac needed. EAS builds in the cloud:

```bash
npx eas-cli@latest build --platform ios
```

```bash
npx eas-cli@latest submit --platform ios
```

Before submitting, update `ios.bundleIdentifier` in `app.json`, and replace the app icon and splash in `assets/`.

## App flow

| # | Screen | File |
|---|--------|------|
| 1 | Splash (lime) | `src/app/index.tsx` |
| 2 | Welcome, notification prompt | `src/app/welcome.tsx` |
| 3 | How do you think about food? (+ clinician sheet) | `onboarding/mindset.tsx` |
| 4 | How did you hear about Tappy? | `onboarding/hear.tsx` |
| 5 | What does eating healthier mean to you? | `onboarding/goal.tsx` |
| 6 | Banned in Europe | `onboarding/europe.tsx` |
| 7 | We'll help you avoid these ingredients | `onboarding/avoid.tsx` |
| 8 | Digital food detective | `onboarding/detective.tsx` |
| 9 | How long do you want to try this diet? | `onboarding/duration.tsx` |
| 10 | Make it official (press & hold) → Goal set! | `onboarding/commit.tsx` |
| 11 | You're committed | `onboarding/committed.tsx` |
| 12 | Other dietary restrictions? | `onboarding/other.tsx` |
| 13 | Tappy covers N diets/allergies + N ingredients (+ "Why?" sheet) | `onboarding/covers.tsx` |
| 14 | Dietary restrictions picker + severity/checklist sheets | `onboarding/restrictions.tsx`, `components/RestrictionSheet.tsx` |
| 15 | Your Tappy looks great: Dietary Profile / Ingredient Lookup | `onboarding/profile.tsx` |
| 16 | Finishing your profile → confetti | `onboarding/finishing.tsx` |
| 17 | Personalized scanner ready | `onboarding/scanner-ready.tsx` |
| 18 | Unlimited Pass, 7 days free | `onboarding/pass.tsx` |
| 19 | Trial reminder | `onboarding/reminder.tsx` |
| 20 | Choose your plan (paywall) + "Before you go" offer | `onboarding/paywall.tsx` |
| 21 | Your safety is our priority (terms) | `onboarding/safety.tsx` |
| 22 | Scanner tab + push pre-prompt | `(tabs)/scan.tsx` |
| 23 | Create account / Log in | `src/app/auth.tsx` |
| 24 | Grocery, Recipes, Lists tabs | `src/app/(tabs)/` |

Onboarding branches based on answers (see `src/lib/flow.ts`). For example, choosing "Avoid controversial and unhealthy ingredients" adds the Europe + avoid-list screens, and skipping the duration question skips the press-and-hold commitment. The progress bar is calculated from the actual path.

## Payments (RevenueCat)

Subscriptions go through RevenueCat (`react-native-purchases`) in `src/lib/subscription.ts`. Purchases only work in a development, TestFlight or App Store build, not in Expo Go.

1. **App Store Connect → your app → Subscriptions:** create a subscription group with two auto-renewable subscriptions, `tapi_annual` (1 year, $49.99) and `tapi_annual_offer` (1 year, $39.99, the "Before you go" offer). Give each an introductory offer: **Free, 7 days**. Fill in the localization and review screenshot for each.
2. **App Store Connect → Users and Access → Integrations → In-App Purchase:** generate an In-App Purchase key (.p8) for RevenueCat.
3. **RevenueCat (free up to $2.5k/month in revenue):** create a project and an App Store app with bundle id `company.tappy.app`, upload the .p8 key, import both products, and create an entitlement called **`tappy_pro`** with both products attached.
4. Copy the RevenueCat **secret API key** (v1, `sk_…`, Project settings → API keys) into `REVENUECAT_SECRET_KEY` on the server (`/etc/tappy/tappy.env`), then restart `tappy-api`. The server uses it to check the `tappy_pro` entitlement and lift the daily scan limits for subscribers (barcode scans unlimited; photo scans keep a fair-use cap, `SUBSCRIBER_DAILY_PHOTO_SCANS`, default 100/day). Never put this key in the app.
5. Copy the RevenueCat **public iOS SDK key** (`appl_…`) into `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in `eas.json` (the `preview` and `production` profiles). It's a public key, so it's safe to commit.

The paywall shows the App Store's localized prices, offers the free trial only to Apple IDs that are eligible for it, and keeps the subscription state in step with renewals, refunds and expiry. When someone signs in, their purchases are tied to their Tappy account, so the subscription follows them to a new phone.

## Accounts

Email + password and Sign in with Apple run on the Tappy server (`server/src/services/auth.ts`, routes under `/api/auth` and `/api/account`). Passwords are hashed with scrypt, sessions are random bearer tokens (only their SHA-256 is stored) kept in the iOS Keychain, and login/signup/reset attempts are rate-limited per IP and per email. While signed in, the dietary profile is synced to the account and restored on a new phone. **Settings → Delete account** permanently deletes the account on the server (App Store Guideline 5.1.1(v)).

- Sign in with Apple: enable the **Sign In with Apple** capability for the `company.tappy.app` App ID in the Apple Developer portal (EAS does this automatically when it creates the provisioning profile). The server checks Apple's token against `APPLE_BUNDLE_ID`.
- Password reset sends a 6-digit code through [Resend](https://resend.com) (free tier). Set `RESEND_API_KEY` and `EMAIL_FROM` on the server. Without a key, "Forgot password?" is hidden.

## Terms of Use and Privacy Policy

The text lives in `server/src/legal/content.ts`. The app opens it in a popup (`src/components/LegalSheet.tsx`, closed with the × at the top), and the server publishes the same text at `https://<your API address>/terms` and `/privacy`. Use the `/privacy` URL in App Store Connect's **Privacy Policy URL** field. `LEGAL_OPERATOR` at the top of that file must match the seller name on the App Store (currently Jignesh Mandana); `LEGAL_CONTACT` is the support email. Have the text checked for your country before release.

## Still to replace

| What | Where | Replace with |
|------|-------|--------------|
| Ingredient catalog (~300 entries) | `src/data/ingredients.ts` | A larger list, if you have one. The in-app counts (`INGREDIENT_COUNT_LABEL`) follow the catalog automatically. |

Feedback forms post to `POST /api/feedback`; messages are stored on the server (read them with `node src/cli.ts feedback`) and emailed to `SUPPORT_EMAIL` when `RESEND_API_KEY` is set.

Brand colors live in `src/theme.ts`.

## Product database & scanning backend (`server/`)

Barcode lookup, front-of-package photo identification and ingredient-panel reading run on a small Node server with a local SQLite database built from free bulk data. Requires Node 22.18+ (it runs the TypeScript directly and uses the built-in `node:sqlite`).

### 1. Set environment variables

```bash
cp .env.example .env
```

Fill in `OPENAI_API_KEY` for photo scanning (`VISION_PROVIDER=openai`, the default; `anthropic` with `ANTHROPIC_API_KEY` also works). The USDA key is optional: the bulk CSV import doesn't use it. Set `EXPO_PUBLIC_API_URL` to where the app can reach the server (on a physical iPhone, your computer's LAN IP, e.g. `http://192.168.1.20:8787`). Never commit `.env`.

### 2. Download the data

```bash
cd server && npm install
```

```bash
npm run data:download
```

This streams two files into `server/data/raw/` (git-ignored):

| Source | File | Size |
|---|---|---|
| USDA FoodData Central, Branded Foods (CSV) | `FoodData_Central_branded_food_csv_2026-10-29.zip` | ~450 MB zipped, ~3 GB of CSV |
| Open Food Facts product export | `en.openfoodfacts.org.products.csv.gz` (tab-separated) | ~0.9 GB gzipped, ~9 GB raw |

New USDA releases come out about twice a year. Check https://fdc.nal.usda.gov/download-datasets for the newest Branded CSV and set `USDA_BRANDED_CSV_URL`. Open Food Facts files are listed at https://world.openfoodfacts.org/data.

### 3. Run the imports

```bash
npm run import:usda
```

```bash
npm run import:off
```

- Both stream their files (never loaded into memory). USDA is read straight from the zip in three passes (`food.csv`, `food_nutrient.csv`, then `branded_food.csv`), joined on `fdc_id` through SQLite staging tables. Open Food Facts is filtered to products whose `countries_tags` include `en:united-states`.
- Progress is logged every 50,000 rows, and each run is recorded in `import_runs`.
- Imports are idempotent (upserts keyed on source + GTIN-14), so re-running is safe and changes nothing if the data is the same.
- Raw source fields are kept in `source_records.raw_json`, so products can be re-merged without re-downloading.
- When both sources have a barcode, the record **with ingredients** wins, then the **newest update**; ties go to **USDA**. Missing images, sizes and nutrition are filled from the other source; ingredient lists are never mixed.

Measured on the October 2026 USDA file with a 512 MB heap cap (~180 MB actual memory): food_nutrient.csv (26.2M rows) streamed at ~96k rows/s, and the full import took 24 minutes. It read 2,010,212 branded rows (USDA keeps several versions per barcode; the newest wins) and produced **435,325 unique products, 99.5% with ingredient lists**, in a 2.2 GB SQLite file. Barcode lookups take 2–10 ms; a front-photo text search over all products takes ~150 ms. The Open Food Facts US import adds products USDA lacks, plus images.

```bash
npm run migrate
```

```bash
node src/cli.ts stats
```

(`stats` shows product counts by source, pending contributions, flagged products and daily vision spend.)

### 4. Start the API

```bash
npm start
```

To run it in production for free (Oracle Cloud Always Free + Cloudflare Tunnel for HTTPS), follow [`deploy/README.md`](deploy/README.md).

| Endpoint | Body | Result |
|---|---|---|
| `POST /api/scan/barcode` | `{ barcode }` | `found` (product + source + date), `needs_label_photo`, or `invalid_barcode` |
| `POST /api/scan/front` | `{ image_base64, contribute? }` | `match` (`confirm_top` / `choose_top3` with candidates), `needs_barcode_or_label`, `not_food_package` |
| `POST /api/scan/front/confirm` | `{ vision_cache_id, product_id }` | Records the user's confirmed choice for repeat photos |
| `POST /api/scan/label` | `{ image_base64, gtin?, front_hash?, contribute? }` | `contributed` (user-submitted, unverified), `existing_product`, or `unreadable` |
| `POST /api/products/:id/report` | `{ reason? }` | Increments `report_count` and flags the product for review |
| `POST /api/auth/signup`, `/api/auth/login` | `{ email, password }` | `{ token, account }` |
| `POST /api/auth/apple` | `{ identity_token, nonce }` | `{ token, account }` (Sign in with Apple) |
| `POST /api/auth/reset/request`, `/api/auth/reset/confirm` | `{ email }`, `{ email, code, password }` | Emails a 6-digit code; then sets the new password |
| `GET /api/account`, `POST /api/account/profile`, `POST /api/account/delete` | Bearer token | Account + synced profile; save profile; delete account |
| `GET /terms`, `GET /privacy` | | Public Terms of Use / Privacy Policy pages |

Every request sends an anonymous per-install `X-Tappy-User` header, used for rate limiting and the daily free quota.

### How a scan resolves

1. **Barcode** → normalized to GTIN-14 (UPC-A, EAN-13 with a leading zero and GTIN-14 all match; check digit validated) → `scan_cache` → local DB → the user's own pending ingredient-photo submission → optional live Open Food Facts lookup (`OFF_LIVE_LOOKUP=true`; custom User-Agent, capped below OFF's 15 requests/min) → `needs_label_photo`. Not-found results are cached with a short TTL. **No vision call is ever made on this path.**
2. **Front photo** → resized to ≤1024px on the phone → server re-encodes and strips EXIF → perceptual hash → `vision_cache` hit, or a vision call with strict JSON (schema-validated, one retry on invalid JSON, one escalation from `VISION_MODEL` to `VISION_ESCALATION_MODEL` on low confidence). A legible barcode in the photo goes through step 1. Otherwise the DB is searched (FTS5 trigram over brand + name + variant + size) and ranked by text similarity plus size match.
3. **Ingredient panel** → vision OCR of the ingredient list, the "Contains:" statement and Nutrition Facts → saved as a pending contribution tied to the GTIN (or the front-photo hash) → used for that user immediately, labeled "User-submitted, unverified".

The app always asks the user to confirm the matched product before showing a verdict, and the verdict screen shows which product and ingredient list it used, the source and its date.

### Tuning the thresholds

| Variable | Default | Effect |
|---|---|---|
| `MATCH_AUTO_CONFIRM_THRESHOLD` | 0.85 | At or above: show the top match for one-tap confirm |
| `MATCH_CHOOSE_THRESHOLD` | 0.5 | Between this and auto-confirm: show the top 3. Below: ask for the barcode or an ingredient photo |
| `MATCH_AMBIGUITY_MARGIN` | 0.03 | If the runner-up is this close to the top (e.g. several flavors of one product), show the top 3 instead of one |
| `VISION_ESCALATE_BELOW_CONFIDENCE` | 0.6 | Below this model confidence, retry once on the escalation model |
| `DAILY_FREE_SCANS` / `DAILY_FREE_PHOTO_SCANS` | 25 / 10 | Per-user daily quota (photo scans cost money) |
| `SUBSCRIBER_DAILY_PHOTO_SCANS` | 100 | Subscribers: barcode scans are unlimited, photo scans keep this fair-use cap |
| `RATE_LIMIT_PER_MINUTE` | 30 | Per-user burst limit (4x per IP) |

The score is a weighted blend: brand 0.30, name 0.45, variant 0.10, size 0.15 (`server/src/lib/match.ts`). Components the photo didn't show are left out and the rest renormalized; a photo with a single weak signal is capped at 0.7. To tune, add real photos' extracted JSON and the right answer to `server/test/fixtures/match_cases.json` and run the tests.

### Cost and privacy

- Every vision call is logged in `vision_calls` with model, tokens, latency and estimated cost (`PRICING` in `server/src/services/vision/provider.ts`).
- Repeat photos reuse the `vision_cache` (64-bit dHash, near-duplicates within Hamming distance 3).
- Photos are processed in memory and discarded. They're kept only if the user turns on **Settings → Share product photos**, and then only package photos the model classified as food packages, never people.
- Escalation calls to Claude Sonnet 5.5 opt into server-side refusal fallback (`fallbacks: "default"`), so a rare safety-classifier decline retries on a fallback model instead of failing the scan. Claude Haiku 5.5 has no server-side fallback; a refusal there escalates instead.

### Safety rules in the verdict

- No ingredient list means **no verdict** ("Not enough data").
- The app never says a product is "safe". The best result is "No conflicts found", always shown with "Check the package yourself".
- "May contain" statements count: they mark a product **Avoid** for severe (cross-contact not OK) restrictions, and **Limit** otherwise.

### Tests

```bash
cd server && npm test
```

The suite covers GTIN normalization and check digits, import idempotency, source-priority merging, matching thresholds with fixtures, cache hit/miss paths, vision JSON validation with a mocked model, and the HTTP endpoints.

### Licensing and the share-alike obligation

Open Food Facts data is licensed under the **Open Database License (ODbL)**. Tappy shows attribution in the app (**Settings → Data sources & credits**), and every product keeps its `source` field. ODbL is share-alike: if you publicly use a database **derived** from Open Food Facts (for example, this product table with OFF records merged in), you must offer that derived database, or the changes you made to it, under the ODbL, and keep the attribution. Using the data inside the app is fine; distributing a modified copy of the database means sharing it under the same license. Product images are CC BY-SA. USDA FoodData Central is public domain (CC0). See `NOTICE.md`.

## How ratings work

Every restriction maps to ingredient *tags* (e.g. Gluten free → `gluten`). Severe/Intolerance selections mark matching ingredients **Avoid** (red); Preference marks them **Limit this** (yellow). Users can override any single ingredient in Ingredient Lookup (tap the icon to cycle, or open details). See `src/lib/ratings.ts`.

## Scripts

```bash
npm run typecheck
```

```bash
npm run lint
```
