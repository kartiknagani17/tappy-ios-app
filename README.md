# Tapi

An iOS app that tells people whether a grocery product fits their diet: scan a barcode, and Tapi checks the ingredients against their dietary profile.

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
| 4 | How did you hear about Tapi? | `onboarding/hear.tsx` |
| 5 | What does eating healthier mean to you? | `onboarding/goal.tsx` |
| 6 | Banned in Europe | `onboarding/europe.tsx` |
| 7 | We'll help you avoid these ingredients | `onboarding/avoid.tsx` |
| 8 | Digital food detective | `onboarding/detective.tsx` |
| 9 | How long do you want to try this diet? | `onboarding/duration.tsx` |
| 10 | Make it official (press & hold) → Goal set! | `onboarding/commit.tsx` |
| 11 | You're committed | `onboarding/committed.tsx` |
| 12 | Other dietary restrictions? | `onboarding/other.tsx` |
| 13 | Tapi covers 2,900+ needs (+ "Why?" sheet) | `onboarding/covers.tsx` |
| 14 | Dietary restrictions picker + severity/checklist sheets | `onboarding/restrictions.tsx`, `components/RestrictionSheet.tsx` |
| 15 | Your Tapi looks great: Dietary Profile / Ingredient Lookup | `onboarding/profile.tsx` |
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

## Where to plug in real services

These are stubbed so the app is fully clickable today:

| What | Where | Replace with |
|------|-------|--------------|
| Purchases / free trial | `src/lib/subscription.ts` → `startTrial`, `restorePurchases` | RevenueCat (`react-native-purchases`) or StoreKit |
| Product lookup after a barcode scan | `src/app/(tabs)/scan.tsx` → `onScanned` | Your product database / Open Food Facts API |
| Ingredient catalog (~300 sample entries) | `src/data/ingredients.ts` | Your full 2,900+ ingredient list |
| Auth (email, Google, Apple, Facebook) | `src/app/auth.tsx` | Supabase / Firebase / Clerk + Sign in with Apple |
| Feedback forms | `src/components/FeedbackSheet.tsx` | Your backend or a form endpoint |
| Terms / Privacy URLs | `src/lib/subscription.ts` | Your real legal pages |
| Paywall testimonials | `src/app/onboarding/paywall.tsx` → `REVIEWS` | Real App Store reviews |
| "872 people have joined this plan today!" | `src/lib/subscription.ts` → `JOINED_TODAY` | Your real daily conversion count (e.g. remote config) |

Brand colors live in `src/theme.ts`.

## How ratings work

Every restriction maps to ingredient *tags* (e.g. Gluten free → `gluten`). Severe/Intolerance selections mark matching ingredients **Avoid** (red); Preference marks them **Limit this** (yellow). Users can override any single ingredient in Ingredient Lookup (tap the icon to cycle, or open details). See `src/lib/ratings.ts`.

## Scripts

```bash
npm run typecheck
```

```bash
npm run lint
```
