import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  Amber,
  AmberBorderSoft,
  AmberInk,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  Surface1,
  Surface2,
  TowerType,
} from '@/theme';
import { Answer, Lookup, argumentLine } from '@/domain/model/assistant';
import { useRepository } from '@/ui/hooks';
import { ChevronGlyph } from '@/ui/components/Glyphs';
import { DataLabel, DataMeta, HairlineDivider } from '@/ui/components/Primitives';
import { Skeleton } from '@/ui/components/Rails';

/**
 * Four openers, phrased as the things the tools can actually answer.
 *
 * An empty box invites the questions this cannot do — it has no plot summaries
 * and no opinions, only the catalogue, the play counts, the taste model and the
 * collections. Naming what it is good at is cheaper than apologising four times.
 */
const SUGGESTIONS = [
  'What can I finish tonight?',
  'What have we watched more than twice?',
  'Show me what nobody has seen',
  'Something Tamil I have not started',
];

/** One question, and the answer it got. */
interface Exchange {
  question: string;
  answer: Answer;
}

/**
 * Ask the library a question in your own words.
 *
 * The lookups under each answer are the design, not a debug panel. Everything
 * this can do already existed as a filter on some other screen — the assistant's
 * only new power is choosing which to use — so showing the calls is what makes
 * an answer checkable against the screens that would have produced it by hand.
 * An answer with nothing underneath it came from nowhere.
 *
 * Newest exchange at the top, and the box at the bottom under the thumb. This is
 * not a chat: the server keeps no thread, each question is answered alone, and
 * stacking them upward would imply a conversation that does not exist.
 *
 * Nothing here retries. The server answers 200 with prose for every failure it
 * knows about — switched off, unreachable, gave up — so there is no error to
 * distinguish from an answer, only an `answered` flag deciding whether offering
 * to ask again would be honest.
 *
 * Ported from ui/screens/assistant/AssistantScreen.kt and its ViewModel.
 */
export function AssistantScreen({ onBack }: { onBack: () => void }) {
  const repository = useRepository();

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  /**
   * Newest first, and only for as long as the screen lives. A question about a
   * library is usually a single exchange, and persisting a thread would mean
   * deciding where it lives and when it expires for a feature the server itself
   * keeps stateless.
   */
  const [history, setHistory] = useState<Exchange[]>([]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const canAsk = question.trim() !== '' && !asking;

  const ask = useCallback(() => {
    const asked = question.trim();
    if (asked === '' || asking) return;

    // Cleared immediately: the question moves into the thread above, so leaving
    // it in the box would show it twice and invite asking it twice.
    setQuestion('');
    setAsking(true);
    void (async () => {
      const answer = await repository.ask(asked);
      if (!alive.current) return;
      setAsking(false);
      setHistory((current) => [{ question: asked, answer }, ...current]);
    })();
  }, [question, asking, repository]);

  const idle = history.length === 0 && !asking;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Ink }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronGlyph rotation={180} color={OnInk} size={18} />
        </Pressable>
        <View style={{ marginLeft: 4 }}>
          <Text style={[TowerType.titleScreen, { color: OnInk }]}>Ask Tower</Text>
          <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 2 }]}>
            About your own library, not the internet
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {idle ? (
          <View style={styles.suggestions}>
            <DataLabel text="TRY ASKING" technical={false} style={{ marginBottom: 4 }} />
            {SUGGESTIONS.map((suggestion) => (
              <Pressable
                key={suggestion}
                accessibilityRole="button"
                accessibilityLabel={suggestion}
                onPress={() => setQuestion(suggestion)}
                style={({ pressed }) => [styles.suggestion, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[TowerType.bodyProse, { color: OnInkMuted }]}>{suggestion}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(exchange, index) => `${index}-${exchange.question}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 20 }}
            ListHeaderComponent={asking ? <Thinking /> : null}
            renderItem={({ item }) => (
              <ExchangeBlock exchange={item} onAskAgain={setQuestion} />
            )}
          />
        )}
      </View>

      <View style={styles.askField}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask about your library"
          placeholderTextColor={OnInkFaint}
          selectionColor={Amber}
          cursorColor={Amber}
          multiline
          returnKeyType="send"
          onSubmitEditing={ask}
          style={styles.askInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask"
          accessibilityState={{ disabled: !canAsk }}
          disabled={!canAsk}
          onPress={ask}
          // Dimmed rather than hidden while a question is in flight: the button
          // moving or vanishing under a thumb about to press it is worse than
          // one that does nothing for a second.
          style={[styles.askButton, { backgroundColor: canAsk ? Amber : Surface1 }]}
        >
          <Text style={[TowerType.buttonLabel, { color: canAsk ? AmberInk : OnInkFaint }]}>
            Ask
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Thinking() {
  return (
    <View style={{ paddingHorizontal: Space.Screen, paddingVertical: 12 }}>
      <DataLabel text="LOOKING" technical={false} />
      <Skeleton cornerRadius={3} style={{ width: '100%', height: 12, marginTop: 10 }} />
      <Skeleton cornerRadius={3} style={{ width: '70%', height: 12, marginTop: 8 }} />
    </View>
  );
}

function ExchangeBlock({
  exchange,
  onAskAgain,
}: {
  exchange: Exchange;
  onAskAgain: (question: string) => void;
}) {
  return (
    <View>
      <View style={{ paddingHorizontal: Space.Screen, paddingVertical: 14 }}>
        {/* The question, quiet and above — it is context for the answer rather
            than something to read again. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask this again"
          onPress={() => onAskAgain(exchange.question)}
        >
          <Text style={[TowerType.bodyNote, { color: OnInkFaint }]} numberOfLines={2}>
            {exchange.question}
          </Text>
        </Pressable>

        <Text style={[TowerType.bodyProse, { color: OnInk, marginTop: 8 }]}>
          {exchange.answer.text}
        </Text>

        {exchange.answer.lookups.length > 0 ? (
          <Lookups lookups={exchange.answer.lookups} />
        ) : exchange.answer.answered ? (
          // Answered, but it consulted nothing. Worth saying: every real answer
          // here comes from a lookup, so one without is the model talking rather
          // than the library.
          <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 12 }]}>
            It looked nothing up for this.
          </Text>
        ) : null}
      </View>
      <HairlineDivider style={{ marginHorizontal: Space.Screen }} />
    </View>
  );
}

/** What it consulted, in the server's own tool names, with the filters it chose. */
function Lookups({ lookups }: { lookups: Lookup[] }) {
  return (
    <View style={{ marginTop: 14 }}>
      <DataLabel text="IT LOOKED AT" technical={false} />
      {lookups.map((lookup, index) => {
        const args = argumentLine(lookup);
        return (
          <View key={`${lookup.tool}-${index}`} style={styles.lookup}>
            <View style={{ flex: 1 }}>
              <DataMeta
                text={lookup.tool}
                // A failed lookup is the first thing to check when an answer
                // looks wrong, so it is the one thing coloured.
                color={lookup.failed ? Amber : OnInkMuted}
                technical={false}
              />
              {args !== '' && (
                <DataMeta
                  text={args}
                  color={OnInkFaint}
                  maxLines={3}
                  technical={false}
                  style={{ marginTop: 4 }}
                />
              )}
            </View>
            {lookup.failed && <DataMeta text="FAILED" color={Amber} technical={false} />}
          </View>
        );
      })}
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
  suggestions: {
    paddingHorizontal: Space.Screen,
    gap: 10,
  },
  suggestion: {
    width: '100%',
    borderRadius: Radius.Default,
    backgroundColor: Surface1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  lookup: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    borderRadius: Radius.Thumb,
    backgroundColor: Surface1,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  askField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Space.Screen,
    marginVertical: 12,
    borderRadius: Radius.Default,
    backgroundColor: Surface2,
    borderWidth: 1,
    borderColor: AmberBorderSoft,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  askInput: {
    flex: 1,
    paddingVertical: 10,
    maxHeight: 120,
    color: OnInk,
    fontFamily: TowerType.bodyProse.fontFamily,
    fontSize: TowerType.bodyProse.fontSize,
  },
  askButton: {
    borderRadius: Radius.Pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
});
