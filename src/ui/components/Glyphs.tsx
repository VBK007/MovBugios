import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

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

// --- The four bottom-bar marks ---------------------------------------------
//
// Outlines, not fills, and the same 0.09–0.10 stroke as the rest of the set: at
// 20dp a filled shape reads as a blob, and these sit under a 9.5sp label that is
// already carrying the meaning. Selection is the amber, not a second weight —
// swapping outline for fill on selection would make the row jump.

/** A roof over a box. The shelf you land on. */
export function HomeGlyph({ color = OnInk, size = 20 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Path
        d="M14 46 L50 16 L86 46"
        stroke={color}
        strokeWidth={9.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Walls drawn from under the eaves down, so the roof line stays the
          widest thing and the house does not read as an envelope. */}
      <Path
        d="M24 44 L24 82 L76 82 L76 44"
        stroke={color}
        strokeWidth={9.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Glyph>
  );
}

/**
 * Three spines on a shelf, the last one leaning.
 *
 * A grid of squares is the usual choice and says "gallery" — this library is
 * films filed like books, and the lean is what stops three bars reading as a
 * hamburger menu turned on its side.
 */
export function LibraryGlyph({ color = OnInk, size = 20 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Line x1={22} y1={18} x2={22} y2={82} stroke={color} strokeWidth={10.5} strokeLinecap="round" />
      <Line x1={45} y1={18} x2={45} y2={82} stroke={color} strokeWidth={10.5} strokeLinecap="round" />
      {/* The leaning spine: top edge pushed right, foot left. */}
      <Line x1={78} y1={18} x2={66} y2={82} stroke={color} strokeWidth={10.5} strokeLinecap="round" />
    </Glyph>
  );
}

/** The plus, turned. Removes the thing it sits inside rather than the screen. */
export function CloseGlyph({ color = OnInk, size = 12 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Line x1={24} y1={24} x2={76} y2={76} stroke={color} strokeWidth={12} strokeLinecap="round" />
      <Line x1={76} y1={24} x2={24} y2={76} stroke={color} strokeWidth={12} strokeLinecap="round" />
    </Glyph>
  );
}

/**
 * A heart, hollow until it means something.
 *
 * Filled rather than merely tinted when liked: at a glance on a moving picture,
 * colour alone is not reliably readable, and the fill is what makes a liked clip
 * obvious without looking twice.
 */
export function HeartGlyph({
  color = OnInk,
  size = 20,
  filled = false,
}: {
  color?: string;
  size?: number;
  filled?: boolean;
}) {
  const d =
    'M50 86 C14 60 5 40 18 26 C31 12 44 20 50 33 C56 20 69 12 82 26 C95 40 86 60 50 86 Z';
  return (
    <Glyph size={size}>
      <Path
        d={d}
        fill={filled ? color : 'none'}
        stroke={filled ? 'none' : color}
        strokeWidth={9}
        strokeLinejoin="round"
      />
    </Glyph>
  );
}

/** A tall frame with a play mark in it. A film, turned on its side. */
export function ShortsGlyph({ color = OnInk, size = 20 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Rect
        x={26}
        y={13}
        width={48}
        height={74}
        rx={9}
        ry={9}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinejoin="round"
      />
      {/* Filled, unlike the frame: at 20dp an outlined triangle inside an
          outlined box is two thin shapes fighting for the same few pixels. */}
      <Path d="M43 36 L63 50 L43 64 Z" fill={color} />
    </Glyph>
  );
}

/**
 * Three lines and a play mark: what is queued behind this one.
 *
 * The lines shorten going down, which is the difference between reading as a
 * list and reading as a hamburger menu — three equal bars is a navigation drawer
 * everywhere else on a phone.
 */
export function QueueGlyph({ color = OnInk, size = 18 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      {([
        [22, 80],
        [45, 80],
        [68, 52],
      ] as const).map(([y, end]) => (
        <Line
          key={y}
          x1={12}
          y1={y}
          x2={end}
          y2={y}
          stroke={color}
          strokeWidth={9.5}
          strokeLinecap="round"
        />
      ))}
      {/* The mark that says the list is a queue rather than a menu. */}
      <Path d="M62 56 L90 70 L62 84 Z" fill={color} />
    </Glyph>
  );
}

/**
 * Two crossing paths with arrowheads — the shuffle mark everything uses.
 *
 * Drawn rather than borrowed so it carries the same stroke and cap as the rest
 * of the set; an imported icon here would be the one shape in the app with
 * somebody else's line weight.
 */
export function ShuffleGlyph({ color = OnInk, size = 16 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      <Path
        d="M12 26 L34 26 L66 74 L88 74"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M12 74 L34 74 L66 26 L88 26"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M76 14 L92 26 L76 38 Z" fill={color} />
      <Path d="M76 62 L92 74 L76 86 Z" fill={color} />
    </Glyph>
  );
}

/**
 * An eye — who else is listening to this.
 *
 * Two arcs and a pupil rather than a lens or a person: a count of people beside
 * a person glyph reads as a member list, and this is a live answer to "is anyone
 * still here", which is a different question from "who was invited".
 */
export function EyeGlyph({ color = OnInk, size = 18 }: { color?: string; size?: number }) {
  return (
    <Glyph size={size}>
      {/* The outline, as two arcs meeting at the corners. */}
      <Path
        d="M6 50 Q50 10 94 50 Q50 90 6 50 Z"
        fill="none"
        stroke={color}
        strokeWidth={8.5}
        strokeLinejoin="round"
      />
      <Circle cx={50} cy={50} r={15} fill={color} />
    </Glyph>
  );
}
