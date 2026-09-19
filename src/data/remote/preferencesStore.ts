import { CredentialStore } from '@/data/remote/credentialStore';
import { DefaultPreferences, Preferences, QualityCap } from '@/domain/model/preferences';

/**
 * The first-run answers, kept on the device.
 *
 * Deliberately local. These describe the person holding the phone, not the
 * account — two people sharing one login should not inherit each other's
 * language, and a tablet in the kitchen can sensibly cap quality where the phone
 * does not. The server has a settings endpoint, and this is not it.
 *
 * Stored through `CredentialStore` because it is the only persistence the app
 * has; nothing here is secret.
 *
 * Ported from data/remote/PreferencesStore.kt.
 */

const KEY_LANGUAGE = 'tower.pref.language';
const KEY_GENRES = 'tower.pref.genres';
const KEY_QUALITY = 'tower.pref.mobileQuality';
const KEY_COMPLETED = 'tower.pref.completed';
const KEY_BADGES = 'tower.pref.showTechnicalBadges';

/** A genre cannot contain a newline; a comma or a slash it might. */
const SEPARATOR = '\n';

const CAPS: QualityCap[] = ['LOW', 'MEDIUM', 'HIGH'];

export const PreferencesStore = {
  async load(): Promise<Preferences> {
    const language = await CredentialStore.read(KEY_LANGUAGE);
    const genres = await CredentialStore.read(KEY_GENRES);
    const quality = await CredentialStore.read(KEY_QUALITY);
    const completed = await CredentialStore.read(KEY_COMPLETED);
    const badges = await CredentialStore.read(KEY_BADGES);

    return {
      language: language && language.trim() !== '' ? language : null,
      genres: (genres ?? '')
        .split(SEPARATOR)
        .map((g) => g.trim())
        .filter((g) => g !== ''),
      mobileQuality: CAPS.find((c) => c === quality) ?? DefaultPreferences.mobileQuality,
      // Absent means on: the badges are the default, and a store that has never
      // been written should look like a fresh install rather than a stripped one.
      showTechnicalBadges: badges !== 'false',
      completed: completed === 'true',
    };
  },

  async save(preferences: Preferences): Promise<void> {
    await CredentialStore.write(KEY_LANGUAGE, preferences.language);
    const genres = preferences.genres.join(SEPARATOR);
    await CredentialStore.write(KEY_GENRES, genres !== '' ? genres : null);
    await CredentialStore.write(KEY_QUALITY, preferences.mobileQuality);
    await CredentialStore.write(KEY_BADGES, preferences.showTechnicalBadges ? null : 'false');
    // Written last, so a crash midway leaves the questions unanswered rather
    // than answered with half a result.
    await CredentialStore.write(KEY_COMPLETED, preferences.completed ? 'true' : null);
  },
};
