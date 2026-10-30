# Turning on accounts (about 10 minutes, free)

The app uses Google Firebase for log-in and for saving each person's data online.
Until you finish these steps the app still works, but data stays on each device.

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com and sign in with a Google account.
2. Click **Create a project** (any name, e.g. `family-recipes`). Google Analytics is optional; you can turn it off.
3. Stay on the free **Spark** plan. No credit card is needed.

## 2. Register the web app and copy its config
1. On the project home page click the **</>** (Web) icon to add an app. Nickname: `Family Recipes`. You do NOT need Firebase Hosting.
2. Firebase shows a block like this. Copy just the `{ ... }` part:
   ```
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "family-recipes-xxxx.firebaseapp.com",
     projectId: "family-recipes-xxxx",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
3. Open `index.html` in a text editor (Notepad/TextEdit), search for `const FIREBASE_CONFIG = null;` and replace `null` with the `{ ... }` you copied:
   ```
   const FIREBASE_CONFIG = { apiKey: "AIza...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." };
   ```
   This config is meant to be public; it is safe in the file. Your data is protected by the rules in step 4.

## 3. Turn on email + password sign-in
Firebase console → **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save**.

## 4. Create the database and paste the security rules
1. Firebase console → **Build → Firestore Database → Create database**. Pick a US location and start in **production mode**.
2. Open the **Rules** tab, delete what's there, paste everything from `firestore.rules`, and click **Publish**.

## 5. Upload and test
1. Upload the edited `index.html` to your GitHub repository (Add file → Upload files → Commit). Wait 1-2 minutes.
2. Open your site, tap **No, try it free**, and create an account.
3. Open the same site on your phone and **log in** with the username and password. Your recipes should be there.
4. If sign-in shows an "unauthorized domain" message, add your site (e.g. `yourname.github.io`) under
   Authentication → Settings → Authorized domains.

## Good to know
- Free limits (Spark plan): 50,000 database reads and 20,000 writes per day, 1 GiB stored. Plenty for testing.
- Each person's AI and photo keys are saved in their own account, readable only by them.
- Someone who knows a username can look up the email address tied to it (that's how username log-in works).
  Before a public launch, move that lookup to a server function or log in by email only.
- Log in on each device. Logging out clears that device; everything stays in the account.
