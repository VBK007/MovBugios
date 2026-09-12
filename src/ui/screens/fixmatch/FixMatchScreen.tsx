import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Amber,
  AmberInk,
  DirectPlay,
  Hairline,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  Surface1,
  TowerType,
} from '@/theme';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import { MatchCandidate, Mismatch, candidateMonoMeta } from '@/domain/model/admin';
import { formatBytes } from '@/domain/model/library';
import { Loading, UiState, loadState } from '@/ui/uiState';
import { useRepository } from '@/ui/hooks';
import { ChevronGlyph } from '@/ui/components/Glyphs';
import {
  AmberButton,
  DataLabel,
  DataMeta,
  OutlineButton,
  TowerCard,
} from '@/ui/components/Primitives';
import { Skeleton } from '@/ui/components/Rails';

/**
 * One wrong match at a time, with the file's own name above the candidates.
 *
 * A queue rather than a list: the decision is "which of these is it", and
 * showing forty files at once turns a series of small answers into an audit.
 * The filename is the evidence, so it leads — the guessed title is what is being
 * questioned, not what is being confirmed.
 *
 * Ported from ui/screens/fixmatch/FixMatchScreen.kt.
 */
export function FixMatchScreen({ onBack }: { onBack: () => void }) {
  const repository = useRepository();
  const remote = repository instanceof RemoteTowerRepository ? repository : null;

  const [queue, setQueue] = useState<UiState<Mismatch[]>>(Loading);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!remote) {
      setQueue({ type: 'EMPTY', message: 'Fixing matches needs a server. Sign in first.' });
      return;
    }
    const loaded = await loadState(() => remote.mismatches(), {
      emptyWhen: (list) => list.length === 0,
      emptyMessage: 'Nothing is mismatched. Every file on the disk found a title.',
    });
    if (!alive.current) return;
    setQueue(loaded);
    setSelected(null);
  }, [remote]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = queue.type === 'LOADED' ? queue.data[0] : null;

  /** Takes the head off the queue rather than refetching the whole thing. */
  const advance = useCallback(() => {
    setQueue((state) =>
      state.type === 'LOADED'
        ? state.data.length <= 1
          ? { type: 'EMPTY', message: 'That was the last one. Every file has a title now.' }
          : { type: 'LOADED', data: state.data.slice(1) }
        : state,
    );
    setSelected(null);
  }, []);

  const act = useCallback(
    async (run: () => Promise<void>) => {
      setBusy(true);
      try {
        await run();
        if (alive.current) advance();
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [advance],
  );

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
        <Text style={[TowerType.titleScreen, { color: OnInk, marginLeft: 4 }]}>
          Fix wrong matches
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: Space.Screen, paddingBottom: 40 }}>
        {queue.type === 'LOADING' && (
          <View style={{ gap: 14 }}>
            <Skeleton cornerRadius={12} style={{ width: '100%', height: 110 }} />
            <Skeleton cornerRadius={12} style={{ width: '100%', height: 220 }} />
          </View>
        )}

        {queue.type === 'EMPTY' && (
          <Message heading="Nothing to fix" body={queue.message} />
        )}
        {queue.type === 'OFFLINE' && (
          <Message heading="Cannot reach Tower" body={queue.message} />
        )}
        {queue.type === 'ASLEEP' && (
          <Message
            heading="The disk is asleep"
            body="Wake Tower before fixing matches — the files have to be readable."
          />
        )}

        {current != null && (
          <>
            {current.remainingInQueue > 0 && (
              <DataLabel
                text={`${current.remainingInQueue} MORE AFTER THIS`}
                style={{ marginBottom: 12 }}
              />
            )}

            {/* The evidence: what is actually written on the disk. */}
            <TowerCard>
              <DataLabel text="THE FILE" />
              <Text style={[TowerType.titleRow, { color: OnInk, marginTop: 8 }]}>
                {current.file.filename}
              </Text>
              {current.file.sizeBytes > 0 && (
                <DataMeta
                  text={formatBytes(current.file.sizeBytes)}
                  style={{ marginTop: 4 }}
                />
              )}
              {current.guessedTitle !== '' && (
                <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 10 }]}>
                  Currently filed as “{current.guessedTitle}”.
                </Text>
              )}
            </TowerCard>

            <DataLabel text="COULD BE" style={{ marginTop: 24 }} />
            {current.candidates.length === 0 ? (
              <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 10 }]}>
                The server found nothing to suggest. Move it to home videos, or leave it as it is.
              </Text>
            ) : (
              current.candidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  selected={selected === candidate.id}
                  onPress={() => setSelected(candidate.id)}
                />
              ))
            )}

            <AmberButton
              label={busy ? 'Applying…' : 'Use this one'}
              onPress={() =>
                void act(() => remote!.applyMatch(current.id, selected!))
              }
              enabled={selected != null && !busy}
              style={{ marginTop: 22 }}
            />
            <OutlineButton
              label="This is a home video"
              onPress={() => void act(() => remote!.moveToHomeVideos(current.id))}
              fillWidth
              style={{ marginTop: 10 }}
            />
            <OutlineButton
              label="Leave it unmatched"
              onPress={() => void act(() => remote!.leaveUnmatched(current.id))}
              fillWidth
              style={{ marginTop: 10 }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CandidateRow({
  candidate,
  selected,
  onPress,
}: {
  candidate: MatchCandidate;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.candidate,
        selected
          ? { borderColor: Amber, backgroundColor: Surface1 }
          : { borderColor: Hairline },
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[TowerType.titleRow, { color: OnInk }]}>{candidate.title}</Text>
        <DataMeta text={candidateMonoMeta(candidate)} style={{ marginTop: 4 }} />
      </View>
      {selected && (
        <View style={styles.tick}>
          <DataLabel text="✓" color={AmberInk} technical={false} />
        </View>
      )}
    </Pressable>
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
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    borderRadius: Radius.Card,
    borderWidth: 1,
    padding: 14,
  },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
