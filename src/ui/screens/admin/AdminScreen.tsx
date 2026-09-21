import { failureCopy } from '@/ui/failureCopy';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Amber,
  AmberBorderSoft,
  AmberWash,
  DirectPlay,
  Hairline,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  TowerType,
} from '@/theme';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import {
  DiskUsage,
  EmptyDiskUsage,
  EmptyServerHealth,
  ServerHealth,
  diskMonoLine,
  reclaimableBytes,
} from '@/domain/model/admin';
import { formatBytes } from '@/domain/model/library';
import {
  LiveSession,
  WatchHabit,
  sessionProgressFraction,
  sessionWhat,
  sessionWho,
} from '@/domain/model/people';
import { Loading, UiState, loadState } from '@/ui/uiState';
import { withAlpha } from '@/ui/color';
import { useRepository } from '@/ui/hooks';
import { ChevronGlyph } from '@/ui/components/Glyphs';
import {
  AmberButton,
  DataLabel,
  DataMeta,
  DataValue,
  HairlineDivider,
  OutlineButton,
  TowerCard,
} from '@/ui/components/Primitives';
import { Field } from '@/ui/components/Field';
import { HairlineListItem } from '@/ui/components/HairlineListItem';
import { ProgressTrack, UsageBar } from '@/ui/components/UsageBar';
import { Skeleton } from '@/ui/components/Rails';

type AdminTab = 'HEALTH' | 'PEOPLE' | 'DISK';

/** The panel's three tabs, in board order. */
const TABS: { key: AdminTab; label: string }[] = [
  { key: 'HEALTH', label: 'Health' },
  { key: 'PEOPLE', label: 'People' },
  { key: 'DISK', label: 'Disk' },
];

/**
 * Owner-only maintenance, each a single call the server does the thinking for.
 *
 * "Fill in missing ratings" exists because a library scanned from bare files has
 * no ratings or play counts, so Home's ranking rails have nothing to sort by and
 * hide themselves. "Find missing posters" re-checks posterless titles against a
 * matcher that has since improved — an ordinary scan only revisits files it
 * considers changed, so titles already on disk would never pick it up.
 */
const ACTIONS = [
  {
    key: 'SEED_ANALYTICS' as const,
    label: 'Fill in missing ratings',
    detail: 'Gives films with no rating or view count a plausible one. Real ones are kept.',
  },
  {
    key: 'BACKFILL_ARTWORK' as const,
    label: 'Find missing posters',
    detail: 'Re-checks every title without artwork against what the server can match today.',
  },
];

/**
 * The owner panel.
 *
 * Ported from ui/screens/admin/AdminScreen.kt and its ViewModel.
 */
export function AdminScreen({
  onBack,
  onOpenFixMatches,
}: {
  onBack: () => void;
  onOpenFixMatches: () => void;
}) {
  const repository = useRepository();
  const remote = repository instanceof RemoteTowerRepository ? repository : null;

  const [tab, setTab] = useState<AdminTab>('HEALTH');
  const [health, setHealth] = useState<UiState<ServerHealth>>(Loading);
  const [habits, setHabits] = useState<UiState<WatchHabit[]>>(Loading);
  const [disk, setDisk] = useState<UiState<DiskUsage>>(Loading);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  /** True when the server rejected us for want of the admin key. */
  const [needsAdminKey, setNeedsAdminKey] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState('');

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * The panel is gated on a key the app cannot derive, so a rejection here is a
   * prompt rather than an error — "forbidden" with no way forward would be a
   * dead end on the owner's own server.
   */
  const looksLikeAuthFailure = (state: UiState<unknown>): boolean =>
    state.type === 'OFFLINE' &&
    ['owner-only', 'admin key', 'not authorised'].some((needle) =>
      state.message.toLowerCase().includes(needle),
    );

  const loadHealth = useCallback(async () => {
    if (!remote) return;
    setHealth(Loading);
    const loaded = await loadState(() => remote.serverHealth());
    if (!alive.current) return;
    setHealth(loaded);
    setNeedsAdminKey(looksLikeAuthFailure(loaded));
  }, [remote]);

  const loadHabits = useCallback(async () => {
    if (!remote) return;
    setHabits(await loadState(() => remote.watchHabits()));
  }, [remote]);

  const loadDisk = useCallback(async () => {
    if (!remote) return;
    setDisk(await loadState(() => remote.diskUsage()));
  }, [remote]);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  // Live sessions are the one thing here that changes minute to minute, so this
  // stays polling while the panel is open.
  useEffect(() => {
    if (!remote) return;
    return remote.liveSessions((next) => {
      if (alive.current) setSessions(next);
    });
  }, [remote]);

  const selectTab = useCallback(
    (next: AdminTab) => {
      setTab(next);
      // Each tab is a separate request; loading all three up front would make
      // opening the panel slow for data most visits never look at.
      if (next === 'HEALTH' && health.type !== 'LOADED') void loadHealth();
      if (next === 'PEOPLE' && habits.type !== 'LOADED') void loadHabits();
      if (next === 'DISK' && disk.type !== 'LOADED') void loadDisk();
    },
    [health.type, habits.type, disk.type, loadHealth, loadHabits, loadDisk],
  );

  const runAction = useCallback(
    async (key: (typeof ACTIONS)[number]['key']) => {
      if (!remote) return;
      setRunningAction(key);
      setActionResult(null);
      try {
        const message =
          key === 'SEED_ANALYTICS'
            ? await remote.seedAnalytics()
            : await remote.backfillArtwork();
        if (alive.current) setActionResult(message ?? 'Done.');
      } catch (e) {
        if (alive.current) setActionResult(failureCopy(e));
      } finally {
        if (alive.current) setRunningAction(null);
      }
    },
    [remote],
  );

  if (needsAdminKey) {
    return (
      <AdminKeyPrompt
        value={adminKeyInput}
        onChange={setAdminKeyInput}
        onBack={onBack}
        onSubmit={() => {
          remote?.setAdminKey(adminKeyInput.trim() || null);
          setNeedsAdminKey(false);
          void loadHealth();
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronGlyph rotation={180} color={OnInk} size={18} />
        </Pressable>
        <Text style={[TowerType.titleScreen, { color: OnInk, marginLeft: 4 }]}>Owner panel</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
            onPress={() => selectTab(t.key)}
            style={styles.tab}
          >
            <Text
              style={[
                TowerType.navLabel,
                { color: tab === t.key ? Amber : withAlpha(OnInk, 0.4) },
              ]}
            >
              {t.label.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      <HairlineDivider />

      <ScrollView contentContainerStyle={{ padding: Space.Screen, paddingBottom: 40 }}>
        {tab === 'HEALTH' && (
          <HealthTab
            state={health}
            sessions={sessions}
            actions={{ runningAction, actionResult, runAction }}
            rescanning={rescanning}
            onRescan={async () => {
              if (!remote) return;
              setRescanning(true);
              try {
                await remote.rescanLibrary();
                setActionResult('Rescan started.');
              } catch (e) {
                setActionResult(failureCopy(e));
              } finally {
                if (alive.current) setRescanning(false);
              }
            }}
            onOpenFixMatches={onOpenFixMatches}
            onEndSession={(id) => void remote?.endSession(id)}
          />
        )}
        {tab === 'PEOPLE' && <PeopleTab state={habits} />}
        {tab === 'DISK' && <DiskTab state={disk} />}
      </ScrollView>
    </View>
  );
}

function HealthTab({
  state,
  sessions,
  actions,
  rescanning,
  onRescan,
  onOpenFixMatches,
  onEndSession,
}: {
  state: UiState<ServerHealth>;
  sessions: LiveSession[];
  actions: {
    runningAction: string | null;
    actionResult: string | null;
    runAction: (key: 'SEED_ANALYTICS' | 'BACKFILL_ARTWORK') => Promise<void>;
  };
  rescanning: boolean;
  onRescan: () => void;
  onOpenFixMatches: () => void;
  onEndSession: (id: string) => void;
}) {
  if (state.type === 'LOADING') return <PanelSkeleton />;
  if (state.type !== 'LOADED') {
    return <Message heading="Cannot read the server" body={messageOf(state)} />;
  }
  const health = state.data ?? EmptyServerHealth;

  return (
    <View>
      <View style={styles.statRow}>
        <Stat label="UPTIME" value={`${health.uptimeDays}d`} />
        <Stat label="STREAMING" value={String(health.streamingNow)} />
        <Stat label="CPU" value={`${health.cpuPercent}%`} />
      </View>

      {health.transcodeNote != null && (
        <View style={styles.noteCard}>
          <DataLabel text="TRANSCODING" color={Amber} />
          <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>
            {health.transcodeNote}
          </Text>
        </View>
      )}

      {health.week.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <DataLabel text="THIS WEEK" />
          <View style={styles.chart}>
            {health.week.map((day) => (
              <View key={day.day} style={styles.barColumn}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(4, day.relative * 100)}%`,
                      backgroundColor: day.isPeak ? Amber : withAlpha(Amber, 0.45),
                    },
                  ]}
                />
                <DataMeta text={day.day} color={OnInkFaint} style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>
          {health.peakNote != null && (
            <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 8 }]}>
              {health.peakNote}
            </Text>
          )}
        </View>
      )}

      {sessions.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <DataLabel text="PLAYING NOW" />
          {sessions.map((session) => (
            <TowerCard key={session.id} style={{ marginTop: 10 }}>
              <Text style={[TowerType.titleRow, { color: OnInk }]}>{sessionWho(session)}</Text>
              <DataMeta text={sessionWhat(session)} style={{ marginTop: 4 }} />
              <ProgressTrack
                fraction={sessionProgressFraction(session)}
                style={{ marginTop: 10 }}
              />
              <OutlineButton
                label="End this stream"
                onPress={() => onEndSession(session.id)}
                height={38}
                style={{ marginTop: 12, alignSelf: 'flex-start' }}
              />
            </TowerCard>
          ))}
        </View>
      )}

      {health.needsALook.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <DataLabel text="NEEDS A LOOK" />
          {health.needsALook.map((item, index) => (
            <HairlineListItem
              key={`${item.text}-${index}`}
              title={item.text}
              onPress={item.route != null ? onOpenFixMatches : undefined}
              trailing={
                <DataLabel
                  text={item.actionLabel}
                  color={item.urgent ? Amber : OnInkFaint}
                  technical={false}
                />
              }
            />
          ))}
        </View>
      )}

      <View style={{ marginTop: 24 }}>
        <DataLabel text="MAINTENANCE" />
        <HairlineListItem
          title="Fix wrong matches"
          supporting="Titles the scanner guessed at"
          onPress={onOpenFixMatches}
          trailing={<ChevronGlyph color={OnInkFaint} size={14} />}
        />
        {ACTIONS.map((action) => (
          <HairlineListItem
            key={action.key}
            title={action.label}
            supporting={action.detail}
            onPress={() => void actions.runAction(action.key)}
            trailing={
              actions.runningAction === action.key ? (
                <DataLabel text="RUNNING" color={Amber} technical={false} />
              ) : (
                <ChevronGlyph color={OnInkFaint} size={14} />
              )
            }
          />
        ))}
        <AmberButton
          label={rescanning ? 'Rescanning…' : 'Rescan the library'}
          onPress={onRescan}
          enabled={!rescanning}
          style={{ marginTop: 18 }}
        />
        {actions.actionResult != null && (
          <Text style={[TowerType.bodyProse, { color: DirectPlay, marginTop: 12 }]}>
            {actions.actionResult}
          </Text>
        )}
      </View>
    </View>
  );
}

function PeopleTab({ state }: { state: UiState<WatchHabit[]> }) {
  if (state.type === 'LOADING') return <PanelSkeleton />;
  if (state.type !== 'LOADED') {
    return <Message heading="Cannot read the server" body={messageOf(state)} />;
  }
  if (state.data.length === 0) {
    return <Message heading="Nothing watched yet" body="Habits appear once people watch." />;
  }

  return (
    <View>
      <DataLabel text="THIS MONTH" />
      {state.data.map((habit) => (
        <View key={habit.profileName} style={{ marginTop: 16 }}>
          <View style={styles.habitRow}>
            <Text style={[TowerType.titleRow, { color: OnInk, flex: 1 }]}>
              {habit.profileName}
            </Text>
            <DataValue text={`${Math.round(habit.hours)}h`} />
          </View>
          <ProgressTrack fraction={habit.relative} height={6} style={{ marginTop: 8 }} />
          {habit.note != null && <DataMeta text={habit.note} style={{ marginTop: 6 }} />}
        </View>
      ))}
    </View>
  );
}

function DiskTab({ state }: { state: UiState<DiskUsage> }) {
  if (state.type === 'LOADING') return <PanelSkeleton />;
  if (state.type !== 'LOADED') {
    return <Message heading="Cannot read the server" body={messageOf(state)} />;
  }
  const disk = state.data ?? EmptyDiskUsage;

  return (
    <View>
      <DataLabel text={diskMonoLine(disk)} />
      {disk.segments.length > 0 && <UsageBar segments={disk.segments} style={{ marginTop: 16 }} />}

      {disk.biggestFiles.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <DataLabel text="BIGGEST FILES" />
          {disk.biggestFiles.map((file, index) => (
            <HairlineListItem
              key={file.id}
              title={file.title}
              supporting={file.note}
              showDivider={index !== disk.biggestFiles.length - 1}
              trailing={<DataValue text={formatBytes(file.sizeBytes)} />}
            />
          ))}
        </View>
      )}

      {disk.reclaimable.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <DataLabel text={`RECLAIMABLE · ${formatBytes(reclaimableBytes(disk))}`} />
          {disk.reclaimable.map((item, index) => (
            <HairlineListItem
              key={item.label}
              title={item.label}
              showDivider={index !== disk.reclaimable.length - 1}
              trailing={<DataValue text={formatBytes(item.bytes)} />}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function AdminKeyPrompt({
  value,
  onChange,
  onBack,
  onSubmit,
}: {
  value: string;
  onChange: (next: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronGlyph rotation={180} color={OnInk} size={18} />
        </Pressable>
        <Text style={[TowerType.titleScreen, { color: OnInk, marginLeft: 4 }]}>Owner panel</Text>
      </View>
      <View style={{ padding: Space.Screen }}>
        <Text style={[TowerType.titleSection, { color: OnInk }]}>This needs the owner key</Text>
        <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 10 }]}>
          The panel is gated on a secret set on the server as `app.admin.api-key`. It is not
          something the app can work out — paste it once and it is remembered on this phone.
        </Text>
        <Field
          value={value}
          onChange={onChange}
          placeholder="Owner key"
          isPassword
          onSubmitEditing={onSubmit}
          style={{ marginTop: 20 }}
        />
        <AmberButton label="Unlock" onPress={onSubmit} style={{ marginTop: 14 }} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <TowerCard style={{ flex: 1 }} padding={14}>
      <Text style={[TowerType.titleStat, { color: OnInk }]}>{value}</Text>
      <DataLabel text={label} style={{ marginTop: 4 }} />
    </TowerCard>
  );
}

function Message({ heading, body }: { heading: string; body: string }) {
  return (
    <View>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>{heading}</Text>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{body}</Text>
    </View>
  );
}

function messageOf(state: UiState<unknown>): string {
  if (state.type === 'OFFLINE' || state.type === 'EMPTY') return state.message;
  if (state.type === 'ASLEEP') return 'The server is asleep.';
  return 'We cannot reach the server.';
}

function PanelSkeleton() {
  return (
    <View style={{ gap: 14 }}>
      <Skeleton cornerRadius={12} style={{ width: '100%', height: 76 }} />
      <Skeleton cornerRadius={12} style={{ width: '100%', height: 140 }} />
      <Skeleton cornerRadius={12} style={{ width: '100%', height: 100 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    width: '100%',
  },
  tab: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  noteCard: {
    marginTop: 18,
    borderRadius: Radius.Card,
    backgroundColor: AmberWash,
    borderWidth: 1,
    borderColor: AmberBorderSoft,
    padding: 14,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 120,
    marginTop: 14,
  },
  barColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    borderRadius: 3,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
