# LogicSpark 0.1.0

An offline Android logic puzzle game, based on the approved playable prototype. English and Arabic. Ten levels: patterns, shape equations, ordering, number grids, deductions, a maze and strategy.

## Current preview
- Local progress, score, language, partial ordering and maze position survive restarting.
- Explanations after solving; one hint per level.
- Each level starts at 100 points, minus 20 per wrong submission and 30 for a hint, minimum 10.
- Main menu, resume, replay, and Android back navigation.
- All assets bundled; no network permission, account, live ads, or analytics.
- Application ID: `com.logicspark.game.preview`; Android 8.0+.

## Project layout
- `app/src/main/assets/`: UI (`index.html`, `style.css`, `app.js`), content (`puzzles.js`), reusable logic (`core.js`).
- `app/src/main/java/`: lightweight Android host with an offline WebView.
- `test/`: scoring/save/maze unit tests and browser end-to-end tests.
- `.github/workflows/build-logicspark.yml`: checks, APK build, signature verification and downloadable artifacts.

## Local development
Use Node.js 22, JDK 17, Android SDK 35 and Gradle 8.9.
```
npm test
npm install
npx playwright install chromium
npm run test:ui
npm run serve
gradle lintDebug assembleDebug
```
Open `http://localhost:8000` for browser development. Android Studio can import the Gradle project. The initial CI build generates a Gradle wrapper for subsequent builds.

## Preview signing
The build uses the standard debug key generated on the build runner. No signing keys or production credentials are stored in this repository. Until a stable private signing configuration is set up, APKs from separate builds may require uninstalling the earlier preview, which clears its local progress. Do not use debug signing for Google Play publication.

## GitHub location
This standalone project is initially stored on the `logicspark` branch of the connected repository. Its root contains only the game. **Do not merge this branch into the store's main branch**; move it to a dedicated repository when repository creation becomes available.

## Roadmap
1. Test on actual Android devices and refine layout, controls and difficulty.
2. Expand the puzzle bank and add progression and an actual daily challenge.
3. Improve visual identity, transitions, accessibility and sound preferences.
4. Integrate AdMob with test IDs first; show hints without ads while unavailable.
5. Prepare release signing, privacy disclosures and current Google Play requirements before publication.

The preview is for playtesting, not a production release. No paid service is used by the game.
