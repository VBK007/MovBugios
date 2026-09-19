import Animated from 'react-native-reanimated';
import { useKeyboardPanel } from '@/ui/keyboardPanel';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  Amber,
  AmberInk,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  PosterGradients,
  Radius,
  Space,
  Surface1,
  TowerType,
} from '@/theme';
import { Comment, wasEdited } from '@/domain/model/comment';
import { withAlpha } from '@/ui/color';
import { formatRelative } from '@/ui/format/signInTime';
import { ChevronGlyph } from '@/ui/components/Glyphs';
import { DataLabel, DataMeta, HairlineDivider } from '@/ui/components/Primitives';
import { Skeleton } from '@/ui/components/Rails';
import type { CommentsController } from '@/ui/comments/useComments';

/** Half the screen: a dozen comments, and the film still above them. */
const PANEL_HEIGHT = 0.52;

/**
 * The thread under a title.
 *
 * A full screen rather than a half-height sheet: the composer needs the
 * keyboard, and a sheet that jumps to full height the moment it is focused is
 * worse than one that was full height to begin with.
 *
 * Laid out as a conversation, not a list of records. Comments are written by a
 * *profile*, and on a shared login telling "dad thought it dragged" from "the
 * eight-year-old loved it" is the entire point of the feature — so each one
 * carries a face and a side, and yours sit on the right in amber.
 *
 * Ported from ui/screens/detail/CommentsSheet.kt.
 */
export function CommentsSheet({ controller }: { controller: CommentsController }) {
  return (
    <SafeAreaView style={styles.fullScreen} edges={['top']}>
      <CommentsBody controller={controller} />
    </SafeAreaView>
  );
}

/**
 * The same thread, floating over a film that keeps playing.
 *
 * The full-screen sheet is right on the detail screen, where there is nothing
 * behind it worth seeing. Over the player it is wrong: you are commenting
 * *about* what is on screen, and covering it to talk about it is the one thing
 * the panel must not do. So it takes the lower half, leaving the picture above
 * it, and the area outside is a dismiss target rather than a wall.
 */
export function CommentsOverlay({ controller }: { controller: CommentsController }) {
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardPanel();

  return (
    <View style={StyleSheet.absoluteFill}>
      {/*
       * Dismiss by tapping the film. No scrim colour over the picture: this is a
       * panel beside what you are watching, not a modal in front of it.
       */}
      <Pressable style={StyleSheet.absoluteFill} onPress={controller.close} accessible={false} />

      <Animated.View style={[styles.panel, { height: height * PANEL_HEIGHT }, keyboard]}>
        {/*
         * Translucent, and graded rather than a flat wash. The film carries on
         * behind the panel, which is the point of putting it here at all; a
         * solid surface would just be the full-screen sheet with less room in it.
         *
         * Lightest at the top edge, where it meets the picture and a hard line
         * would read as a cut, and darkest at the bottom, where the composer
         * needs contrast a bright scene cannot be trusted to leave it.
         */}
        <LinearGradient
          colors={[withAlpha(Ink, 0.62), withAlpha(Ink, 0.82), withAlpha(Ink, 0.92)]}
          locations={[0, 0.18, 1]}
          style={StyleSheet.absoluteFill}
        />
        <CommentsBody controller={controller} />
      </Animated.View>
    </View>
  );
}

/** Everything inside either container: header, thread, error line, composer. */
function CommentsBody({ controller }: { controller: CommentsController }) {
  const { state } = controller;
  const comments = state.comments;
  const count = comments.type === 'LOADED' ? comments.data.length : 0;

  return (
    <View style={{ flex: 1 }}>
      <Header count={count} onClose={controller.close} />
      <HairlineDivider />

      <View style={{ flex: 1 }}>
        {comments.type === 'LOADING' && <ThreadSkeleton />}
        {comments.type === 'EMPTY' && <EmptyThread message={comments.message} />}
        {comments.type === 'OFFLINE' && <EmptyThread message={comments.message} />}
        {comments.type === 'ASLEEP' && <EmptyThread message="The server is asleep." />}
        {comments.type === 'LOADED' && (
          <FlatList
            data={comments.data}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.thread}
            renderItem={({ item }) => (
              <CommentBubble
                comment={item}
                onEdit={() => controller.startEditing(item)}
                onDelete={() => controller.remove(item)}
              />
            )}
          />
        )}
      </View>

      {state.error != null && (
        <DataLabel
          text={state.error}
          color={Amber}
          technical={false}
          style={{ paddingHorizontal: Space.Screen, paddingVertical: 6 }}
        />
      )}

      <Composer controller={controller} />
    </View>
  );
}

function Header({ count, onClose }: { count: number; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={styles.close}
      >
        <ChevronGlyph rotation={180} color={OnInk} size={18} />
      </Pressable>
      <Text style={[TowerType.titleScreen, { color: OnInk, marginLeft: 4 }]}>Comments</Text>
      {count > 0 && (
        <DataLabel
          text={String(count)}
          color={OnInkFaint}
          technical={false}
          style={{ marginLeft: 10 }}
        />
      )}
    </View>
  );
}

/**
 * One comment, as a bubble on its own side of the thread.
 *
 * The corner nearest its author is square, which is what makes a rounded
 * rectangle read as *spoken by someone* rather than as a card.
 */
function CommentBubble({
  comment,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const mine = comment.mine;
  const when = formatRelative(comment.postedAt);

  return (
    <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      {!mine && (
        <>
          <InitialAvatar name={comment.author} />
          <View style={{ width: 10 }} />
        </>
      )}

      <View style={{ maxWidth: 280, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <View style={styles.meta}>
          {/* Your own name is not news; the time still is. */}
          {!mine && (
            <Text
              style={[TowerType.titleRow, { color: OnInk }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {comment.author}
            </Text>
          )}
          {when != null && <DataMeta text={when} color={OnInkFaint} technical={false} />}
          {wasEdited(comment) && <DataMeta text="EDITED" technical={false} />}
        </View>

        <View
          style={[
            styles.bubble,
            {
              backgroundColor: mine ? Amber : Surface1,
              borderTopLeftRadius: mine ? 16 : 4,
              borderTopRightRadius: mine ? 4 : 16,
            },
          ]}
        >
          <Text
            style={[
              TowerType.bodyProse,
              // Amber is a light fill, so text on it takes the dark ink the rest
              // of the app uses on amber.
              { color: mine ? AmberInk : OnInk },
            ]}
          >
            {comment.body}
          </Text>
        </View>

        {/*
         * Only the author may rewrite; a parent's power here is removal. So Edit
         * follows `mine` and Remove follows `canDelete`.
         */}
        {(mine || comment.canDelete) && (
          <View style={styles.actions}>
            {mine && (
              <Pressable accessibilityRole="button" accessibilityLabel="Edit" onPress={onEdit}>
                <DataLabel text="EDIT" color={OnInkFaint} technical={false} />
              </Pressable>
            )}
            {comment.canDelete && (
              <Pressable accessibilityRole="button" accessibilityLabel="Remove" onPress={onDelete}>
                <DataLabel text="REMOVE" color={OnInkFaint} technical={false} />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * A circle with an initial, tinted from the name.
 *
 * The server has no avatars for profiles in a thread, and a row of identical
 * grey discs would be worse than none — a stable colour per person is what lets
 * four people be told apart while scrolling.
 */
function InitialAvatar({ name }: { name: string }) {
  const tint = PosterGradients[stableIndex(name, PosterGradients.length)][0];
  return (
    <View style={[styles.avatar, { backgroundColor: withAlpha(tint, 0.22) }]}>
      <Text style={[TowerType.titleRow, { color: tint }]}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** Kotlin's `hashCode().mod(n)` — always non-negative, unlike JS `%`. */
function stableIndex(seed: string, size: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  return ((hash % size) + size) % size;
}

function EmptyThread({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, textAlign: 'center' }]}>
        {message}
      </Text>
      <DataMeta
        text="BE THE FIRST"
        color={OnInkFaint}
        technical={false}
        style={{ marginTop: 8 }}
      />
    </View>
  );
}

function ThreadSkeleton() {
  return (
    <View style={{ padding: Space.Screen, gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          <Skeleton cornerRadius={17} style={{ width: 34, height: 34 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton cornerRadius={3} style={{ width: '40%', height: 10 }} />
            <Skeleton cornerRadius={12} style={{ width: '80%', height: 44 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Composer({ controller }: { controller: CommentsController }) {
  const { state } = controller;
  const editing = state.editing != null;

  return (
    <View style={{ width: '100%' }}>
      <HairlineDivider />
      {editing && (
        <View style={styles.editingRow}>
          <DataLabel text="EDITING" color={Amber} technical={false} />
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={controller.cancelEditing}
          >
            <DataLabel text="CANCEL" color={OnInkMuted} technical={false} />
          </Pressable>
        </View>
      )}
      <View style={styles.composerRow}>
        <View style={styles.field}>
          <TextInput
            value={state.draft}
            onChangeText={controller.onDraftChange}
            placeholder="Say something about this one"
            placeholderTextColor={OnInkFaint}
            multiline
            selectionColor={Amber}
            cursorColor={Amber}
            style={[TowerType.bodyProse, { color: OnInk, padding: 0, maxHeight: 96 }]}
          />
        </View>

        {/*
         * Appears only when there is something to send. A permanently lit button
         * that does nothing is a worse affordance than no button.
         */}
        {state.draft.trim() !== '' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={state.posting}
            onPress={controller.submit}
            style={[
              styles.send,
              { backgroundColor: state.posting ? withAlpha(Amber, 0.4) : Amber },
            ]}
          >
            <SendGlyph />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** A paper-plane arrow, drawn to match the app's other hand-drawn glyphs. */
function SendGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 100 100">
      <Path d="M12 50 L88 14 L62 88 L50 58 Z" fill={AmberInk} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: Ink,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.Sheet,
    borderTopRightRadius: Radius.Sheet,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thread: {
    paddingHorizontal: Space.Screen,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 14,
  },
  bubbleRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'flex-start',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bubble: {
    marginTop: 6,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  actions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    paddingHorizontal: Space.Screen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: Space.Screen,
    paddingTop: 10,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    width: '100%',
    paddingHorizontal: Space.Screen,
    paddingVertical: 12,
  },
  field: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: Surface1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
