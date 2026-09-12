import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Amber, Hairline, Ink, OnInk, OnInkFaint, OnInkMuted, Space, TowerType } from '@/theme';
import { formatBytes } from '@/domain/model/library';
import {
  Timeline,
  TimelineGroup,
  TimelineGrouping,
  TimelineGroupingMeta,
} from '@/domain/model/library';
import { Loading, UiState, dataOrNull, loadState } from '@/ui/uiState';
import { useRepository } from '@/ui/hooks';
import { CategoryChipRow } from '@/ui/components/Chips';
import { DataLabel, DataMeta, HairlineDivider } from '@/ui/components/Primitives';
import { PosterThumb } from '@/ui/components/PosterCard';
import { Skeleton } from '@/ui/components/Rails';
import { homeVideoMeta } from '@/ui/components/Rails';

const GROUPINGS: TimelineGrouping[] = ['DATE', 'PERSON', 'PLACE'];

/**
 * Home videos, as a timeline rather than a poster wall.
 *
 * A film has a poster and a year; a clip off a phone has neither. What it has is
 * a date, a place and the people in it, so the left gutter carries the month and
 * a hairline runs down the page — the shape of a diary, not a shelf.
 *
 * Ported from ui/screens/timeline/TimelineScreen.kt.
 */
export function TimelineScreen({ onOpenTitle }: { onOpenTitle: (titleId: string) => void }) {
  const repository = useRepository();
  const [state, setState] = useState<UiState<Timeline>>(Loading);
  const [grouping, setGrouping] = useState<TimelineGrouping>('DATE');
  const [refreshing, setRefreshing] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (next: TimelineGrouping) => {
      const loaded = await loadState(() => repository.timeline(next), {
        emptyWhen: (t) => t.groups.length === 0,
        emptyMessage:
          'No home videos on the disk yet. Point a library root at your clips and rescan.',
      });
      if (!alive.current) return;
      setState(loaded);
      setRefreshing(false);
    },
    [repository],
  );

  useEffect(() => {
    setState(Loading);
    void load(grouping);
  }, [load, grouping]);

  const timeline = dataOrNull(state);

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <View style={{ paddingHorizontal: Space.Screen, paddingVertical: 18 }}>
        <Text style={[TowerType.titleScreen, { color: OnInk }]}>Ours</Text>
        {timeline != null && <DataLabel text={summaryLine(timeline)} style={{ marginTop: 6 }} />}
      </View>

      <CategoryChipRow
        labels={GROUPINGS.map((g) => TimelineGroupingMeta[g].label)}
        selectedIndex={GROUPINGS.indexOf(timeline?.grouping ?? grouping)}
        onSelect={(index) => setGrouping(GROUPINGS[index])}
        style={{ flexGrow: 0 }}
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: 18, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(grouping);
            }}
            tintColor={OnInkFaint}
          />
        }
      >
        {state.type === 'LOADING' && (
          <View style={{ padding: Space.Screen, gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} style={{ width: '100%', height: 96 }} />
            ))}
          </View>
        )}
        {state.type === 'EMPTY' && <Message heading="No home videos yet" body={state.message} />}
        {state.type === 'ASLEEP' && (
          <Message
            heading="The disk is asleep"
            body="Wake Tower from the Home tab to see your clips."
          />
        )}
        {state.type === 'OFFLINE' && (
          <Message heading="Cannot reach Tower" body={state.message} />
        )}
        {state.type === 'LOADED' && (
          <>
            {state.data.groups.map((group, index) => (
              <TimelineGroupRow
                key={group.key}
                group={group}
                // The most recent month is the one you just filmed.
                highlighted={index === 0}
                onOpenTitle={onOpenTitle}
              />
            ))}
            {state.data.undatedCount > 0 && (
              <View style={styles.nudge}>
                <Text style={[TowerType.bodyProse, { color: OnInkMuted }]}>
                  {state.data.undatedCount} clip
                  {state.data.undatedCount === 1 ? ' has' : 's have'} no date — they sit outside
                  the timeline until one is written beside them on the disk.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TimelineGroupRow({
  group,
  highlighted,
  onOpenTitle,
}: {
  group: TimelineGroup;
  highlighted: boolean;
  onOpenTitle: (titleId: string) => void;
}) {
  // The server formats the label for the gutter already — `DEC / 2024` — so the
  // client never parses dates to render it.
  const parts = group.label.split('/').map((p) => p.trim());

  return (
    <View style={styles.groupRow}>
      {/* The gutter: month over year, current month in amber. */}
      <View style={{ width: 46 }}>
        <DataLabel text={parts[0] ?? ''} color={highlighted ? Amber : OnInkFaint} />
        <DataLabel text={parts[1] ?? ''} color={OnInkFaint} style={{ marginTop: 2 }} />
      </View>

      {/* The spine: a dot per group on a vertical hairline. */}
      <View style={styles.spine}>
        <View style={[styles.dot, { backgroundColor: highlighted ? Amber : OnInkFaint }]} />
        <View style={styles.spineLine} />
      </View>

      <View style={{ flex: 1, paddingBottom: 22 }}>
        <DataMeta
          text={`${group.itemCount} CLIP${group.itemCount === 1 ? '' : 'S'}`}
          style={{ marginBottom: 10 }}
        />
        {group.items.map((title) => (
          <Pressable
            key={title.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${title.name}`}
            onPress={() => onOpenTitle(title.id)}
            style={({ pressed }) => [styles.clip, { opacity: pressed ? 0.75 : 1 }]}
          >
            <PosterThumb
              seed={title.name}
              imageUrl={title.posterUrl}
              width={64}
              height={40}
            />
            <View style={{ flex: 1 }}>
              <Text style={[TowerType.titleRow, { color: OnInk }]} numberOfLines={1}>
                {title.name}
              </Text>
              <DataMeta text={homeVideoMeta(title)} style={{ marginTop: 3 }} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** `61 CLIPS · 361 GB` */
function summaryLine(timeline: Timeline): string {
  const clips = timeline.groups.reduce((sum, g) => sum + g.itemCount, 0);
  const bytes = timeline.groups.reduce(
    (sum, g) => sum + g.items.reduce((b, t) => b + t.file.sizeBytes, 0),
    0,
  );
  const parts = [`${clips} CLIP${clips === 1 ? '' : 'S'}`];
  if (bytes > 0) parts.push(formatBytes(bytes));
  return parts.join(' · ');
}

function Message({ heading, body }: { heading: string; body: string }) {
  return (
    <View style={{ paddingHorizontal: Space.Screen, paddingTop: 12 }}>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>{heading}</Text>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  groupRow: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: Space.Screen,
  },
  spine: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 3,
  },
  spineLine: {
    flex: 1,
    width: StyleSheet.hairlineWidth,
    backgroundColor: Hairline,
    marginTop: 4,
  },
  clip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  nudge: {
    marginHorizontal: Space.Screen,
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Hairline,
  },
});
