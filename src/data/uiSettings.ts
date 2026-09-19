import { MutableStateFlow } from '@/data/store';
import { PreferencesStore } from '@/data/remote/preferencesStore';

/**
 * The handful of settings the whole app is drawn from, held live.
 *
 * Separate from `PreferencesStore`, which is the durable copy: reading the
 * keychain is asynchronous, and the theme has to answer "mono or not" on every
 * render of every label. So the stored value is loaded once at boot and mirrored
 * here, where it is synchronous and observable.
 */

/**
 * When false, every mono spec, path, bitrate and codec string is hidden app-wide
 * and the human-written copy is left intact.
 *
 * Defaults to true so the first frame matches what a fresh install shows; `load`
 * corrects it a moment later if the household has turned it off.
 */
export const showTechnicalBadgesFlow = new MutableStateFlow(true);

export const UiSettings = {
  /** Called once at boot, before the first screen is drawn. */
  async load(): Promise<void> {
    try {
      const preferences = await PreferencesStore.load();
      showTechnicalBadgesFlow.set(preferences.showTechnicalBadges);
    } catch {
      // An unreadable store means the default, which is the same as never
      // having been asked.
    }
  },

  /**
   * Writes the new value through to the durable copy, and to the server where
   * there is one.
   *
   * The flow is set first so the app redraws under the thumb; a switch that
   * waits for a keychain write reads as a switch that did not take.
   */
  async setShowTechnicalBadges(value: boolean): Promise<void> {
    showTechnicalBadgesFlow.set(value);
    try {
      const current = await PreferencesStore.load();
      await PreferencesStore.save({ ...current, showTechnicalBadges: value });
    } catch {
      // Lost on next launch, which is better than refusing the change now.
    }
  },
};
