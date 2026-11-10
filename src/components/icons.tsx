import type { SVGProps } from "react";

export type IconName =
  | "play"
  | "download"
  | "check"
  | "arrow-right"
  | "arrow-left"
  | "chevron-down"
  | "menu"
  | "close"
  | "tv"
  | "phone"
  | "tablet"
  | "shield"
  | "devices"
  | "globe"
  | "sparkles"
  | "mail"
  | "lock"
  | "user"
  | "search"
  | "external"
  | "alert"
  | "info"
  | "trash"
  | "key"
  | "settings"
  | "card"
  | "wifi"
  | "logout"
  | "users"
  | "activity"
  | "file-text"
  | "layers"
  | "zap"
  | "refresh"
  | "list"
  | "grid"
  | "clock"
  | "server"
  | "copy"
  | "plus";

const PATHS: Record<IconName, string[]> = {
  play: ["M8 5.5v13l11-6.5-11-6.5Z"],
  download: ["M12 3v12", "M7 11l5 5 5-5", "M4 20h16"],
  check: ["M20 6 9 17l-5-5"],
  "arrow-right": ["M4 12h15", "m13 6 6 6-6 6"],
  "arrow-left": ["M20 12H5", "m11 18-6-6 6-6"],
  "chevron-down": ["m6 9 6 6 6-6"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  close: ["m6 6 12 12", "m18 6-12 12"],
  tv: ["M3 5h18v12H3z", "M8 21h8", "M12 17v4"],
  phone: ["M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z", "M11 19h2"],
  tablet: ["M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z", "M11 19h2"],
  shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z", "m9 12 2 2 4-4"],
  devices: ["M3 5h11v10H3z", "M7 19h4", "M17 9h4v10h-4z"],
  globe: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M3 12h18", "M12 3c3 3.5 3 14 0 18", "M12 3c-3 3.5-3 14 0 18"],
  sparkles: ["m12 3 1.8 4.7L19 9.5l-5.2 1.8L12 16l-1.8-4.7L5 9.5l5.2-1.8L12 3Z", "M18.5 15.5 19.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z"],
  mail: ["M3 6h18v12H3z", "m3 7 9 6 9-6"],
  lock: ["M6 11h12v9H6z", "M9 11V8a3 3 0 0 1 6 0v3"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21c0-4 3.6-6 8-6s8 2 8 6"],
  search: ["M11 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "m20 20-4-4"],
  external: ["M14 4h6v6", "M20 4 10 14", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  alert: ["M12 4 2.5 20h19L12 4Z", "M12 10v4", "M12 17.5v.5"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 11v6", "M12 8v.5"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 14h10l1-14"],
  key: ["M15 3a6 6 0 1 0-3.5 10.9L4 21v-4h4v-4h4l1.5-1.5", "M17 7h.01"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z"],
  card: ["M3 6h18v12H3z", "M3 10h18", "M7 15h3"],
  wifi: ["M2.5 9a15 15 0 0 1 19 0", "M6 12.5a10 10 0 0 1 12 0", "M9.5 16a5 5 0 0 1 5 0", "M12 19.5h.01"],
  logout: ["M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4", "M10 8l-4 4 4 4", "M6 12h9"],
  users: ["M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M2 21c0-4 3.2-6 7-6s7 2 7 6", "M17 4a4 4 0 0 1 0 7", "M18 15c2.5.5 4 2.4 4 6"],
  activity: ["M3 12h4l3-8 4 16 3-8h4"],
  "file-text": ["M6 3h8l4 4v14H6z", "M14 3v5h4", "M9 13h6", "M9 17h6"],
  layers: ["m12 3 9 5-9 5-9-5 9-5Z", "m3 13 9 5 9-5", "m3 17 9 5 9-5"],
  zap: ["M13 2 4 14h6l-1 8 9-12h-6l1-8Z"],
  refresh: ["M20 11A8 8 0 0 0 6 6L3 9", "M3 4v5h5", "M4 13a8 8 0 0 0 14 5l3-3", "M21 20v-5h-5"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  grid: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 7v5l3.5 2"],
  server: ["M4 4h16v6H4z", "M4 14h16v6H4z", "M8 7h.01", "M8 17h.01"],
  copy: ["M9 9h11v11H9z", "M15 5H5v10"],
  plus: ["M12 5v14", "M5 12h14"],
};

type Props = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
  filled?: boolean;
};

export function Icon({ name, size = 20, filled = false, className, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
