import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Amber, Ink, OnInk, OnInkFaint, OnInkMuted, Space, TowerType, UserBlue } from '@/theme';
import { Profile, profileInitial } from '@/domain/model/people';
import { greeting } from '@/ui/format/greeting';
import { Avatar } from '@/ui/components/Primitives';
import { ContinueWatchingCard } from '@/ui/components/ContinueWatchingCard';
import { PosterCard } from '@/ui/components/PosterCard';
import { HomeVideoTile, PosterSkeleton, Rail, Skeleton } from '@/ui/components/Rails';
import { ServerStateBanner, ServerStatusLine } from '@/ui/components/ServerStateBanner';
import { ServerState } from '@/domain/model/server';
import { useHome } from '@/ui/screens/home/useHome';

/** Ported from ui/screens/home/HomeScreen.kt. */
export function HomeScreen({
  onOpenTitle,
  onOpenProfile,
}: {
  onOpenTitle: (titleId: string) => void;
  onOpenProfile: () => void;
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
      <HomeHeader profile={profile} serverState={serverState} onOpenProfile={onOpenProfile} />

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
        </>
      )}
    </ScrollView>
  );
}

function HomeHeader({
  profile,
  serverState,
  onOpenProfile,
}: {
  profile: Profile | null;
  serverState: ServerState;
  onOpenProfile: () => void;
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
