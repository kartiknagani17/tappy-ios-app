/**
 * Terms of Use and Privacy Policy. Single source: the app shows these in an in-app popup
 * (src/components/LegalSheet.tsx) and the server publishes them at /terms and /privacy for the
 * App Store Connect "Privacy Policy URL" field.
 *
 * Plain data only (no Node or React Native imports), so both the app and the server can import it.
 * Before release, have the operator name and governing-law clause checked for your jurisdiction.
 */

/** Must match the seller name App Store Connect shows for the app. */
export const LEGAL_OPERATOR = 'Jignesh Mandana';
export const LEGAL_CONTACT = 'kartiknagani17@gmail.com';
export const LEGAL_UPDATED = 'November 1, 2026';

export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { id: 'terms' | 'privacy'; title: string; updated: string; intro: string; sections: LegalSection[] };

export const TERMS: LegalDoc = {
  id: 'terms',
  title: 'Terms of Use',
  updated: LEGAL_UPDATED,
  intro: `These Terms of Use ("Terms") are an agreement between you and ${LEGAL_OPERATOR} ("Tappy", "we", "us") and apply to the Tappy iOS app and related services (the "Service"). By using the Service you agree to these Terms. If you don't agree, don't use the Service.`,
  sections: [
    {
      heading: '1. What Tappy does, and what it doesn’t',
      body: [
        'Tappy helps you check whether a packaged food product appears to fit the dietary profile you set up, by comparing the ingredient and allergen information we have for that product with your selections.',
        'Tappy is an informational tool. It is NOT medical advice, and it is not a substitute for reading the package, talking to a doctor, dietitian or allergist, or following a medical plan you have been given.',
        'Product information comes from public databases (such as USDA FoodData Central and Open Food Facts), from text read from photos you take, and from other users. It can be incomplete, out of date or wrong, and manufacturers change recipes without notice. A result of "No conflicts found" only means we found no conflict in the information we have. It never means a product is safe for you.',
        'If you have a severe allergy or a medical condition, always read the label on the package in your hand before eating, and follow your doctor’s advice. In an emergency, call your local emergency number.',
      ],
    },
    {
      heading: '2. Eligibility',
      body: [
        'You must be at least 13 years old to use the Service, and old enough to agree to these Terms where you live. If you are under the age of majority, a parent or guardian must agree to these Terms for you.',
      ],
    },
    {
      heading: '3. Your account',
      body: [
        'You can use Tappy without an account. If you create one (with email and password or Sign in with Apple), keep your password secret and tell us if you think someone else has used your account. You are responsible for activity on your account.',
        'You can delete your account at any time in the app under Settings → Delete account. This permanently deletes your account and the dietary profile stored with it.',
      ],
    },
    {
      heading: '4. Subscriptions, free trials and billing',
      body: [
        'Some features require a paid subscription ("Tappy Unlimited"). Prices are shown in the app before you buy, in your local currency.',
        'Tappy Unlimited removes the daily limit on barcode scans. Photo scans, which use a paid text-recognition service, have a fair-use limit of 100 per day for subscribers.',
        'Payment is charged to your Apple ID account when you confirm the purchase. Subscriptions renew automatically at the end of each period unless auto-renew is turned off at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the end of the current period.',
        'If a free trial is offered, you will be charged when the trial ends unless you cancel at least 24 hours before it ends. Any unused part of a free trial is forfeited when you buy a subscription.',
        'You can manage or cancel your subscription in your iPhone’s Settings → [your name] → Subscriptions. Deleting the app or your Tappy account does not cancel a subscription.',
        'Purchases are processed by Apple and are subject to Apple’s terms. Refund requests are handled by Apple at reportaproblem.apple.com.',
      ],
    },
    {
      heading: '5. Acceptable use',
      body: [
        'Don’t misuse the Service. In particular, don’t: try to get around scan limits or security measures; scrape, copy or resell the product database; send automated or abusive requests; upload photos of people or anything other than food packaging and labels; submit information you know is false; or use the Service to break any law.',
      ],
    },
    {
      heading: '6. Content you submit',
      body: [
        'When you photograph an ingredient list, Tappy reads the text and may save it as a "user-submitted, unverified" entry for that product. If you turn on "Share product photos", the photos of food packaging you take may also be kept to improve the database.',
        'You keep any rights you have in what you submit. You give us a worldwide, royalty-free, non-exclusive licence to use, store, copy, modify and show that content (for example, the ingredient text of a product) to operate and improve the Service. Only submit photos you are allowed to take and share.',
      ],
    },
    {
      heading: '7. Our rights',
      body: [
        'The Service, including the app, design, ratings logic and our compiled database, belongs to us or our licensors and is protected by law. We give you a personal, non-transferable, revocable licence to use the app on Apple devices you own or control, under these Terms and Apple’s Usage Rules. Third-party data is used under its own licences (see Credits in the app).',
        'We may change, suspend or stop any part of the Service. We may suspend or close accounts that break these Terms.',
      ],
    },
    {
      heading: '8. Disclaimers',
      body: [
        'To the fullest extent the law allows, the Service is provided "as is" and "as available", without warranties of any kind, express or implied, including warranties of accuracy, fitness for a particular purpose and non-infringement. We don’t promise that product information is complete, accurate or current, or that the Service will be uninterrupted or error-free.',
      ],
    },
    {
      heading: '9. Limitation of liability',
      body: [
        'To the fullest extent the law allows, Tappy will not be liable for any indirect, incidental, special, consequential or punitive damages, or for any illness, allergic reaction or injury arising from food you choose to buy or eat. Our total liability for any claim relating to the Service is limited to the greater of the amount you paid us in the 12 months before the claim and USD 50.',
        'Some places don’t allow these limits, so they may not apply to you. Nothing in these Terms limits liability that can’t be limited by law, such as for death or personal injury caused by negligence, or fraud.',
      ],
    },
    {
      heading: '10. Apple',
      body: [
        'These Terms are between you and Tappy, not Apple. Apple is not responsible for the Service or its content, has no obligation to provide maintenance or support, and is not responsible for any claims relating to the app (including product liability, legal or regulatory compliance, or intellectual property claims). If the app fails to meet any applicable warranty, you may notify Apple and Apple will refund the purchase price, if any; Apple has no other warranty obligation. Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.',
        'You confirm that you are not located in a country subject to a U.S. Government embargo or listed on any U.S. Government list of prohibited or restricted parties.',
      ],
    },
    {
      heading: '11. Changes to these Terms',
      body: [
        'We may update these Terms. If a change is significant, we will tell you in the app before it takes effect. Continuing to use the Service after a change means you accept the new Terms.',
      ],
    },
    {
      heading: '12. Governing law and contact',
      body: [
        'These Terms are governed by the laws of the place where Tappy’s operator is established, without regard to conflict-of-law rules, and you keep any protections that the law where you live gives you.',
        `Questions? Email ${LEGAL_CONTACT}.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  updated: LEGAL_UPDATED,
  intro: `This Privacy Policy explains what information the Tappy app and service ("Tappy", "we", "us"), operated by ${LEGAL_OPERATOR}, collect, why, and the choices you have. We collect as little as we need to make Tappy work, we don’t sell your personal information, and we don’t track you across other companies’ apps or websites.`,
  sections: [
    {
      heading: '1. Information on your device',
      body: [
        'Your answers during setup, your dietary profile (restrictions, allergies, severity, ingredients to avoid), your ingredient preferences and your saved lists are stored on your iPhone. If you don’t create an account, they stay on your device and are not sent to us.',
      ],
    },
    {
      heading: '2. Information we collect',
      body: [
        'Anonymous device ID: a random identifier created when you install the app. It is sent with each scan so we can apply fair-use limits. It is not your Apple advertising identifier and isn’t linked to your name.',
        'Scans: the barcode you scan, and the photos you choose to take of a package front or ingredient list. Photos are resized on your phone, processed in memory to read the text, and then discarded, unless you turn on "Share product photos" (off by default), in which case photos the system recognises as food packaging may be kept to improve the product database. We never keep photos that show people.',
        'Ingredient text you contribute: text read from an ingredient-list photo is saved for that product as "user-submitted, unverified" so it can help you and other users.',
        'Network information: your IP address is used briefly for security and rate limiting (for example, to stop abuse of scan limits). We don’t use it to locate you.',
        'Account information (only if you create an account): your email address, a securely hashed version of your password (we never see or store your actual password), or, with Sign in with Apple, an Apple user identifier and the email Apple shares (which can be a private relay address). When you’re signed in, a copy of your dietary profile is stored with your account so you can restore it on a new device.',
        'Purchases: if you subscribe, Apple processes the payment. We receive your subscription status (for example, whether you are on a trial or subscribed) through our purchase provider. We never receive your card details.',
        'Product reports and feedback you send us, and the contents of any email you send to support.',
      ],
    },
    {
      heading: '3. Health-related information',
      body: [
        'Your dietary profile can reveal health information, such as allergies, intolerances or a medical diet. We use it only to show you whether products fit your profile, and, if you have an account, to sync it to your account. We don’t use it for advertising, we don’t sell it, and we don’t share it with anyone except the service providers that host our servers.',
        'Your profile is not sent with your scans. Products are matched on our servers, and the check against your profile happens on your phone.',
      ],
    },
    {
      heading: '4. How we use information',
      body: [
        'To provide the Service: find products, read photos, show ratings, keep you signed in, sync your profile, and unlock paid features. To keep it safe and fair: prevent abuse, enforce scan limits and fix problems. To improve it: grow and correct the product database. To contact you about your account, such as a password reset code you ask for.',
        'Where laws such as the GDPR apply, we rely on: performing our contract with you (providing the Service), your consent (sharing product photos, and your health-related profile, which you can withdraw at any time), and our legitimate interests (security, abuse prevention and improving the Service).',
      ],
    },
    {
      heading: '5. Who we share it with',
      body: [
        'We don’t sell or rent personal information, and we don’t share it for advertising. We share information only with service providers that process it for us under contract:',
        '• Anthropic: reads text from package and ingredient-list photos you take (photos only, not your profile or account).',
        '• Oracle Cloud and Cloudflare: host and secure our servers and connections.',
        '• RevenueCat and Apple: manage subscriptions and purchase status.',
        '• Resend: sends password reset emails.',
        '• Open Food Facts: if a barcode isn’t in our database, we may look it up there. Only the barcode is sent.',
        'We may also disclose information if required by law, to protect the rights and safety of our users or others, or as part of a merger or sale of the business (in which case this policy will continue to apply).',
      ],
    },
    {
      heading: '6. How long we keep it',
      body: [
        'Scan records and rate-limit data: up to 90 days. Cached product lookups: up to 7 days. Feedback messages: up to 1 year. Account data and your synced profile: until you delete your account. Contributed ingredient text and opted-in product photos: for as long as they help the database, without being linked to your account. Backups are overwritten within about two weeks.',
      ],
    },
    {
      heading: '7. Your choices and rights',
      body: [
        'You can: use Tappy without an account; turn "Share product photos" on or off in Settings; turn off notifications in iOS Settings; reset your profile in the app; and delete your account in Settings → Delete account, which permanently deletes your account and synced profile from our servers.',
        'Depending on where you live (for example, under the GDPR, the UK GDPR, or California’s CCPA/CPRA), you may also have the right to access, correct, download or delete your personal information, to object to or restrict certain processing, and to complain to your data protection authority. To make a request, email us; we will respond within the time the law requires. We don’t discriminate against you for exercising these rights.',
      ],
    },
    {
      heading: '8. Security',
      body: [
        'We use encryption in transit (HTTPS) for all connections, store passwords only as salted hashes, keep sign-in tokens in your iPhone’s secure Keychain, and limit access to our servers. No system is perfectly secure, but we work to protect your information and will notify you as the law requires if a breach affects you.',
      ],
    },
    {
      heading: '9. Children',
      body: [
        'Tappy is not directed to children under 13, and we don’t knowingly collect personal information from them. If you believe a child has given us personal information, email us and we will delete it.',
      ],
    },
    {
      heading: '10. International transfers',
      body: [
        'Our servers and service providers may be located in other countries, including the United States. When we transfer personal information internationally, we use appropriate safeguards such as standard contractual clauses.',
      ],
    },
    {
      heading: '11. Changes and contact',
      body: [
        'We will post any changes here and update the date at the top. If a change is significant, we will tell you in the app.',
        `Questions or requests: email ${LEGAL_CONTACT}.`,
      ],
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS, privacy: PRIVACY } as const;
