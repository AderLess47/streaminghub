import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Channel, MediaKind } from "../../model/types";
import type { ProgressMap } from "../../data/storage";
import { groupsOf } from "../../data/m3u";
import { EmptyState, SectionTitle, Tile } from "../components";
import { colors, space, text as sizes } from "../theme";
import type { LayoutProfile } from "../layout";

type Props = {
  heading: string;
  description?: string;
  channels: Channel[];
  kind?: MediaKind;
  progress: ProgressMap;
  favorites: Set<string>;
  layout: LayoutProfile;
  onOpen: (channel: Channel) => void;
  onToggleFavorite: (url: string) => void;
  emptyHint?: string;
};

export function BrowseScreen({
  heading,
  description,
  channels,
  kind,
  progress,
  favorites,
  layout,
  onOpen,
  onToggleFavorite,
  emptyHint,
}: Props) {
  const [group, setGroup] = useState<string | null>(null);

  const inKind = useMemo(
    () => (kind ? channels.filter((channel) => channel.kind === kind) : channels),
    [channels, kind],
  );
  const groups = useMemo(() => groupsOf(inKind), [inKind]);
  const visible = useMemo(
    () => (group ? inKind.filter((channel) => channel.group === group) : inKind),
    [inKind, group],
  );

  const continueWatching = useMemo(() => {
    return Object.entries(progress)
      .filter(([url, position]) => position > 5_000 && channels.some((channel) => channel.url === url))
      .sort((a, b) => b[1] - a[1])
      .slice(0, layout.rowLimit)
      .map(([url]) => channels.find((channel) => channel.url === url))
      .filter((channel): channel is Channel => Boolean(channel));
  }, [progress, channels, layout.rowLimit]);

  const favoriteChannels = useMemo(
    () => channels.filter((channel) => favorites.has(channel.url)).slice(0, layout.rowLimit),
    [channels, favorites, layout.rowLimit],
  );

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          {heading}
        </Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        <Text style={styles.count}>
          {inKind.length} Einträge
          {group ? ` in „${group}“` : groups.length > 0 ? ` in ${groups.length} Kategorien` : ""}
        </Text>
      </View>

      {!kind && continueWatching.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle hint="Fortsetzen, wo du aufgehört hast">Weiter schauen</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {continueWatching.map((channel) => (
              <Tile
                key={`continue-${channel.url}`}
                title={channel.name}
                subtitle={channel.group}
                meta={`${Math.round((progress[channel.url] ?? 0) / 60_000)} Min. gesehen`}
                width={layout.cardWidth}
                onPress={() => onOpen(channel)}
                accessibilityHint="Setzt die Wiedergabe an der letzten Position fort"
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {favoriteChannels.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle hint="Mit der Favoritentaste gepflegt">Favoriten</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {favoriteChannels.map((channel) => (
              <Tile
                key={`fav-${channel.url}`}
                title={channel.name}
                subtitle={channel.group}
                width={layout.cardWidth}
                onPress={() => onOpen(channel)}
                accessibilityHint="Öffnet die Wiedergabe"
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {groups.length > 1 ? (
        <View style={styles.section}>
          <SectionTitle hint="Filter für die Liste darunter">Kategorien</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            <Tile
              title="Alle"
              width={layout.cardWidth / 2}
              selected={group === null}
              onPress={() => setGroup(null)}
            />
            {groups.map((name) => (
              <Tile
                key={name}
                title={name}
                width={layout.cardWidth / 1.6}
                selected={group === name}
                onPress={() => setGroup(name)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle hint={kind === "live" ? "Live-Sender" : undefined}>
          {group ?? (kind === "live" ? "Live-TV" : kind === "movie" ? "Filme" : kind === "series" ? "Serien" : "Alle Einträge")}
        </SectionTitle>
        {visible.length === 0 ? (
          <EmptyState
            title="Nichts vorhanden"
            hint={emptyHint ?? "Importiere eine M3U-Playlist oder starte den Demo-Modus in den Einstellungen."}
          />
        ) : (
          <View style={styles.grid}>
            {visible.slice(0, layout.rowLimit * 12).map((channel) => (
              <View key={channel.url} style={styles.tileWrap}>
                <Tile
                  title={channel.name}
                  subtitle={channel.group}
                  meta={
                    favorites.has(channel.url)
                      ? "★ Favorit"
                      : progress[channel.url]
                        ? `Fortsetzen ab ${Math.round((progress[channel.url] ?? 0) / 60_000)} Min.`
                        : undefined
                  }
                  width={layout.cardWidth}
                  onPress={() => onOpen(channel)}
                  accessibilityHint="Enter startet die Wiedergabe, die Favoritentaste merkt den Eintrag vor"
                />
                <Text
                  style={styles.favorite}
                  accessibilityRole="button"
                  accessibilityLabel={
                    favorites.has(channel.url) ? `${channel.name} aus Favoriten entfernen` : `${channel.name} zu Favoriten`
                  }
                  onPress={() => onToggleFavorite(channel.url)}
                >
                  {favorites.has(channel.url) ? "★ Favorit entfernen" : "☆ Favorit"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xl * 2 },
  header: { gap: space.xs },
  heading: { color: colors.text, fontSize: sizes.title, fontWeight: "700" },
  description: { color: colors.muted, fontSize: sizes.body, maxWidth: 900, lineHeight: 24 },
  count: { color: colors.muted, fontSize: sizes.small },
  section: { gap: space.sm },
  strip: { gap: space.md, paddingVertical: space.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tileWrap: { gap: space.xs },
  favorite: { color: colors.muted, fontSize: sizes.tiny, paddingHorizontal: space.xs },
});
