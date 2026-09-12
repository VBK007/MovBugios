import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import { OnInk } from '@/theme';

// ---------------------------------------------------------------------------
// The set is tiny and geometric, which suits a UI built from hairlines and
// gradients, and it keeps the iOS framework from carrying an icon pack for the
// handful of shapes this app actually uses.
//
// Every glyph is decorative: the control that wraps one carries the label, so
// these are hidden from screen readers rather than announcing as unlabelled
// images.
//
// Ported from ui/components/Glyphs.kt. The Compose originals draw into a canvas
// in fractions of the box; a `0 0 100 100` viewBox keeps that arithmetic
// readable — `w * 0.28f` becomes `28`.
// ---------------------------------------------------------------------------

function Glyph({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {children}
      </Svg>
    </View>
  );
}

export function PlayGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  // Inset slightly so the triangle reads as centred inside a circle.
  return (
    <Glyph size={size}>
      <Path d="M28 16 L84 50 L28 84 Z" fill={color} />
    </Glyph>
  );
}

export function PauseGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Path d="M26 16 h16 v68 h-16 Z" fill={color} />
      <Path d="M58 16 h16 v68 h-16 Z" fill={color} />
    </Glyph>
  );
}

/** A chevron. `rotation` 0 points right; 90 points down. */
export function ChevronGlyph({
  rotation = 0,
  color = OnInk,
  size = 16,
  strokeWidth = 10,
}: {
  rotation?: number;
  color?: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <Glyph size={size}>
      <Polyline
        points="40,24 64,50 40,76"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        origin="50, 50"
        rotation={rotation}
      />
    </Glyph>
  );
}

export function CheckGlyph({ color = OnInk, size = 12 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Polyline
        points="20,52 42,74 80,26"
        fill="none"
        stroke={color}
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

/**
 * A five-pointed star, filled. The rating mark.
 *
 * Drawn rather than typed as `★`: the glyph exists in Archivo but sits on the
 * text baseline with its own side bearings, so it never quite lines up beside a
 * number — which is exactly where this one always appears.
 */
export function StarGlyph({ color = OnInk, size = 12 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Path
        d="M50 8 L61.8 38.2 L94 40.5 L69.1 61.3 L77.1 92.6 L50 75.4 L22.9 92.6 L30.9 61.3 L6 40.5 L38.2 38.2 Z"
        fill={color}
      />
    </Glyph>
  );
}

export function SearchGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Circle cx={44} cy={42} r={26} fill="none" stroke={color} strokeWidth={10} />
      <Line
        x1={64}
        y1={62}
        x2={84}
        y2={84}
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
      />
    </Glyph>
  );
}

export function DownloadGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Line x1={50} y1={16} x2={50} y2={62} stroke={color} strokeWidth={10} strokeLinecap="round" />
      <Polyline
        points="30,44 50,66 70,44"
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={24} y1={84} x2={76} y2={84} stroke={color} strokeWidth={10} strokeLinecap="round" />
    </Glyph>
  );
}

/** `▣` — the cast glyph: a screen with a corner wave. */
export function CastGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Path
        d="M14 26 h72 v48 h-26"
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 50 a24 24 0 0 1 24 24"
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
      />
      <Circle cx={16} cy={74} r={6} fill={color} />
    </Glyph>
  );
}

/** `⋯` — overflow. */
export function OverflowGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Circle cx={24} cy={50} r={7} fill={color} />
      <Circle cx={50} cy={50} r={7} fill={color} />
      <Circle cx={76} cy={50} r={7} fill={color} />
    </Glyph>
  );
}

/** `▤` — a disk/stack, used on the server-asleep screen. */
export function DiskGlyph({ color = OnInk, size = 21 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Path
        d="M18 30 h64 v40 h-64 Z"
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinejoin="round"
      />
      <Line x1={18} y1={50} x2={82} y2={50} stroke={color} strokeWidth={8} />
      <Circle cx={69} cy={40} r={4} fill={color} />
      <Circle cx={69} cy={60} r={4} fill={color} />
    </Glyph>
  );
}

/**
 * Two figures, one behind the other — watch together.
 *
 * The far figure is drawn first so the near one overlaps it, which is what makes
 * two circles read as two people rather than a Venn diagram.
 */
export function TogetherGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      {/* Far figure. */}
      <Circle cx={66} cy={34} r={15} fill={color} />
      <Path
        d="M44 76 a22 20 0 0 1 44 0"
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
      />
      {/* Near figure, overlapping. */}
      <Circle cx={36} cy={32} r={18} fill={color} />
      <Path
        d="M10 77 a26 23 0 0 1 52 0"
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
      />
    </Glyph>
  );
}

/** `⏪` / `⏩` — a double chevron, direction by `forward`. */
export function SkipGlyph({
  forward,
  color = OnInk,
  size = 22,
}: {
  forward: boolean;
  color?: string;
  size?: number;
}) {
  return (
    <Glyph size={size}>
      <Polyline
        points="46,26 70,50 46,74"
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        origin="50, 50"
        rotation={forward ? 0 : 180}
      />
      <Polyline
        points="22,26 46,50 22,74"
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        origin="50, 50"
        rotation={forward ? 0 : 180}
      />
    </Glyph>
  );
}

/** A speech bubble — the comment thread. */
export function CommentGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Path
        d="M16 22 h68 v44 h-40 l-18 16 v-16 h-10 Z"
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

/** A crescent — night view. */
export function MoonGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Path d="M72 62 A34 34 0 1 1 44 16 A28 28 0 0 0 72 62 Z" fill={color} />
    </Glyph>
  );
}

/** A phone with a turning arrow — the rotation lock. */
export function RotateGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Path
        d="M32 20 h36 v60 h-36 Z"
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinejoin="round"
      />
      <Path
        d="M18 38 a34 34 0 0 1 12 -16"
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <Polyline points="10,30 18,40 28,34" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
    </Glyph>
  );
}

/** A sun — the brightness read-out. */
export function BrightnessGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <Glyph size={size}>
      <Circle cx={50} cy={50} r={18} fill="none" stroke={color} strokeWidth={8} />
      {rays.map((angle) => (
        <Line
          key={angle}
          x1={50}
          y1={22}
          x2={50}
          y2={10}
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          origin="50, 50"
          rotation={angle}
        />
      ))}
    </Glyph>
  );
}

/** A speaker, with or without waves. */
export function VolumeGlyph({
  color = OnInk,
  size = 16,
  muted = false,
}: {
  color?: string;
  size?: number;
  muted?: boolean;
}) {
  return (
    <Glyph size={size}>
      <Path d="M14 38 h16 L52 20 v60 L30 62 h-16 Z" fill={color} />
      {muted ? (
        <>
          <Line x1={64} y1={38} x2={88} y2={62} stroke={color} strokeWidth={8} strokeLinecap="round" />
          <Line x1={88} y1={38} x2={64} y2={62} stroke={color} strokeWidth={8} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Path d="M64 36 a20 20 0 0 1 0 28" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" />
          <Path d="M76 26 a34 34 0 0 1 0 48" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" />
        </>
      )}
    </Glyph>
  );
}

export function PlusGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Line x1={50} y1={22} x2={50} y2={78} stroke={color} strokeWidth={10} strokeLinecap="round" />
      <Line x1={22} y1={50} x2={78} y2={50} stroke={color} strokeWidth={10} strokeLinecap="round" />
    </Glyph>
  );
}
