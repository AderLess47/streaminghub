import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Channel } from "../../model/types";
import { EmptyState, SectionTitle, Tile } from "../components";
import { colors, radius, space, text as sizes } from "../theme";
import type { LayoutProfile } from "../layout";

type Props = {
  channels: Channel[];
  layout: LayoutProfile;
  onOpen: (channel: Channel) => void;
};

export function SearchScreen({ channels, layout, onOpen }: Props) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return channels
      .filter(
        (channel) =>
          channel.name.toLowerCase().includes(needle) || channel.group.toLowerCase().includes(needle),
      )
      .slice(0, 60);
  }, [channels, query]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.heading} accessibilityRole="header">
        Suche
      </Text>
      <Text style={styles.description}>
        Sucht in den Einträgen deiner eigenen Playlist – nach Name oder Kategorie. Es wird nichts an
        StreamingHub gesendet.
      </Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Mindestens zwei Zeichen …"
        placeholderTextColor={colors.muted}
        style={styles.input}
        accessibilityLabel="Suchbegriff"
        autoCorrect={false}
        returnKeyType="search"
      />

      <SectionTitle hint={query.trim().length < 2 ? "Noch zu kurz" : `${results.length} Treffer`}>
        Ergebnisse
      </SectionTitle>

      {query.trim().length < 2 ? (
        <EmptyState title="Begriff eingeben" hint="Zwei Zeichen genügen, um die Liste zu filtern." />
      ) : results.length === 0 ? (
        <EmptyState title="Kein Treffer" hint="Andere Schreibweise versuchen oder Kategorie durchsuchen." />
      ) : (
        <View style={styles.grid}>
          {results.map((channel) => (
            <Tile
              key={channel.url}
              title={channel.name}
              subtitle={channel.group}
              width={layout.cardWidth}
              onPress={() => onOpen(channel)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md, paddingBottom: space.xl * 2 },
  heading: { color: colors.text, fontSize: sizes.title, fontWeight: "700" },
  description: { color: colors.muted, fontSize: sizes.body, lineHeight: 24, maxWidth: 900 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    color: colors.text,
    fontSize: sizes.body,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    maxWidth: 720,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
