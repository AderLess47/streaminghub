import { useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, focusRing, radius, space, text as sizes } from "./theme";

/**
 * Bausteine der Oberfläche.
 *
 * Auf dem Fernseher zählt der Fokus: Jedes bedienbare Element bekommt einen
 * deutlichen Rahmen, und der Rahmen wird nicht nur über Farbe, sondern auch über
 * die Stärke sichtbar (WCAG 1.4.1, 2.4.7).
 */

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText} accessibilityRole="header">
        {children}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "ok" | "warn" }) {
  return (
    <View style={[styles.badge, tone === "ok" && styles.badgeOk, tone === "warn" && styles.badgeWarn]}>
      <Text style={[styles.badgeText, tone === "ok" && styles.badgeTextOk, tone === "warn" && styles.badgeTextWarn]}>
        {label}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  hasTVPreferredFocus,
  disabled,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled === true }}
      style={[
        styles.button,
        variant === "ghost" && styles.buttonGhost,
        variant === "danger" && styles.buttonDanger,
        focused && styles.focused,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, variant === "ghost" && styles.buttonGhostText]}>{label}</Text>
    </Pressable>
  );
}

export function Tile({
  title,
  subtitle,
  meta,
  onPress,
  width,
  selected,
  accessibilityHint,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress: () => void;
  width: number;
  selected?: boolean;
  accessibilityHint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      style={[
        styles.tile,
        { width },
        selected && styles.tileSelected,
        focused && styles.focused,
      ]}
    >
      <Text style={styles.tileTitle} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.tileSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
      {meta ? <Text style={styles.tileMeta}>{meta}</Text> : null}
    </Pressable>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: "info" | "success" | "warning" | "error";
  title?: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.notice, noticeTone(tone)]} accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"}>
      {title ? <Text style={styles.noticeTitle}>{title}</Text> : null}
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

function noticeTone(tone: "info" | "success" | "warning" | "error") {
  switch (tone) {
    case "success":
      return { borderColor: colors.success };
    case "warning":
      return { borderColor: colors.warning };
    case "error":
      return { borderColor: colors.danger };
    default:
      return { borderColor: colors.border };
  }
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.md,
    marginBottom: space.sm,
  },
  sectionTitleText: { color: colors.text, fontSize: sizes.heading, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: sizes.small },
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: 2,
  },
  badgeOk: { borderColor: colors.success },
  badgeWarn: { borderColor: colors.warning },
  badgeText: { color: colors.muted, fontSize: sizes.tiny, fontWeight: "700" },
  badgeTextOk: { color: colors.success },
  badgeTextWarn: { color: colors.warning },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  buttonGhost: { backgroundColor: "transparent", borderColor: colors.border },
  buttonDanger: { backgroundColor: "transparent", borderColor: colors.danger },
  buttonText: { color: colors.accentText, fontSize: sizes.body, fontWeight: "700" },
  buttonGhostText: { color: colors.text },
  focused: { borderWidth: focusRing.borderWidth, borderColor: focusRing.borderColor },
  disabled: { opacity: 0.55 },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.border,
    padding: space.md,
    gap: space.xs,
    minHeight: 96,
    justifyContent: "center",
  },
  tileSelected: { borderColor: colors.accent },
  tileTitle: { color: colors.text, fontSize: sizes.body, fontWeight: "600" },
  tileSubtitle: { color: colors.muted, fontSize: sizes.small },
  tileMeta: { color: colors.muted, fontSize: sizes.tiny },
  row: { gap: space.sm, marginBottom: space.lg },
  rowLabel: { color: colors.muted, fontSize: sizes.small, fontWeight: "700", textTransform: "uppercase" },
  notice: {
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: colors.surfaceRaised,
    padding: space.md,
    gap: space.xs,
  },
  noticeTitle: { color: colors.text, fontSize: sizes.body, fontWeight: "700" },
  noticeText: { color: colors.muted, fontSize: sizes.small, lineHeight: 20 },
  empty: {
    padding: space.xl,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    gap: space.sm,
    alignItems: "center",
  },
  emptyTitle: { color: colors.text, fontSize: sizes.body, fontWeight: "600" },
});
