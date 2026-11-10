import type { Dictionary } from "@/i18n/de";
import { Icon } from "./icons";
import { LogoMark } from "./logo";

const DEMO_TITLES = ["Nordlicht", "Hafenlichter", "Studio 8", "Klangraum", "Atlas"];

/**
 * Fully CSS/SVG based product mockup. All artwork is abstract and all titles
 * are fictional – no third-party posters, logos or film artwork are used.
 */
export function AppPreview({ t }: { t: Dictionary["home"]["preview"] }) {
  return (
    <figure className="relative mx-auto w-full max-w-[42rem]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(37,99,235,0.32),transparent_70%)] blur-2xl"
      />

      <div className="relative" aria-hidden="true">
        {/* Television */}
        <div className="rounded-[1.1rem] border border-white/12 bg-[#0a0e16] p-1.5 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.95)] sm:rounded-2xl sm:p-2">
          <div className="overflow-hidden rounded-[0.7rem] border border-white/8 sm:rounded-xl">
            <TvScreen t={t} />
          </div>
        </div>
        <div className="mx-auto h-2 w-24 rounded-b-md bg-gradient-to-b from-[#1a2334] to-transparent sm:h-3 sm:w-32" />

        {/* Tablet */}
        <div className="absolute -bottom-10 right-0 w-[42%] rounded-[0.9rem] border border-white/14 bg-[#0b111c] p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)] sm:w-[36%]">
          <div className="overflow-hidden rounded-[0.55rem]">
            <TabletScreen t={t} />
          </div>
        </div>

        {/* Phone */}
        <div className="absolute -bottom-14 left-1 w-[24%] max-w-[7.5rem] rounded-[0.9rem] border border-white/16 bg-[#0b111c] p-1 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.95)] sm:w-[22%]">
          <div className="overflow-hidden rounded-[0.6rem]">
            <PhoneScreen t={t} />
          </div>
        </div>

        <span className="absolute -top-3 left-4 rounded-full border border-white/12 bg-ink/80 px-2.5 py-1 text-[0.62rem] font-medium text-slate-300 backdrop-blur">
          {t.tvLabel}
        </span>
        <span className="absolute bottom-6 left-[26%] hidden rounded-full border border-white/12 bg-ink/85 px-2 py-0.5 text-[0.55rem] text-slate-300 backdrop-blur sm:block">
          {t.phoneLabel}
        </span>
        <span className="absolute -bottom-3 right-2 rounded-full border border-white/12 bg-ink/85 px-2 py-0.5 text-[0.55rem] text-slate-300 backdrop-blur">
          {t.tabletLabel}
        </span>
      </div>

      <figcaption className="mt-14 text-center text-[0.7rem] leading-relaxed text-muted sm:mt-16 sm:text-xs">
        {t.subtitle}
      </figcaption>
    </figure>
  );
}

function TvScreen({ t }: { t: Dictionary["home"]["preview"] }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#070b12]">
      <div className="absolute inset-0 grid grid-cols-[2.1rem_1fr] sm:grid-cols-[2.6rem_1fr]">
        <div className="flex flex-col items-center gap-2 border-r border-white/6 bg-[#080d16] py-2 sm:gap-3">
          <LogoMark size={16} />
          <span className="grid size-4 place-items-center rounded-[3px] bg-brand/30 text-cyan">
            <Icon name="grid" size={9} />
          </span>
          <Icon name="tv" size={10} className="text-slate-500" />
          <Icon name="play" size={10} className="text-slate-500" />
          <Icon name="layers" size={10} className="text-slate-500" />
          <Icon name="settings" size={10} className="mt-auto text-slate-600" />
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-[0.42rem] uppercase tracking-[0.16em] text-slate-500 sm:text-[0.5rem]">
                {t.demoPlaylist}
              </p>
              <p className="truncate text-[0.6rem] font-semibold text-slate-100 sm:text-[0.72rem]">
                {t.demoContinue}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <span className="flex items-center gap-1 rounded-full border border-white/8 bg-white/5 px-1.5 py-0.5 text-[0.42rem] text-slate-400 sm:text-[0.5rem]">
                <Icon name="search" size={7} />
                {t.demoSearch}
              </span>
              <span className="size-3 rounded-full bg-gradient-to-br from-brand to-cyan sm:size-4" />
            </div>
          </div>

          <div className="mx-2.5 flex-1 overflow-hidden rounded-md poster-a relative sm:rounded-lg">
            <div className="absolute inset-0 bg-gradient-to-t from-[#050a12] via-[#050a12]/25 to-transparent" />
            <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_82%_10%,rgba(6,182,212,0.5),transparent_55%)]" />
            <div className="absolute bottom-1.5 left-2 right-2 sm:bottom-3 sm:left-3">
              <p className="text-[0.42rem] uppercase tracking-[0.18em] text-cyan-200/80 sm:text-[0.5rem]">
                {t.demoCategory}
              </p>
              <p className="mt-0.5 text-[0.72rem] font-semibold text-white sm:text-[0.95rem]">
                {t.demoTitle}
              </p>
              <p className="text-[0.4rem] text-slate-300 sm:text-[0.5rem]">{t.demoMeta}</p>
              <div className="mt-1 flex items-center gap-1 sm:mt-1.5">
                <span className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-[3px] text-[0.4rem] font-semibold text-slate-900 sm:px-2">
                  <Icon name="play" size={6} filled />
                  {t.nowPlaying}
                </span>
                <span className="grid size-3 place-items-center rounded-full border border-white/30 text-white sm:size-4">
                  <Icon name="plus" size={6} />
                </span>
              </div>
              <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-white/25">
                <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-cyan to-brand" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2.5 pt-1.5 sm:gap-1.5">
            {t.demoGenres.map((genre, index) => (
              <span
                key={genre}
                className={`rounded-full px-1.5 py-[2px] text-[0.38rem] sm:text-[0.46rem] ${
                  index === 0
                    ? "bg-white/85 font-medium text-slate-900"
                    : "border border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                {genre}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-4 gap-1 px-2.5 pb-2">
            {DEMO_TITLES.slice(0, 4).map((title, index) => (
              <div key={title} className="min-w-0">
                <div
                  className={`aspect-[16/10] rounded-[3px] ${["poster-b", "poster-c", "poster-d", "poster-e"][index]}`}
                />
                <p className="mt-0.5 truncate text-[0.36rem] text-slate-400 sm:text-[0.44rem]">{title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabletScreen({ t }: { t: Dictionary["home"]["preview"] }) {
  return (
    <div className="aspect-[4/3] w-full bg-[#080d16] p-1">
      <div className="flex items-center justify-between px-0.5">
        <LogoMark size={9} />
        <span className="text-[0.3rem] text-slate-500">{t.demoPlaylist}</span>
      </div>
      <div className="mt-1 overflow-hidden rounded-[3px] poster-b relative aspect-[16/9]">
        <div className="absolute inset-0 bg-gradient-to-t from-[#060a11] to-transparent" />
        <div className="absolute bottom-1 left-1.5 right-1.5">
          <p className="text-[0.32rem] text-cyan-200/70">{t.demoCategory}</p>
          <p className="text-[0.44rem] font-semibold text-white">{t.demoTitle}</p>
          <div className="mt-0.5 h-[4px] w-8 rounded-full bg-white/85" />
        </div>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-0.5">
            <div className={`aspect-[16/11] rounded-[2px] ${["poster-c", "poster-d", "poster-e"][index]}`} />
            <div className="h-[2px] w-3/4 rounded-full bg-white/15" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PhoneScreen({ t }: { t: Dictionary["home"]["preview"] }) {
  return (
    <div className="aspect-[9/18] w-full bg-[#080d16] px-1 py-1.5">
      <div className="mx-auto mb-1 h-[2px] w-6 rounded-full bg-white/25" />
      <div className="flex items-center justify-between">
        <p className="text-[0.28rem] font-semibold text-slate-200">{t.demoContinue}</p>
        <span className="size-2 rounded-full bg-gradient-to-br from-brand to-cyan" />
      </div>
      <div className="relative mt-1 overflow-hidden rounded-[3px] poster-a aspect-[3/3.4]">
        <div className="absolute inset-0 bg-gradient-to-t from-[#050a12] via-transparent to-transparent" />
        <div className="absolute bottom-1 left-1 right-1">
          <p className="text-[0.26rem] text-cyan-200/80">{t.demoCategory}</p>
          <p className="text-[0.34rem] font-semibold leading-tight text-white">{t.demoTitle}</p>
          <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-white px-1 py-[1px] text-[0.22rem] font-semibold text-slate-900">
            <Icon name="play" size={4} filled />
            Play
          </span>
        </div>
      </div>
      <div className="mt-1 space-y-0.5">
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center gap-1">
            <div className={`size-3 shrink-0 rounded-[2px] ${index === 0 ? "poster-c" : "poster-d"}`} />
            <div className="flex-1 space-y-0.5">
              <div className="h-[2px] w-4/5 rounded-full bg-white/20" />
              <div className="h-[2px] w-1/2 rounded-full bg-white/10" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-around border-t border-white/8 pt-0.5">
        <Icon name="grid" size={5} className="text-cyan" />
        <Icon name="tv" size={5} className="text-slate-600" />
        <Icon name="play" size={5} className="text-slate-600" />
        <Icon name="user" size={5} className="text-slate-600" />
      </div>
    </div>
  );
}
