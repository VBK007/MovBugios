const fs = require('fs');
const path = require('path');

/**
 * Dynamic config, so the Firebase values come from `GoogleService-Info.plist`
 * rather than being typed into a file that goes into git.
 *
 * This mirrors what `:composeApp:generateIosFirebaseConfig` does in the Kotlin
 * build: read the untracked config, generate constants from it, and leave the
 * app working with the feature switched off when it is absent. The plist is
 * gitignored for the same reason `local.properties` is — an API key and an OAuth
 * client id belong to somebody's project, and this repository is a public place.
 */

const PLIST = path.join(__dirname, 'GoogleService-Info.plist');

/**
 * A deliberately small plist reader.
 *
 * `GoogleService-Info.plist` is a flat `<key>`/`<string>` dictionary — no nested
 * dicts, no arrays, no data blobs — so a regex reads it exactly as correctly as
 * a parser would, and the alternative is a dependency in the build path for
 * eight string lookups.
 */
function readPlist(file) {
  if (!fs.existsSync(file)) return null;
  const xml = fs.readFileSync(file, 'utf8');
  const entries = {};
  const re = /<key>([^<]+)<\/key>\s*<(string|integer|true|false)(?:\s*\/>|>([\s\S]*?)<\/\2>)/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const [, key, type, value] = match;
    entries[key] = type === 'true' ? true : type === 'false' ? false : (value ?? '').trim();
  }
  return entries;
}

const plist = readPlist(PLIST);

/**
 * The Firebase JS SDK wants a web-shaped config; the plist is iOS-shaped. These
 * are the same values under different names — `authDomain` is the only one the
 * plist does not carry, and it is always `<projectId>.firebaseapp.com`.
 */
const firebase = plist
  ? {
      apiKey: plist.API_KEY,
      authDomain: `${plist.PROJECT_ID}.firebaseapp.com`,
      projectId: plist.PROJECT_ID,
      storageBucket: plist.STORAGE_BUCKET,
      messagingSenderId: plist.GCM_SENDER_ID,
      appId: plist.GOOGLE_APP_ID,
      /**
       * The *iOS* OAuth client (ends in `.apps.googleusercontent.com`, no
       * secret). A public client is what makes the PKCE exchange safe without
       * embedding a secret in the app. Not the web client id — that one belongs
       * to Android's Credential Manager.
       */
      oauthClientId: plist.CLIENT_ID,
      /** The custom URL scheme Google redirects back to after consent. */
      reversedClientId: plist.REVERSED_CLIENT_ID,
    }
  : null;

module.exports = ({ config }) => {
  const ios = { ...config.ios };

  if (plist) {
    // Picked up by a native build; harmless in Expo Go, which ignores it.
    ios.googleServicesFile = './GoogleService-Info.plist';
    // Google's consent screen redirects to the reversed client id, so the app
    // has to own that scheme or the browser never hands control back.
    ios.infoPlist = {
      ...ios.infoPlist,
      CFBundleURLTypes: [
        ...(ios.infoPlist?.CFBundleURLTypes ?? []),
        { CFBundleURLSchemes: [plist.REVERSED_CLIENT_ID] },
      ],
    };
  }

  return {
    ...config,
    ios,
    extra: {
      ...config.extra,
      // Null when the plist is absent, which is what switches the Google button
      // off rather than showing it broken.
      firebase,
    },
  };
};
