---
name: Expo publishing on Replit
description: How mobile (Expo) apps actually get published from a Replit project — relevant for any task involving app store submission, EAS, universal links / app links, or Apple/Android signing identifiers.
---

Replit does not use the standard EAS CLI workflow for Expo apps. Two hard constraints:

- **Never run or suggest EAS CLI commands** (`eas build`, `eas submit`, `eas update`, `eas init`, etc.). iOS publishing is handled entirely through Replit's own **Expo Launch** flow, triggered from the Publishing tool ("Start publishing to the App Store"). Creating an `eas.json` or telling the user to run EAS themselves contradicts the platform's intended flow.
- **Android/Google Play publishing is not currently supported on Replit at all.** Any task requiring a real Android signing certificate, Play Console listing, or Android store submission is a genuine external blocker — there's no in-Replit path to it. Android app config (package name, intentFilters) can still be written correctly for when/if the user builds it elsewhere, but it can't be verified through Replit.

**Why this matters:** identifiers like the Apple Team ID (needed for `apple-app-site-association` universal-link files, `appID` fields, etc.) are NOT available until the user actually signs in with their Apple Developer account during the Expo Launch wizard. You cannot fabricate or predict this value — leave it as a clearly-marked placeholder and document that it gets filled in after that flow, rather than blocking or guessing.

**How to apply:** any task touching mobile app-store publishing, universal links/App Links, or native build credentials should route the user through Expo Launch (iOS) and flag Android as unsupported, never suggest EAS CLI usage, and treat "verify on a real device build" as a step only the user can complete post-launch.
