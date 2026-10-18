# Brothers Vayanasala - Library Manager (Expo + Firebase)

## Updating the app on every phone (set up once)
1. Install the APK from the **new build** on each phone **one time** (older APKs have no update system).
2. After that, to change the app: edit the code, push to GitHub `main`. The workflow in
   `.eas/workflows/publish-update.yml` publishes it, and every phone downloads it by itself the next
   time the app is opened (a yellow "New version ready - tap to restart" bar may appear).
   Backup tab > "Check for updates" checks immediately.
3. Only if you add/remove a native package (anything in package.json) or change app.json permissions:
   change `version` in app.json (for example 1.1.0 -> 1.2.0) and build a new APK. JS-only changes never need that.
4. No GitHub workflow? Run `npx eas-cli update --branch preview --message "what changed"` from the project folder.

Data (books, members, issues) is always shared live through Firebase - no update needed for that.

## Firebase daily limit (free plan: 50,000 reads / day)
The library is saved on each phone. Opening the app shows it instantly and costs only about 10 Firebase reads
(it checks the book count and downloads only NEW books). The first open after installing this version downloads
everything once (about 4,300 reads per phone). If a phone ever shows different books from the others:
Backup > Reload library from server (about 4,300 reads - do not repeat often).
"Delete all books" makes every other phone reload automatically the next time it opens.

## Build the APK
`npx eas-cli build -p android --profile preview` (or expo.dev > Builds > Create a build > Android > preview).

## Excel import (Add tab)
Columns understood: **Book Stock No** (= Book ID), **Book Category No** (e.g. P-12), **Book ID / Barcode**
(long numbers are stored as the barcode, never as the ID), Book Name, Author Name,
**Category Type** (P-M, CL-E ... or Malayalam / English; M=Malayalam, E=English, H=Hindi, T=Tamil, A=Arabic, U=Urdu),
Publisher Name, Cost. A summary is shown before anything is saved. Re-importing the same file is safe: books that are
already there are skipped.

If the Book IDs look wrong after an earlier import: Backup > Danger zone > Delete all books, then import again.
Backup > Repair counters recalculates the ID counters from the books that exist.

## First-time setup
1. Firebase console: Web app config is in `src/db.js`. Firestore Database created. Rules: `firestore.rules`.
   Authentication > enable **Anonymous**.
2. Sign-in User ID: `APP_USER_ID` in `src/db.js` (currently 9048).
3. `npm install && npx expo install --fix && npx expo start` (Expo Go works for everything except the update system).
