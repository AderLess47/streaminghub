import type { EpgProgramme } from "../model/types";

/**
 * Beispielbibliothek für Store-Tests und zum Ausprobieren ohne eigene Playlist.
 *
 * Die Einträge sind öffentliche Testassets: HLS-Teststreams von Mux und Apple
 * sowie offene Filme der Blender Foundation (CC BY). Kein Sender, kein
 * Filmstudio, keine dritte Marke und keine personenbezogenen Daten. Nichts davon
 * ist ein StreamingHub-Inhaltsangebot.
 */

export const DEMO_SOURCE_LABEL = "Demo-Inhalte";

type DemoChannel = { id: string; name: string; url: string };

const liveChannels: DemoChannel[] = [
  { id: "demo.live.one", name: "Demo Live Eins", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
  {
    id: "demo.live.two",
    name: "Demo Live Zwei",
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
  },
  { id: "demo.live.three", name: "Demo Live Drei", url: "https://test-streams.mux.dev/pts_shift/master.m3u8" },
];

const movies: DemoChannel[] = [
  { id: "demo.movie.one", name: "Demo Film: Tears of Steel", url: "https://test-streams.mux.dev/tos_ismc/main.m3u8" },
  { id: "demo.movie.two", name: "Demo Film: Big Buck Bunny", url: "https://media.w3.org/2010/05/bunny/trailer.mp4" },
];

const series: DemoChannel = {
  id: "demo.series.one",
  name: "Demo Serie: Sintel Trailer",
  url: "https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4",
};

/** Erweiterte M3U-Quelle, die der normale Parser liest. */
export const demoPlaylist: string = [
  "#EXTM3U",
  ...liveChannels.map((channel) => `#EXTINF:-1 tvg-id="${channel.id}" group-title="Demo Live",${channel.name}\n${channel.url}`),
  ...movies.map((channel) => `#EXTINF:-1 tvg-id="${channel.id}" group-title="Demo Filme",${channel.name}\n${channel.url}`),
  `#EXTINF:-1 tvg-id="${series.id}" group-title="Demo Serien",${series.name}\n${series.url}`,
].join("\n");

const MINUTE_MS = 60_000;

/** Programmdaten relativ zur aktuellen Zeit, damit immer "Jetzt" und "Danach"
 * vorhanden sind statt abgelaufener Beispielzeitstempel. */
export function demoProgrammes(nowMs: number): EpgProgramme[] {
  const slots: Array<[number, number, string]> = [
    [-75, -15, "Demo: Rückblick"],
    [-15, 25, "Demo: Jetzt"],
    [25, 65, "Demo: Danach"],
  ];

  return liveChannels
    .flatMap((channel, channelIndex) =>
      slots.map(([fromMinutes, toMinutes, prefix], slotIndex) => ({
        channelId: channel.id,
        channelName: channel.name,
        startMs: nowMs + fromMinutes * MINUTE_MS,
        stopMs: nowMs + toMinutes * MINUTE_MS,
        title: `${prefix} ${channelIndex + 1}.${slotIndex + 1}`,
        description: "Beispielsendung für Store-Tests. Kein echter Sender, keine echten Programmdaten.",
      })),
    )
    .sort((a, b) => a.startMs - b.startMs);
}
