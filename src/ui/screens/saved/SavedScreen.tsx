import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  Amber,
  AmberBorderSoft,
  AmberInk,
  AmberWash,
  DirectPlay,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  TowerType,
} from '@/theme';
import {
  EmptySavedSummary,
  SavedItem,
  SavedSummary,
  isInProgress,
  savedMonoStatus,
  savedPercent,
} from '@/domain/model/downloads';
import { formatBytes } from '@/domain/model/library';
import { withAlpha } from '@/ui/color';
import { useFlow, useRepository } from '@/ui/hooks';
import { CheckGlyph } from '@/ui/components/Glyphs';
import { DataLabel, DataMeta, HairlineDivider, TowerCard } from '@/ui/components/Primitives';
import { PosterThumb } from '@/ui/components/PosterCard';
import { Skeleton } from '@/ui/components/Rails';
import { ProgressTrack, UsageBar } from '@/ui/components/UsageBar';

/**
 * What is actually on this phone.
 *
 * This is the one tab that keeps working when the server is asleep, unreachable
 * or a hundred miles away, so it never shows a server-dependent state.
 *
 * Ported from ui/screens/saved/SavedScreen.kt.
 */
export function SavedScreen({ onOpenTitle }: { onOpenTitle: (titleId: string) => void }) {
  const repository = useRepository();
  // Saved copies live on this phone, so this list works with the server asleep,
  // unreachable, or on the other side of the country.
  const items = useFlow(repository.savedItems);

  const [summary, setSummary] = useState<SavedSummary>(EmptySavedSummary);
  /** "When I leave home Wi-Fi → play saved copies only". */
  const [savedOnlyOffWifi, setSavedOnlyOffWifi] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await repository.savedSummary());
    } catch {
      // The header totals are a nicety; the list underneath is the screen.
    }
  }, [repository]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  /**
   * Re-reads the saved list and its header totals.
   *
   * Worth a manual pull even though conversions are polled: a job that failed
   * while the app was backgrounded shows no progress to watch, so the only way
   * to find out is to ask again.
   */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  }, [loadSummary]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ink }}
      contentContainerStyle={{ paddingTop: 18, paddingBottom: 28 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={OnInkFaint}
        />
      }
    >
      <View style={{ paddingHorizontal: Space.Screen }}>
        <Text style={[TowerType.titleScreen, { color: OnInk }]}>Saved</Text>
        <DataLabel text={summaryLine(summary)} style={{ marginTop: 6 }} />
        {summary.segments.length > 0 && (
          <UsageBar segments={summary.segments} style={{ marginTop: 16 }} />
        )}
      </View>

      {items.length === 0 ? (
        <View style={{ paddingHorizontal: Space.Screen, paddingVertical: 28 }}>
          <Text style={[TowerType.titleSection, { color: OnInk }]}>Nothing saved yet</Text>
          <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>
            Nothing saved to this phone yet. Save a title and it plays without the server.
          </Text>
        </View>
      ) : (
        items.map((item) =>
          isInProgress(item) ? (
            <InProgressCard
              key={item.id}
              item={item}
              onCancel={() => void repository.cancelDownload(item.id)}
            />
          ) : (
            <FinishedRow key={item.id} item={item} onPress={() => onOpenTitle(item.title.id)} />
          ),
        )
      )}

      <SavedOnlyCard enabled={savedOnlyOffWifi} onChange={setSavedOnlyOffWifi} />
    </ScrollView>
  );
}

/** `3 SAVED · 15.5 GB USED · 41.2 GB FREE` */
function summaryLine(summary: SavedSummary): string {
  const parts = [`${summary.itemCount} SAVED`];
  if (summary.usedBytes > 0) parts.push(`${formatBytes(summary.usedBytes)} USED`);
  if (summary.freeBytes > 0) parts.push(`${formatBytes(summary.freeBytes)} FREE`);
  return parts.join(' · ');
}

/**
 * A conversion in flight is the thing on this screen that wants attention, so it
 * is the only item that gets a card and an amber tint.
 */
function InProgressCard({ item, onCancel }: { item: SavedItem; onCancel: () => void }) {
  const percent = savedPercent(item);
  return (
    <View style={styles.inProgress}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text
            style={[TowerType.titleRow, { color: OnInk }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.title.name}
          </Text>
          <DataMeta text={savedMonoStatus(item)} color={Amber} style={{ marginTop: 5 }} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Cancel ${item.title.name}`}
          onPress={onCancel}
          style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[TowerType.chipLabel, { color: OnInkMuted }]}>Cancel</Text>
        </Pressable>
      </View>
      {percent != null && <ProgressTrack fraction={percent / 100} style={{ marginTop: 12 }} />}
    </View>
  );
}

/** Finished items are plain rows — they are not objects wanting attention. */
function FinishedRow({ item, onPress }: { item: SavedItem; onPress: () => void }) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play ${item.title.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.finishedRow, { opacity: pressed ? 0.75 : 1 }]}
      >
        <PosterThumb seed={item.title.name} imageUrl={item.title.posterUrl} />
        <View style={{ flex: 1 }}>
          <Text
            style={[TowerType.titleRow, { color: OnInk }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.title.name}
          </Text>
          <DataMeta text={savedMonoStatus(item)} style={{ marginTop: 4 }} />
        </View>
        <CheckGlyph color={DirectPlay} size={14} />
      </Pressable>
      <HairlineDivider style={{ marginLeft: Space.Screen }} />
    </View>
  );
}

function SavedOnlyCard({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <TowerCard style={{ marginHorizontal: Space.Screen, marginTop: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={[TowerType.titleRow, { color: OnInk }]}>When I leave home Wi-Fi</Text>
          <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 4 }]}>
            Play saved copies only. Tower will not stream over your data plan unless you ask it to.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onChange}
          thumbColor={enabled ? AmberInk : OnInkFaint}
          trackColor={{ true: Amber, false: withAlpha('#FFFFFF', 0.12) }}
          ios_backgroundColor={withAlpha('#FFFFFF', 0.12)}
        />
      </View>
    </TowerCard>
  );
}

const styles = StyleSheet.create({
  inProgress: {
    marginHorizontal: Space.Screen,
    marginVertical: 8,
    borderRadius: Radius.Card,
    backgroundColor: AmberWash,
    borderWidth: 1,
    borderColor: AmberBorderSoft,
    padding: 14,
  },
  cancel: {
    borderRadius: Radius.Thumb,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  finishedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingHorizontal: Space.Screen,
    paddingVertical: 12,
  },
});
