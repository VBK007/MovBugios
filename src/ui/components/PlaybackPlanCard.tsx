import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import {
  Amber,
  AmberBorderSoft,
  AmberWash,
  Asleep,
  DirectPlay,
  DirectPlayBorder,
  DirectPlayWash,
  Hairline,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Surface1,
  TowerType,
  useShowTechnicalBadges,
} from '@/theme';
import { formatBytes } from '@/domain/model/library';
import {
  FileSpec,
  PlaybackPlan,
  audioSummary,
  containerAndCodec,
  resolution,
} from '@/domain/model/media';
import { StatusDot } from '@/ui/components/Primitives';

/**
 * The card that answers "what will actually happen if I press play", *before*
 * the user presses play.
 *
 * The heading is mono because it is the server's verdict; the sentence under it
 * is Archivo because a person wrote it. When technical badges are off the mono
 * heading and spec row disappear and the sentence carries the whole meaning —
 * which is exactly why the sentence has to be a real sentence.
 *
 * Ported from ui/components/PlaybackPlanCard.kt.
 */
export function PlaybackPlanCard({
  plan,
  file,
  style,
}: {
  plan: PlaybackPlan;
  file: FileSpec;
  style?: StyleProp<ViewStyle>;
}) {
  const showBadges = useShowTechnicalBadges();
  const { tint, wash, border, heading } = planStyle(plan);
  const sentence = planSentence(plan);

  return (
    <View
      accessibilityLabel={describePlan(plan)}
      style={[
        styles.card,
        {
          backgroundColor: plan.type === 'UNKNOWN' ? Surface1 : wash,
          borderColor: border,
        },
        style as never,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StatusDot color={tint} pulsing={plan.type === 'DIRECT_PLAY'} />
        {/* Kept visible even with badges off: it is the headline, not a spec. */}
        <Text style={[TowerType.dataLabel, { color: tint }]}>{heading}</Text>
      </View>

      {sentence != null && (
        <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 9 }]}>{sentence}</Text>
      )}

      {showBadges && <SpecRow file={file} style={{ marginTop: 13 }} />}
    </View>
  );
}

/**
 * The four measured facts about a file, evenly spaced.
 *
 * Values are mono; there are no human labels above them because the values are
 * self-describing — `4.2 GB` does not need the word "size" over it.
 */
export function SpecRow({
  file,
  color = OnInkFaint,
  style,
}: {
  file: FileSpec;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const showBadges = useShowTechnicalBadges();
  if (!showBadges) return null;

  const cells: string[] = [];
  const cc = containerAndCodec(file);
  if (cc) cells.push(cc);
  const res = resolution(file);
  if (res) cells.push(res);
  if (file.sizeBytes > 0) cells.push(formatBytes(file.sizeBytes));
  const audio = audioSummary(file);
  if (audio) cells.push(audio);

  if (cells.length === 0) return null;

  return (
    <View style={[styles.specRow, style as never]}>
      {cells.map((cell) => (
        // `MKV · H.264` and `EN + HI` arrive uppercase from the file spec; the
        // resolution deliberately does not, so it stays `1080p`.
        <Text key={cell} style={[TowerType.dataMeta, { color }]} numberOfLines={1}>
          {cell}
        </Text>
      ))}
    </View>
  );
}

interface PlanStyle {
  tint: string;
  wash: string;
  border: string;
  heading: string;
}

function planStyle(plan: PlaybackPlan): PlanStyle {
  switch (plan.type) {
    case 'DIRECT_PLAY':
      return {
        tint: DirectPlay,
        wash: DirectPlayWash,
        border: DirectPlayBorder,
        heading: 'DIRECT PLAY TO THIS PHONE',
      };
    case 'TRANSCODE':
      return {
        tint: Amber,
        wash: AmberWash,
        border: AmberBorderSoft,
        heading: 'THE SERVER WILL CONVERT THIS',
      };
    case 'UNKNOWN':
      return {
        tint: Asleep,
        wash: 'transparent',
        border: Hairline,
        heading: 'NOT CHECKED YET',
      };
  }
}

/**
 * The plain-English half. Falls back to a written sentence when the server sent
 * no reasoning, so this card is never just a coloured word.
 */
function planSentence(plan: PlaybackPlan): string | null {
  switch (plan.type) {
    case 'DIRECT_PLAY':
      return (
        plan.reasons[0] ??
        'The file plays as it is. Nothing is converted, so the picture is exactly what is on ' +
          'the disk and the server stays idle.'
      );
    case 'TRANSCODE': {
      if (plan.reasons[0]) return plan.reasons[0];
      const { fromResolution: from, toResolution: to } = plan;
      if (from != null && to != null) {
        return (
          'This phone cannot play the file as it is, so the server will re-encode it from ' +
          `${from} to ${to} while you watch.`
        );
      }
      return (
        'This phone cannot play the file as it is, so the server will re-encode it while ' +
        'you watch.'
      );
    }
    case 'UNKNOWN':
      return 'We have not asked the server how this would play yet.';
  }
}

function describePlan(plan: PlaybackPlan): string {
  switch (plan.type) {
    case 'DIRECT_PLAY':
      return 'Plays directly on this phone, nothing is converted';
    case 'TRANSCODE':
      return 'The server will convert this file before sending it';
    case 'UNKNOWN':
      return 'Playback not checked yet';
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.Card,
    borderWidth: 1,
    padding: 14,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    borderRadius: Radius.Thumb,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: Hairline,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
