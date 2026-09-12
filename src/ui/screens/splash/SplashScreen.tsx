import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Rect, RadialGradient, Stop } from 'react-native-svg';

import { Amber, Ink, Motion, OnInk, OnInkFaint, TowerType } from '@/theme';
import { withAlpha } from '@/ui/color';
import { ArtMontage } from '@/ui/components/ArtMontage';

/** Six spokes: enough to read as a reel, few enough not to smear when turning. */
const SPOKES = 6;

/** One revolution. Slow enough not to be mistaken for a loading spinner. */
const REEL_PERIOD_MS = 7_000;

/** One cell of film travel. */
const STRIP_PERIOD_MS = 2_400;

/** The warmth at the top of the field — a lit screen in a dark room. */
const SCREEN_GLOW = '#16110A';

const REEL_SIZE = 168;
const STRIP_HEIGHT = 30;

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedSvg = Animated.createAnimatedComponent(Svg);

/**
 * What the app shows while it works out where to open.
 *
 * Not decoration: `restoreSession()` reads the stored token and then asks the
 * server to confirm it, and over a tunnel that round trip has been measured at
 * more than a second. So there is a real wait to cover, and what used to fill it
 * was an empty dark rectangle.
 *
 * A reel and a strip of film, lit as if by a projector. The house's own films are
 * the subject, so the mark says *cinema* rather than *network*: the first version
 * drew abstract broadcast arcs, which described the server rather than the reason
 * anyone opens the app.
 *
 * Everything loops, because the wait has no known length and an animation that
 * finishes over an unfinished job reads as a hang.
 *
 * Ported from ui/screens/splash/SplashScreen.kt.
 */
export function SplashScreen({ slow = false, art = [] }: { slow?: boolean; art?: string[] }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const film = useRef(new Animated.Value(0)).current;
  const lamp = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: Motion.Slow + 260,
      easing: Motion.Enter,
      useNativeDriver: true,
    }).start();

    // One slow revolution. A reel that spins quickly looks like a buffering
    // spinner, which is the one thing this must not be mistaken for.
    const reel = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: REEL_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    // The strip runs beneath, so the two motions read as one mechanism rather
    // than as two things that happen to be moving.
    const strip = Animated.loop(
      Animated.timing(film, {
        toValue: 1,
        duration: STRIP_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    // The lamp, never quite steady — a projector bulb breathes, and a perfectly
    // even glow reads as a gradient rather than as light.
    const bulb = Animated.loop(
      Animated.sequence([
        Animated.timing(lamp, {
          toValue: 0.85,
          duration: Motion.Ambient,
          easing: Motion.Breathe,
          useNativeDriver: true,
        }),
        Animated.timing(lamp, {
          toValue: 0.45,
          duration: Motion.Ambient,
          easing: Motion.Breathe,
          useNativeDriver: true,
        }),
      ]),
    );

    reel.start();
    strip.start();
    bulb.start();
    return () => {
      reel.stop();
      strip.stop();
      bulb.stop();
    };
  }, [entrance, spin, film, lamp]);

  const reelAlpha = entrance.interpolate({ inputRange: [0, 0.6], outputRange: [0, 1], extrapolate: 'clamp' });
  // Behind the reel, so the mark reads first and the name confirms it.
  const wordAlpha = entrance.interpolate({ inputRange: [0.3, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const wordRise = entrance.interpolate({ inputRange: [0.3, 1], outputRange: [16, 0], extrapolate: 'clamp' });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.root}>
      {/*
       * Warm at the top, cold below: the room around a lit screen. A flat amber
       * ring on flat Ink was the thing that read as cheap.
       */}
      <LinearGradient colors={[SCREEN_GLOW, Ink, Ink]} style={StyleSheet.absoluteFill} />

      {/*
       * Behind everything, and behind a scrim: these are the household's own
       * films, but the mark and the wordmark have to stay legible over whatever
       * happens to be in them.
       */}
      {art.length > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: reelAlpha }]}>
          <ArtMontage art={art} fallbackSeed="splash" style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}

      <View style={styles.centre}>
        <Animated.View style={{ opacity: reelAlpha }}>
          <Lamp lamp={lamp} />
          <Animated.View style={[styles.reel, { transform: [{ rotate }] }]}>
            <Reel />
          </Animated.View>
        </Animated.View>

        {/*
         * The letters start spread and close up — a wordmark that settles reads
         * as deliberate where one that only fades in reads as a loading state.
         *
         * Animated `letterSpacing` is not native-driver safe, so the settle is
         * carried by the rise and fade instead; the final tracking is the one
         * the mark is designed at.
         */}
        <Animated.Text
          style={[
            styles.wordmark,
            { opacity: wordAlpha, transform: [{ translateY: wordRise }] },
          ]}
        >
          TOWER
        </Animated.Text>

        <Animated.View style={{ opacity: Animated.multiply(wordAlpha, 0.9) }}>
          <FilmStrip film={film} />
        </Animated.View>

        {/*
         * Only once the wait stops being ordinary. Saying "connecting" for the
         * 300ms of a warm start would be noise; saying nothing for fifteen
         * seconds is worse. The row keeps its height either way, so the mark
         * does not shift when the line appears.
         */}
        <View style={styles.slowRow}>
          <Text style={[TowerType.bodyNote, { color: OnInkFaint, textAlign: 'center' }]}>
            {slow ? 'Still looking for your server…' : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** The bulb behind the reel: a warm pool that falls off to nothing. */
function Lamp({ lamp }: { lamp: Animated.Value }) {
  return (
    <Animated.View style={[styles.lamp, { opacity: lamp }]} pointerEvents="none">
      <Svg width={REEL_SIZE * 1.9} height={REEL_SIZE * 1.9} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="lamp" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={Amber} stopOpacity={0.26} />
            <Stop offset="45%" stopColor={Amber} stopOpacity={0.07} />
            <Stop offset="100%" stopColor={Amber} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={50} fill="url(#lamp)" />
      </Svg>
    </Animated.View>
  );
}

/**
 * A film reel: rim, hub, and the spokes between them.
 *
 * Drawn rather than shipped as an asset so it scales to any density and takes
 * the theme's amber directly — and so the gaps sit exactly between the spokes,
 * which is what makes it read as a reel rather than as a wheel.
 */
function Reel() {
  const centre = 50;
  const outer = 50 * 0.86;
  const hub = outer * 0.2;
  const stroke = outer * 0.085;

  return (
    <Svg width={REEL_SIZE} height={REEL_SIZE} viewBox="0 0 100 100">
      <Circle cx={centre} cy={centre} r={outer} stroke={Amber} strokeWidth={stroke} fill="none" />
      {/*
       * A second, fainter rim just inside: a reel has a lip, and the pair of
       * lines is what stops the circle looking like a progress ring.
       */}
      <Circle
        cx={centre}
        cy={centre}
        r={outer * 0.8}
        stroke={withAlpha(Amber, 0.35)}
        strokeWidth={stroke * 0.4}
        fill="none"
      />

      {Array.from({ length: SPOKES }, (_, index) => {
        const angle = ((index * 360) / SPOKES) * (Math.PI / 180);
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        return (
          <G key={index}>
            <Line
              x1={centre + dx * hub * 1.1}
              y1={centre + dy * hub * 1.1}
              x2={centre + dx * outer * 0.74}
              y2={centre + dy * outer * 0.74}
              stroke={withAlpha(Amber, 0.85)}
              strokeWidth={stroke * 0.55}
            />
            {/*
             * The cut-out each pair of spokes sits around — what you actually
             * see on a reel turning in front of a lamp.
             */}
            <Circle
              cx={centre + dx * outer * 0.47}
              cy={centre + dy * outer * 0.47}
              r={outer * 0.115}
              fill={Ink}
            />
          </G>
        );
      })}

      <Circle cx={centre} cy={centre} r={hub} fill={Amber} />
    </Svg>
  );
}

/**
 * A strip of frames running under the wordmark.
 *
 * The travel is exactly one cell, so the loop is seamless: at the end the strip
 * has moved one cell and the next pass is indistinguishable from the first. Both
 * ends fade out, so it reads as film passing through rather than as a row of
 * boxes that starts and stops.
 */
function FilmStrip({ film }: { film: Animated.Value }) {
  const cell = STRIP_HEIGHT * 1.35;
  const frameHeight = STRIP_HEIGHT * 0.46;
  const top = (STRIP_HEIGHT - frameHeight) / 2;
  const hole = STRIP_HEIGHT * 0.11;

  // One extra cell either side so nothing pops in at the edges.
  const count = Math.ceil(420 / cell) + 2;
  const shift = film.interpolate({ inputRange: [0, 1], outputRange: [0, cell] });

  return (
    <View style={styles.strip}>
      <Animated.View style={{ transform: [{ translateX: shift }] }}>
        <Svg width={count * cell} height={STRIP_HEIGHT}>
          {Array.from({ length: count }, (_, i) => {
            const x = (i - 1) * cell;
            return (
              <G key={i}>
                <Rect
                  x={x}
                  y={top}
                  width={cell * 0.74}
                  height={frameHeight}
                  fill={withAlpha(Amber, 0.3)}
                />
                {/*
                 * Perforations above and below: the detail that makes it film
                 * rather than a dashed line. Brighter than the frames, as they
                 * are on real stock, where the holes are clear and the frame is
                 * exposed.
                 */}
                <Rect
                  x={x + cell * 0.26}
                  y={top - hole * 1.9}
                  width={hole}
                  height={hole}
                  fill={withAlpha(Amber, 0.55)}
                />
                <Rect
                  x={x + cell * 0.26}
                  y={top + frameHeight + hole * 0.9}
                  width={hole}
                  height={hole}
                  fill={withAlpha(Amber, 0.55)}
                />
              </G>
            );
          })}
        </Svg>
      </Animated.View>

      {/* Fade both ends into the background so the strip has no visible start. */}
      <LinearGradient
        colors={[Ink, 'transparent', 'transparent', Ink]}
        locations={[0, 0.18, 0.82, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Ink,
  },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reel: {
    width: REEL_SIZE,
    height: REEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lamp: {
    position: 'absolute',
    top: REEL_SIZE / 2 - REEL_SIZE * 0.95,
    left: REEL_SIZE / 2 - REEL_SIZE * 0.95,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    ...TowerType.titleDisplay,
    color: OnInk,
    letterSpacing: 7,
    textAlign: 'center',
    marginTop: 26,
  },
  strip: {
    width: '100%',
    height: STRIP_HEIGHT,
    marginTop: 18,
    overflow: 'hidden',
  },
  slowRow: {
    height: 20,
    marginTop: 20,
    justifyContent: 'center',
  },
});
