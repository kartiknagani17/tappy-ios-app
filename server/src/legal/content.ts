/**
 * Terms of Use and Privacy Policy. Single source: the app shows these in an in-app popup
 * (src/components/LegalSheet.tsx) and the server publishes them at /terms and /privacy for the
 * App Store Connect "Privacy Policy URL" field.
 *
 * Plain data only (no Node or React Native imports), so both the app and the server can import it.
 * Disputes: laws of India, courts and arbitration seat at Bhopal, Madhya Pradesh.
 */

/** Must match the seller name App Store Connect shows for the app. */
export const LEGAL_OPERATOR = 'Jignesh Mandana';
export const LEGAL_CONTACT = 'kartiknagani17@gmail.com';
export const LEGAL_PLACE = 'Bhopal, Madhya Pradesh, India';
export const LEGAL_UPDATED = 'November 18, 2026';

export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { id: 'terms' | 'privacy'; title: string; updated: string; intro: string; sections: LegalSection[] };

export const TERMS: LegalDoc = {
  id: 'terms',
  title: 'Terms of Use',
  updated: LEGAL_UPDATED,
  intro: `These Terms of Use ("Terms") are a binding agreement between you and ${LEGAL_OPERATOR}, of ${LEGAL_PLACE} ("Tappy", "we", "us"), and apply to the Tappy iOS app, our website and related services (the "Service"). By downloading, installing or using the Service you agree to these Terms, including the health disclaimer in section 2, the limits on our liability in sections 10 and 11, and the dispute terms in section 14 (Indian law; arbitration and courts at Bhopal). If you don’t agree, don’t use the Service.`,
  sections: [
    {
      heading: '1. What Tappy does',
      body: [
        'Tappy helps you check whether a packaged food product appears to fit the dietary profile you set up, by automatically comparing the ingredient and allergen information we have for that product with your selections, and showing a rating (for example, "can eat", "limit" or "avoid").',
        'Ratings are produced by software. No person reviews a product for you, and no doctor, dietitian or allergist is involved.',
      ],
    },
    {
      heading: '2. Health and safety: always read the label yourself',
      body: [
        'Tappy is an informational convenience tool only. It is NOT medical, nutritional or allergy advice, it does not diagnose or treat any condition, and using it does not create a doctor–patient or any other professional relationship. It is not a substitute for reading the package, or for the advice of your doctor, dietitian or allergist.',
        'Before you buy, eat, drink or give anyone any product, you must read the ingredient list, allergen statement and any "may contain" or "made in a facility with" warning on the actual package in your hand, and decide for yourself whether it is suitable. You are solely responsible for that decision.',
        'Product information comes from public databases (such as USDA FoodData Central and Open Food Facts), from text read automatically (including by an artificial-intelligence service) from photos, and from other users. It can be incomplete, out of date, misread or simply wrong. Manufacturers change recipes and labels without notice, the same product can differ between countries, batches and pack sizes, and a barcode can be matched to the wrong product.',
        'Tappy cannot detect cross-contamination, trace amounts, ingredients that are not listed, or how a product was made, stored or prepared. A result such as "can eat" or "no conflicts found" only means that we found no conflict in the information we have. It never means that a product is safe for you, free from any allergen, or suitable for your diet, religious or ethical requirements, or medical condition.',
        'If you have a food allergy, intolerance, coeliac disease or any other medical condition, or you are pregnant, follow your doctor’s advice and never rely on Tappy alone. If you or someone else has a severe reaction, call your local emergency number immediately (112 in India).',
      ],
    },
    {
      heading: '3. Eligibility',
      body: [
        'You must be at least 13 years old to use the Service. If you are under 18 (or the age of majority where you live), you may use the Service only with the involvement and consent of a parent or guardian, who agrees to these Terms on your behalf and is responsible for your use.',
        'Parents and guardians who use Tappy to choose food for a child remain fully responsible for checking every product label themselves.',
      ],
    },
    {
      heading: '4. Your account',
      body: [
        'You can use Tappy without an account. If you create one (with email and password, Sign in with Apple or Sign in with Google), keep your password secret and tell us if you think someone else has used your account. You are responsible for activity on your account.',
        'You can delete your account at any time in the app under Settings → Delete account. This permanently deletes your account and the dietary profile stored with it.',
      ],
    },
    {
      heading: '5. Subscriptions, free trials and billing',
      body: [
        'Some features require a paid subscription ("Tappy Unlimited"). Prices are shown in the app before you buy, in your local currency.',
        'Tappy Unlimited removes the daily limit on barcode scans. Photo scans, which use a paid text-recognition service, have a fair-use limit of 100 per day for subscribers.',
        'Payment is charged to your Apple ID account when you confirm the purchase. Subscriptions renew automatically at the end of each period unless auto-renew is turned off at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the end of the current period.',
        'If a free trial is offered, you will be charged when the trial ends unless you cancel at least 24 hours before it ends. Any unused part of a free trial is forfeited when you buy a subscription.',
        'You can manage or cancel your subscription in your iPhone’s Settings → [your name] → Subscriptions. Deleting the app or your Tappy account does not cancel a subscription.',
        'Purchases are processed by Apple and are subject to Apple’s terms. Refund requests are handled by Apple at reportaproblem.apple.com; we cannot issue refunds for App Store purchases ourselves.',
      ],
    },
    {
      heading: '6. Acceptable use',
      body: [
        'Don’t misuse the Service. In particular, don’t: try to get around scan limits or security measures; reverse engineer the app or our servers except where the law allows; scrape, copy or resell the product database; send automated or abusive requests; upload photos of people or anything other than food packaging and labels; submit information you know is false or misleading; or use the Service to break any law.',
      ],
    },
    {
      heading: '7. Content you submit',
      body: [
        'When you photograph an ingredient list, Tappy reads the text and may save it as a "user-submitted, unverified" entry for that product. If you turn on "Share product photos", the photos of food packaging you take may also be kept to improve the database.',
        'You keep any rights you have in what you submit. You give us a worldwide, perpetual, royalty-free, non-exclusive licence to use, store, copy, modify and show that content (for example, the ingredient text of a product) to operate and improve the Service. Only submit content you are allowed to share, and that is accurate to the best of your knowledge. We may remove any content at any time.',
      ],
    },
    {
      heading: '8. Our rights',
      body: [
        'The Service, including the app, design, ratings logic and our compiled database, belongs to us or our licensors and is protected by law. We give you a personal, non-exclusive, non-transferable, revocable licence to use the app on Apple devices you own or control, under these Terms and Apple’s Usage Rules. Third-party data is used under its own licences (see Credits in the app).',
        'We may change, suspend or stop any part of the Service, or any product information in it, at any time and without notice. We may suspend or close accounts that break these Terms.',
      ],
    },
    {
      heading: '9. Disclaimer of warranties',
      body: [
        'To the fullest extent the law allows, the Service and all product information, ratings and other content are provided "as is" and "as available", without warranties or conditions of any kind, express or implied, including any warranty of accuracy, completeness, reliability, merchantability, fitness for a particular purpose, safety, or non-infringement.',
        'We don’t promise that product information is complete, accurate or current, that a rating is correct, that the Service will be available, uninterrupted, secure or error-free, or that any problem will be fixed. We are not the manufacturer or seller of any product shown in the Service and make no promise about any product.',
      ],
    },
    {
      heading: '10. Assumption of risk',
      body: [
        'You understand that food allergies and medical conditions can cause serious illness or death, that the information in Tappy may be wrong, and that you use the Service entirely at your own risk. Any decision to buy, eat, drink or give someone a product is yours alone.',
      ],
    },
    {
      heading: '11. Limitation of liability',
      body: [
        `To the fullest extent the law allows, neither ${LEGAL_OPERATOR} nor anyone working with us will be liable for: (a) any illness, allergic reaction, injury, death, or other harm arising from any product you or anyone else buys, eats, drinks or uses, or from relying on any information, rating or result in the Service; (b) any inaccurate, incomplete or outdated product information, including information from third parties, other users or automated text reading; or (c) any indirect, incidental, special, consequential, exemplary or punitive damages, or any loss of profits, revenue, data or goodwill, however caused and even if we were told they were possible.`,
        'To the fullest extent the law allows, our total liability for all claims relating to the Service or these Terms is limited to the amount you paid for the Service in the 12 months before the event giving rise to the claim, or INR 1,000 if you paid nothing.',
        'Some places don’t allow some of these exclusions or limits, so they apply to you only as far as the law where you live allows. Nothing in these Terms excludes or limits liability that cannot be excluded or limited by law.',
      ],
    },
    {
      heading: '12. Indemnity',
      body: [
        `To the extent the law allows, you agree to indemnify and hold harmless ${LEGAL_OPERATOR} and anyone working with us from any claims, losses, liabilities, damages, costs and expenses (including reasonable legal fees) arising from your misuse of the Service, your breach of these Terms, content you submit, or food you give to anyone else based on the Service.`,
      ],
    },
    {
      heading: '13. Apple',
      body: [
        'These Terms are between you and Tappy, not Apple. Apple is not responsible for the Service or its content, has no obligation to provide maintenance or support, and is not responsible for any claims relating to the app (including product liability, legal or regulatory compliance, or intellectual property claims). If the app fails to meet any applicable warranty, you may notify Apple and Apple will refund the purchase price, if any; Apple has no other warranty obligation. Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.',
        'You confirm that you are not located in a country subject to a U.S. Government embargo or listed on any U.S. Government list of prohibited or restricted parties.',
      ],
    },
    {
      heading: '14. Governing law, disputes and jurisdiction',
      body: [
        'These Terms, and any dispute or claim arising out of or relating to them or the Service (including non-contractual disputes), are governed by the laws of India, without regard to conflict-of-law rules.',
        `Before starting any proceedings, you agree to first email us at ${LEGAL_CONTACT} describing the dispute, and to try in good faith to resolve it with us for at least 30 days.`,
        `If it isn’t resolved, the dispute shall be finally settled by arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator appointed in accordance with that Act. The seat and venue of arbitration shall be Bhopal, Madhya Pradesh, India, and the proceedings shall be in English. Subject to this, the courts at Bhopal, Madhya Pradesh, India, shall have exclusive jurisdiction over all matters arising out of or relating to these Terms or the Service, including any application for interim relief, and you consent to the jurisdiction of those courts.`,
        'To the extent the law allows, claims may be brought only on an individual basis and not as a plaintiff or class member in any class, collective or representative proceeding, and any claim must be brought within one year after it arose.',
        'If you are a consumer, this section does not take away any protection given to you by mandatory consumer laws of the country where you live that cannot be changed by agreement.',
      ],
    },
    {
      heading: '15. General',
      body: [
        'These Terms, together with the Privacy Policy, are the whole agreement between you and us about the Service. If any part of these Terms is found unenforceable, it will be changed only as much as needed to make it enforceable, and the rest stays in effect. If we don’t enforce a right, we don’t give it up. You may not transfer your rights under these Terms; we may transfer ours, for example as part of a sale of the business.',
        'We are not responsible for delays or failures caused by events outside our reasonable control, such as outages of internet, hosting or third-party services.',
        'These Terms are written in English. If they are translated, the English version prevails.',
      ],
    },
    {
      heading: '16. Changes to these Terms',
      body: [
        'We may update these Terms. We will post the new version here and update the date at the top; if a change is significant, we will also tell you in the app before it takes effect. Continuing to use the Service after a change takes effect means you accept the new Terms.',
      ],
    },
    {
      heading: '17. Contact and grievances',
      body: [
        `Questions, complaints or legal notices: email ${LEGAL_CONTACT}. Grievance Officer: ${LEGAL_OPERATOR}, ${LEGAL_PLACE}, ${LEGAL_CONTACT}. We acknowledge complaints within 24 hours and aim to resolve them within 15 days.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  updated: LEGAL_UPDATED,
  intro: `This Privacy Policy explains what information the Tappy app and service ("Tappy", "we", "us"), operated by ${LEGAL_OPERATOR} of ${LEGAL_PLACE}, collect, why, and the choices you have. We collect as little as we need to make Tappy work, we don’t sell your personal information, and we don’t track you across other companies’ apps or websites.`,
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
        'Account information (only if you create an account): your email address, a securely hashed version of your password (we never see or store your actual password), or, with Sign in with Apple, an Apple user identifier, the email Apple shares (which can be a private relay address) and a token from Apple that we keep only so we can revoke it when you delete your account, or, with Sign in with Google, a Google user identifier and the verified email address of your Google Account. When you’re signed in, a copy of your dietary profile is stored with your account so you can restore it on a new device.',
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
        'To provide the Service: find products, read photos, show ratings, keep you signed in, sync your profile, and unlock paid features. To keep it safe and fair: prevent abuse, enforce scan limits and fix problems. To improve it: grow and correct the product database. To contact you about your account, such as a password reset code you ask for, or to reply to feedback you send.',
        'We rely on your consent (which you give when you use the app, choose to take photos, create an account, or turn on "Share product photos", and which you can withdraw at any time), on performing our agreement with you (providing the Service), and on legitimate uses permitted by law (security, abuse prevention, legal compliance and improving the Service). Where the GDPR applies, these correspond to consent, contract and legitimate interests.',
      ],
    },
    {
      heading: '5. Artificial intelligence',
      body: [
        'When you photograph an ingredient list, the app first asks your permission, and then sends that photo to OpenAI, which reads the text for us. Only the photo is sent, never your profile or account details. Photos are sent with storage turned off, and OpenAI does not use them to train its models. AI text reading can make mistakes, which is one reason you must always check the label yourself.',
      ],
    },
    {
      heading: '6. Who we share it with',
      body: [
        'We don’t sell or rent personal information, and we don’t share it for advertising. We share information only with service providers that process it for us under contract:',
        '• OpenAI: reads text from package and ingredient-list photos you take (photos only, not your profile or account).',
        '• Oracle Cloud and Cloudflare: host and secure our servers and connections.',
        '• RevenueCat and Apple: manage subscriptions and purchase status.',
        '• Apple and Google: verify your identity if you choose Sign in with Apple or Sign in with Google.',
        '• Resend: sends password reset emails and forwards feedback you send to our support inbox.',
        '• Expo: delivers app updates to your phone (your phone’s IP address and app version are seen when it checks for an update).',
        '• Open Food Facts: if a barcode isn’t in our database, we may look it up there. Only the barcode is sent.',
        'We may also disclose information if required by law or by a lawful order of a court or government authority, to protect the rights and safety of our users or others, or as part of a merger or sale of the business (in which case this policy will continue to apply).',
      ],
    },
    {
      heading: '7. How long we keep it',
      body: [
        'Scan records and rate-limit data: up to 90 days. Cached product lookups: up to 7 days. Feedback messages: up to 1 year. Account data and your synced profile: until you delete your account. Contributed ingredient text and opted-in product photos: for as long as they help the database, without being linked to your account. Backups are overwritten within about two weeks.',
      ],
    },
    {
      heading: '8. Your choices and rights',
      body: [
        'You can: use Tappy without an account; decline the AI photo permission; turn "Share product photos" on or off in Settings; turn off notifications in iOS Settings; reset your profile in the app; and delete your account in Settings → Delete account, which permanently deletes your account and synced profile from our servers.',
        'Depending on where you live (for example, under India’s Digital Personal Data Protection Act, 2023, the GDPR, the UK GDPR, or California’s CCPA/CPRA), you may also have the right to access, correct, update, download or erase your personal information, to withdraw consent, to nominate someone to exercise your rights if you die or become incapacitated, to object to or restrict certain processing, and to complain to your data protection authority (in India, the Data Protection Board of India). To make a request, email us; we will respond within the time the law requires. We don’t discriminate against you for exercising these rights.',
      ],
    },
    {
      heading: '9. Security',
      body: [
        'We use encryption in transit (HTTPS) for all connections, store passwords only as salted hashes, keep sign-in tokens in your iPhone’s secure Keychain, and limit access to our servers. No system is perfectly secure, but we work to protect your information and will notify you and the authorities as the law requires if a breach affects you.',
      ],
    },
    {
      heading: '10. Children',
      body: [
        'Tappy is not directed to children under 13, and we don’t knowingly collect personal information from them. Users under 18 should use Tappy only with a parent or guardian’s consent. If you believe a child has given us personal information without that consent, email us and we will delete it.',
      ],
    },
    {
      heading: '11. International transfers',
      body: [
        'We are based in India. Our servers and service providers may be located in other countries, including the United States. When we transfer personal information internationally, we do so as permitted by applicable law and use appropriate safeguards, such as standard contractual clauses where required.',
      ],
    },
    {
      heading: '12. Changes, contact and grievances',
      body: [
        'We will post any changes here and update the date at the top. If a change is significant, we will tell you in the app.',
        `Questions, requests or complaints: email ${LEGAL_CONTACT}. Grievance Officer: ${LEGAL_OPERATOR}, ${LEGAL_PLACE}, ${LEGAL_CONTACT}. We acknowledge complaints within 24 hours and aim to resolve them within 15 days.`,
        'This policy is governed by the laws of India, and disputes about it are handled as set out in section 14 of the Terms of Use (Bhopal, Madhya Pradesh, India).',
      ],
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS, privacy: PRIVACY } as const;
