import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Amber, Ink, OnInk, OnInkFaint, OnInkMuted, Space, TowerType, UserBlue } from '@/theme';
import { Profile, profileInitial } from '@/domain/model/people';
import { greeting } from '@/ui/format/greeting';
import { Avatar } from '@/ui/components/Primitives';
import { SearchGlyph } from '@/ui/components/Glyphs';
import { ContinueWatchingCard } from '@/ui/components/ContinueWatchingCard';
import { PosterCard } from '@/ui/components/PosterCard';
import { AlbumTile } from '@/ui/screens/library/MusicShelves';
import { Title } from '@/domain/model/media';
import { HomeVideoTile, PosterSkeleton, Rail, Skeleton } from '@/ui/components/Rails';
import { ServerStateBanner, ServerStatusLine } from '@/ui/components/ServerStateBanner';
import { ServerState } from '@/domain/model/server';
import { useHome } from '@/ui/screens/home/useHome';

/** Ported from ui/screens/home/HomeScreen.kt. */
export function HomeScreen({
  onOpenTitle,
  onOpenProfile,
  onOpenSearch,
  onPlayMusic,
}: {
  onOpenTitle: (titleId: string) => void;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
  /** A sleeve on the music rail was tapped: play it and queue the rest. */
  onPlayMusic: (tracks: Title[], index: number) => void;
}) {
  const { content, serverState, profile, refreshing, refresh, wakeServer } = useHome();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ink }}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={OnInkFaint} />
      }
    >
      <HomeHeader
        profile={profile}
        serverState={serverState}
        onOpenProfile={onOpenProfile}
        onOpenSearch={onOpenSearch}
      />

      {/* Only appears when there is something to explain. */}
      {serverState.type !== 'ONLINE' && (
        <ServerStateBanner
          state={serverState}
          onWake={wakeServer}
          style={{ marginHorizontal: Space.Screen }}
        />
      )}

      {content.type === 'LOADING' && <HomeSkeleton />}

      {content.type === 'EMPTY' && (
        <HomeMessage heading="Nothing on the disk yet" body={content.message} />
      )}

      {/*
       * The banner above already explains and offers the wake button; repeating
       * it here would be nagging.
       */}
      {content.type === 'ASLEEP' && (
        <HomeMessage
          heading="Browsing is paused"
          body={
            'Wake the server to see what is on the disk. Saved copies are in the Saved tab ' +
            'and play without it.'
          }
        />
      )}

      {content.type === 'OFFLINE' && (
        <HomeMessage heading="Cannot reach Tower" body={content.message} />
      )}

      {content.type === 'LOADED' && (
        <>
          {content.data.continueWatching[0] != null && (
            <View style={{ paddingHorizontal: Space.Screen }}>
              <Text style={[TowerType.sectionLabel, { color: OnInkFaint, paddingBottom: 10 }]}>
                CONTINUE WATCHING
              </Text>
              <ContinueWatchingCard
                title={content.data.continueWatching[0]}
                onPlay={() => onOpenTitle(content.data.continueWatching[0].id)}
              />
            </View>
          )}

          {/*
           * Above Recently added: what somebody should watch beats what happens
           * to be newest, and this is the only rail on the screen that knows who
           * is asking.
           */}
          {content.data.forYou.length > 0 && (
            <Rail heading="For you">
              {content.data.forYou.map((pick) => (
                <PosterCard
                  key={pick.title.id}
                  title={pick.title}
                  onPress={() => onOpenTitle(pick.title.id)}
                  // The reason is the rail. Without it this is four posters
                  // under a heading that claims to know you and shows no working.
                  meta={pick.reason}
                  metaMaxLines={2}
                />
              ))}
            </Rail>
          )}

          {/*
           * Square, unlike everything above it. On a screen of posters that
           * shape alone says "this is music" before a word is read, and it is
           * the shape the art actually is.
           */}
          {content.data.music.length > 0 && (
            <Rail heading={content.data.musicHeading}>
              {content.data.music.map((track, index) => (
                <AlbumTile
                  key={track.id}
                  track={track}
                  // Plays, like the shelves in the library do. A tile that
                  // opened a detail screen here and played there would be the
                  // same picture meaning two different things.
                  onPress={() => onPlayMusic(content.data.music, index)}
                />
              ))}
            </Rail>
          )}

          {content.data.recentlyAdded.length > 0 && (
            <Rail heading="Recently added" action={`All ${content.data.recentlyAdded.length}`}>
              {content.data.recentlyAdded.map((title) => (
                <PosterCard key={title.id} title={title} onPress={() => onOpenTitle(title.id)} />
              ))}
            </Rail>
          )}

          {/*
           * Hidden entirely when nothing carries a rating — an unmatched library
           * would otherwise show its whole contents under a heading that
           * promises they are the best of it.
           */}
          {content.data.topRated.length > 0 && (
            <Rail heading="Top rated">
              {content.data.topRated.map((title) => (
                <PosterCard
                  key={title.id}
                  title={title}
                  onPress={() => onOpenTitle(title.id)}
                  // The rating is the reason this rail exists, so it replaces
                  // the usual size/resolution.
                  meta={title.rating != null ? `★ ${title.rating}` : null}
                />
              ))}
            </Rail>
          )}

          {content.data.fromCameraRoll.length > 0 && (
            <Rail heading="From your camera roll">
              {content.data.fromCameraRoll.map((title) => (
                <HomeVideoTile
                  key={title.id}
                  title={title}
                  onPress={() => onOpenTitle(title.id)}
                />
              ))}
            </Rail>
          )}

          {/*
           * A visitor's rails, in the order the hook listed them.
           *
           * Only ever populated when signed out, so a signed-in Home is
           * unchanged — see `HomeContent.guestRails` for why these exist at all.
           * Each carries its own heading because "Most watched films" and
           * "Photos" are not the same kind of claim.
           */}
          {content.data.guestRails.map((rail) => (
            <Rail key={rail.heading} heading={rail.heading}>
              {rail.titles.map((title, index) =>
                title.kind === 'MUSIC' ? (
                  <AlbumTile
                    key={title.id}
                    track={title}
                    onPress={() => onPlayMusic(rail.titles, index)}
                  />
                ) : (
                  <PosterCard
                    key={title.id}
                    title={title}
                    onPress={() => onOpenTitle(title.id)}
                  />
                ),
              )}
            </Rail>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function HomeHeader({
  profile,
  serverState,
  onOpenProfile,
  onOpenSearch,
}: {
  profile: Profile | null;
  serverState: ServerState;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text
          style={[TowerType.titleScreen, { color: OnInk }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {greeting(profile?.name)}
        </Text>
        <ServerStatusLine state={serverState} style={{ marginTop: 6 }} />
      </View>
      {/*
       * Search moved off the bottom bar to here, beside the avatar: it is
       * something you go and do and come back from, rather than a place to be.
       */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search the disk"
        onPress={onOpenSearch}
        style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.6 : 1 }]}
      >
        <SearchGlyph color={OnInk} size={19} />
      </Pressable>

      {/* Admin lives behind this avatar, not in the bottom nav. */}
      <Avatar
        initial={profile ? profileInitial(profile) : '?'}
        tint={UserBlue}
        onTint={OnInk}
        onPress={onOpenProfile}
      />
    </View>
  );
}

function HomeMessage({ heading, body }: { heading: string; body: string }) {
  return (
    <View style={{ paddingHorizontal: Space.Screen, paddingVertical: 12 }}>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>{heading}</Text>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{body}</Text>
    </View>
  );
}

/** Matches the loaded layout: one wide card, then two rails. */
function HomeSkeleton() {
  return (
    <View style={{ gap: 22 }}>
      <View style={{ paddingHorizontal: Space.Screen }}>
        <Skeleton cornerRadius={4} style={{ width: 140, height: 14 }} />
        <Skeleton
          cornerRadius={14}
          style={{ marginTop: 12, width: '100%', aspectRatio: 16 / 9.6 }}
        />
      </View>
      <View>
        <Skeleton cornerRadius={4} style={{ marginLeft: Space.Screen, width: 120, height: 14 }} />
        <View style={styles.skeletonRow}>
          {[0, 1, 2, 3, 4].map((i) => (
            <PosterSkeleton key={i} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingTop: 18,
    paddingBottom: 28,
    gap: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: Space.Screen,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingLeft: Space.Screen,
    paddingRight: 6,
    marginTop: 12,
  },
});
