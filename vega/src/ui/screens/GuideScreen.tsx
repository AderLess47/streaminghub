import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Channel, EpgProgramme, Reminder } from "../../model/types";
import { formatTime, nextProgramme, programmeAt } from "../../data/epg";
import { reminderId } from "../../reminder/reminders";
import { Button, EmptyState, Notice, SectionTitle } from "../components";
import { colors, radius, space, text as sizes } from "../theme";

type Props = {
  channels: Channel[];
  programmes: EpgProgramme[];
  reminders: Reminder[];
  nowMs: number;
  updatedAt: number | null;
  onOpen: (channel: Channel) => void;
  onToggleReminder: (programme: EpgProgramme) => void;
};

export function GuideScreen({
  channels,
  programmes,
  reminders,
  nowMs,
  updatedAt,
  onOpen,
  onToggleReminder,
}: Props) {
  const rows = useMemo(() => {
    const withEpg = channels
      .map((channel) => {
        const key = channel.tvgId ?? "";
        const current = key ? programmeAt(programmes, key, nowMs) : undefined;
        const upcoming = key ? nextProgramme(programmes, key, nowMs) : undefined;
        return { channel, current, upcoming };
      })
      .filter((row) => row.current || row.upcoming);
    return withEpg.slice(0, 60);
  }, [channels, programmes, nowMs]);

  if (programmes.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="Keine Programmdaten"
          hint="Lade in den Einstellungen eine XMLTV-Datei. Ohne Programmdaten kann die App weder „Jetzt“ noch Erinnerungen anzeigen."
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          Programmführer
        </Text>
        <Text style={styles.description}>
          {rows.length} Sender mit Programmdaten. Erinnerungen gelten nur, solange die App läuft – Vega OS
          kennt für Apps noch keine geplanten Systembenachrichtigungen.
        </Text>
        {updatedAt ? (
          <Text style={styles.count}>Zuletzt geladen: {new Date(updatedAt).toLocaleString("de-DE")}</Text>
        ) : null}
      </View>

      {reminders.length > 0 ? (
        <SectionTitle hint={`${reminders.length} vorgemerkt`}>Erinnerungen</SectionTitle>
      ) : null}
      {reminders.slice(0, 5).map((reminder) => (
        <Notice key={reminder.id} tone="info" title={`${formatTime(reminder.startMs)} · ${reminder.channelName}`}>
          {reminder.title}
        </Notice>
      ))}

      <SectionTitle hint="Jetzt und danach">Sender</SectionTitle>
      {rows.map(({ channel, current, upcoming }) => {
        const reminderTarget = current ?? upcoming;
        const scheduled = reminderTarget ? reminders.some((item) => item.id === reminderId(reminderTarget)) : false;
        return (
          <View key={channel.url} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.channel} numberOfLines={1}>
                {channel.name}
              </Text>
              <Text style={styles.programme} numberOfLines={1}>
                {current
                  ? `Jetzt: ${current.title} (${formatTime(current.startMs)}–${formatTime(current.stopMs)})`
                  : "Jetzt: keine Angabe"}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {upcoming ? `Danach: ${upcoming.title} ab ${formatTime(upcoming.startMs)}` : "Danach: keine Angabe"}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <Button label="Ansehen" onPress={() => onOpen(channel)} variant="ghost" />
              {reminderTarget && reminderTarget.startMs > nowMs ? (
                <Button
                  label={scheduled ? "Erinnerung löschen" : "Erinnern"}
                  onPress={() => onToggleReminder(reminderTarget)}
                  variant={scheduled ? "danger" : "primary"}
                  accessibilityHint={
                    scheduled
                      ? "Entfernt die Erinnerung für diese Sendung"
                      : "Merkt die Sendung vor; ein Hinweis erscheint, solange die App läuft"
                  }
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.sm, paddingBottom: space.xl * 2 },
  emptyWrap: { padding: space.xl },
  header: { gap: space.xs, marginBottom: space.md },
  heading: { color: colors.text, fontSize: sizes.title, fontWeight: "700" },
  description: { color: colors.muted, fontSize: sizes.body, lineHeight: 24, maxWidth: 900 },
  count: { color: colors.muted, fontSize: sizes.small },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.lg,
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowText: { flex: 1, gap: 2 },
  channel: { color: colors.text, fontSize: sizes.body, fontWeight: "700" },
  programme: { color: colors.text, fontSize: sizes.small },
  muted: { color: colors.muted, fontSize: sizes.tiny },
  rowActions: { flexDirection: "row", gap: space.sm, flexShrink: 0 },
});
