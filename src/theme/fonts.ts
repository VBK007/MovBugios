import { useFonts } from 'expo-font';

/**
 * Loads the nine faces the two-typeface rule needs.
 *
 * The keys here are the `fontFamily` values the whole app uses, so they must
 * stay in step with `Fonts` in ./typography. They are set explicitly rather than
 * left to the config plugin: the plugin embeds by the font's internal PostScript
 * name, which is not something the design tokens should have to guess at.
 */
export function useTowerFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts({
    'Archivo-Regular': require('../../assets/fonts/archivo_regular.ttf'),
    'Archivo-Medium': require('../../assets/fonts/archivo_medium.ttf'),
    'Archivo-SemiBold': require('../../assets/fonts/archivo_semibold.ttf'),
    'Archivo-Bold': require('../../assets/fonts/archivo_bold.ttf'),
    'ArchivoNarrow-SemiBold': require('../../assets/fonts/archivo_narrow_semibold.ttf'),
    'ArchivoNarrow-Bold': require('../../assets/fonts/archivo_narrow_bold.ttf'),
    'IBMPlexMono-Regular': require('../../assets/fonts/ibm_plex_mono_regular.ttf'),
    'IBMPlexMono-Medium': require('../../assets/fonts/ibm_plex_mono_medium.ttf'),
    'IBMPlexMono-SemiBold': require('../../assets/fonts/ibm_plex_mono_semibold.ttf'),
  });
  return [loaded, error];
}
