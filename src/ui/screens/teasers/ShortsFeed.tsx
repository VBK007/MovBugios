import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { TeaserFeedScreen } from '@/ui/screens/teasers/TeaserFeedScreen';
import { useComments } from '@/ui/comments/useComments';
import { CommentsOverlay } from '@/ui/comments/CommentsSheet';

/**
 * The shorts feed with its comment thread attached.
 *
 * Split from the feed itself because which thread is open depends on which clip
 * is showing, and a thread is a hook — it cannot be conditionally created per
 * page. So the feed reports which film was tapped, and this holds exactly one
 * thread, for that film.
 *
 * The overlay rather than the full-screen sheet: the clip keeps playing behind
 * it, which is the point of that design — you are commenting *about* what is on
 * screen, and covering it to talk about it is the one thing it must not do.
 *
 * Ported from the `Shorts` composable in ui/nav/TowerNav.kt.
 */
export function ShortsFeed({
  onlyFor,
  bottomInset = 0,
  onBack,
  onOpenTitle,
}: {
  onlyFor: string | null;
  /** See `TeaserFeedScreen`: zero under the tab bar, the inset without it. */
  bottomInset?: number;
  onBack: () => void;
  onOpenTitle: (titleId: string) => void;
}) {
  /** Which film's thread is open, or null. */
  const [commentsFor, setCommentsFor] = useState<string | null>(null);

  return (
    <View style={{ flex: 1 }}>
      <TeaserFeedScreen
        onlyFor={onlyFor}
        bottomInset={bottomInset}
        onBack={onBack}
        // Into the film's detail screen rather than straight into playback: a
        // short is an argument for watching the film, not a decision to start it
        // now.
        onOpenTitle={onOpenTitle}
        onOpenComments={setCommentsFor}
      />
      {commentsFor != null && (
        <Thread filmId={commentsFor} onClose={() => setCommentsFor(null)} />
      )}
    </View>
  );
}

/**
 * One film's thread, mounted only while it is open.
 *
 * Keyed on the film by the caller, so switching clips tears this down and builds
 * a fresh one rather than showing the previous film's comments under the new
 * clip's heading.
 */
function Thread({ filmId, onClose }: { filmId: string; onClose: () => void }) {
  const controller = useComments(filmId);
  const { open } = controller;

  // Opened on mount: the tap that set the film is the tap that asked for it.
  useEffect(() => {
    open();
  }, [open]);

  const close = useCallback(() => {
    controller.close();
    onClose();
  }, [controller, onClose]);

  if (!controller.state.open) return null;
  return <CommentsOverlay controller={{ ...controller, close }} />;
}
