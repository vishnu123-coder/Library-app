# Library Manager (Expo + Firebase)
1. Firebase console: create project > add Web app > paste config in `src/db.js`.
   Build > Firestore Database (create) > Rules: paste `firestore.rules`. Build > Authentication > enable **Anonymous**.
2. `npm install && npx expo install --fix && npx expo start` (scan the QR with Expo Go; camera works on a real phone).
3. Login user ID: 9048 (change `APP_USER_ID` in `src/db.js`).
4. GitHub: `git init && git add . && git commit -m "Library app" && git branch -M main && git remote add origin <your-repo-url> && git push -u origin main`
Build installable app: `npx eas-cli build -p android --profile preview`.
