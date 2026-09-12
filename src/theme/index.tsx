import React, { createContext, useContext } from 'react';

export * from './colors';
export * from './typography';
export * from './space';
export * from './motion';
export { useTowerFonts } from './fonts';

/**
 * When false, every mono spec, path, bitrate and codec string is hidden app-wide
 * and the human-written copy is left intact. Owned by the profile setting
 * "Show technical badges"; read it through `useShowTechnicalBadges`.
 *
 * Compose carried this on a CompositionLocal; a React context is the same idea.
 */
const ShowTechnicalBadgesContext = createContext(true);

/** True when the current profile wants to see what the server measured. */
export function useShowTechnicalBadges(): boolean {
  return useContext(ShowTechnicalBadgesContext);
}

/**
 * Tower is dark-only by design — the system colour scheme is deliberately not
 * consulted, and neither is dynamic colour. The app is a dark room.
 */
export function TowerTheme({
  showTechnicalBadges = true,
  kidsMode = false,
  children,
}: {
  showTechnicalBadges?: boolean;
  kidsMode?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ShowTechnicalBadgesContext.Provider value={showTechnicalBadges && !kidsMode}>
      {children}
    </ShowTechnicalBadgesContext.Provider>
  );
}
