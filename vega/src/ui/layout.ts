import { Platform, useWindowDimensions } from "react-native";

/**
 * Ein Layout für Fernseher, Tablets und Rechner. Statt den Gerätenamen zu raten,
 * leitet die App ihre Maße aus dem Fenster ab – wie im Android-Client.
 */

export type DeviceClass = "tv" | "phone" | "tablet" | "desktop";

export type LayoutProfile = {
  deviceClass: DeviceClass;
  width: number;
  cardWidth: number;
  horizontalPadding: number;
  contentMaxWidth: number;
  rowLimit: number;
  isWide: boolean;
  isTelevision: boolean;
};

export function layoutFor(isTelevision: boolean, width: number): LayoutProfile {
  const safeWidth = Math.max(0, Math.round(width));
  const deviceClass: DeviceClass = isTelevision
    ? "tv"
    : safeWidth < 600
      ? "phone"
      : safeWidth < 1000
        ? "tablet"
        : "desktop";

  switch (deviceClass) {
    case "tv":
      return {
        deviceClass,
        width: safeWidth,
        cardWidth: 224,
        horizontalPadding: 40,
        contentMaxWidth: 1600,
        rowLimit: 12,
        isWide: true,
        isTelevision: true,
      };
    case "phone":
      return {
        deviceClass,
        width: safeWidth,
        cardWidth: 152,
        horizontalPadding: 16,
        contentMaxWidth: Number.POSITIVE_INFINITY,
        rowLimit: 6,
        isWide: false,
        isTelevision: false,
      };
    case "tablet":
      return {
        deviceClass,
        width: safeWidth,
        cardWidth: 190,
        horizontalPadding: 24,
        contentMaxWidth: 1000,
        rowLimit: 9,
        isWide: safeWidth >= 840,
        isTelevision: false,
      };
    default:
      return {
        deviceClass,
        width: safeWidth,
        cardWidth: 212,
        horizontalPadding: 32,
        contentMaxWidth: 1280,
        rowLimit: 12,
        isWide: true,
        isTelevision: false,
      };
  }
}

export function useLayoutProfile(): LayoutProfile {
  const { width } = useWindowDimensions();
  // Platform.isTV ist auf Vega-Geräten gesetzt; die Breite bleibt der zweite Faktor.
  return layoutFor(Platform.isTV === true, width);
}
