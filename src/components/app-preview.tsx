import type { Dictionary } from "@/i18n/de";
import { Icon } from "./icons";
import { LogoMark } from "./logo";

const DEMO_TITLES = ["Nordlicht", "Hafenlichter", "Studio 8", "Klangraum", "Atlas", "Funkhaus"];

type Preview = Dictionary["home"]["preview"];

/**
 * Fully CSS/SVG based product mockup. All artwork is abstract and all titles
 * are fictional – no third-party posters, logos or film artwork are used.
 *
 * The chrome mirrors the Android build: a header row with the brand, the source
 * label and the three action buttons, then the featured card, filters and the
 * card grid. There is deliberately no sidebar and no bottom tab bar, because the
 * app has neither. The premium card is shown as its own motif, using the state
 * the server reports for an active subscription.
 */
export function AppPreview({ t }: { t: Preview }) {
  return (
    <figure className="relative mx-auto w-full max-w-[42rem]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_40%,rgba(37,99,235,0.32),transparent_70%)] blur-2xl"
      />

      <div className="relative" aria-hidden="true">
        <span className="absolute -top-3 left-4 z-10 rounded-full border border-white/12 bg-ink/80 px-2.5 py-1 text-[0.62rem] font-medium text-slate-300 backdrop-blur">
          {t.tvLabel}
        </span>

        {/* Television */}
        <div className="rounded-[1.1rem] border border-white/12 bg-[#0a0e16] p-1.5 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.95)] sm:rounded-2xl sm:p-2">
          <div className="overflow-hidden rounded-[0.7rem] border border-white/8 sm:rounded-xl">
            <TvScreen t={t} />
          </div>
        </div>
        <div className="mx-auto h-2 w-24 rounded-b-md bg-gradient-to-b from-[#1a2334] to-transparent sm:h-3 sm:w-32" />

        {/* Phone and premium card sit beside each other below the screen, so the
            grid and header of the television stay visible. */}
        <div className="mt-4 flex items-start justify-center gap-3 sm:mt-5 sm:gap-5">
          <div className="relative w-[24%] max-w-[7.5rem] shrink-0">
            <span className="absolute -top-2 left-1 rounded-full border border-white/12 bg-ink/85 px-1.5 py-0.5 text-[0.5rem] text-slate-300 backdrop-blur">
              {t.phoneLabel}
            </span>
            <div className="rounded-[0.9rem] border border-white/16 bg-[#0b111c] p-1 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.95)]">
              <div className="overflow-hidden rounded-[0.6rem]">
                <PhoneScreen t={t} />
              </div>
            </div>
          </div>

          <div className="relative min-w-0 flex-1 max-w-[20rem]">
            <span className="absolute -top-2 left-1 rounded-full border border-white/12 bg-ink/85 px-1.5 py-0.5 text-[0.5rem] text-slate-300 backdrop-blur">
              {t.premiumLabel}
            </span>
            <div className="rounded-[0.9rem] border border-white/14 bg-[#0b111c] p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)]">
              <div className="overflow-hidden rounded-[0.55rem]">
                <PremiumScreen t={t} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <figcaption className="mt-5 text-center text-[0.7rem] leading-relaxed text-muted sm:text-xs">
        {t.subtitle}
      </figcaption>
    </figure>
  );
}

/** Header row shared by every device: brand, source label, action buttons. */
function AppHeaderRow({ t, compact = false }: { t: Preview; compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-1 px-1.5 pt-1" : "gap-1.5 px-2.5 pt-1.5"}`}>
      <LogoMark size={compact ? 9 : 14} />
      <div className="min-w-0 flex-1">
        <p
          className={`truncate font-semibold text-slate-100 ${
            compact ? "text-[0.42rem]" : "text-[0.58rem] sm:text-[0.66rem]"
          }`}
        >
          StreamingHub
        </p>
        <p className={`truncate text-slate-400 ${compact ? "text-[0.3rem]" : "text-[0.4rem] sm:text-[0.46rem]"}`}>
          {t.demoPlaylist}
        </p>
      </div>
      <span className="grid size-3 place-items-center rounded-[3px] border border-white/10 text-slate-400 sm:size-3.5">
        <Icon name="plus" size={compact ? 5 : 7} />
      </span>
      <span className="grid size-3 place-items-center rounded-[3px] border border-white/10 text-slate-400 sm:size-3.5">
        <Icon name="tv" size={compact ? 5 : 7} />
      </span>
      <span className="grid size-3 place-items-center rounded-[3px] border border-white/10 text-slate-400 sm:size-3.5">
        <Icon name="settings" size={compact ? 5 : 7} />
      </span>
    </div>
  );
}

function TvScreen({ t }: { t: Preview }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#070b12]">
      <div className="flex h-full min-w-0 flex-col">
        <AppHeaderRow t={t} />

        {/* Featured card */}
        <div className="poster-a relative mx-2.5 mt-1.5 h-[38%] overflow-hidden rounded-md sm:rounded-lg">
          <div className="absolute inset-0 bg-gradient-to-t from-[#050a12] via-[#050a12]/25 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_82%_10%,rgba(6,182,212,0.5),transparent_55%)]" />
          <div className="absolute bottom-1.5 left-2 right-2 sm:bottom-2.5 sm:left-3">
            <p className="text-[0.4rem] uppercase tracking-[0.18em] text-cyan-200/80 sm:text-[0.48rem]">
              {t.demoCategory}
            </p>
            <p className="mt-0.5 text-[0.68rem] font-semibold text-white sm:text-[0.9rem]">{t.demoTitle}</p>
            <p className="text-[0.38rem] text-slate-300 sm:text-[0.46rem]">{t.demoMeta}</p>
            <div className="mt-1 flex items-center gap-1">
              <span className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-[2px] text-[0.38rem] font-semibold text-slate-900 sm:px-2">
                <Icon name="play" size={5} filled />
                {t.nowPlaying}
              </span>
              <span className="grid size-3 place-items-center rounded-full border border-white/30 text-white sm:size-3.5">
                <Icon name="plus" size={5} />
              </span>
            </div>
          </div>
        </div>

        {/* Search and filters, as on the real home screen */}
        <div className="flex items-center gap-1 px-2.5 pt-1.5 sm:gap-1.5">
          {t.demoGenres.map((genre, index) => (
            <span
              key={genre}
              className={`rounded-full px-1.5 py-[2px] text-[0.36rem] sm:text-[0.44rem] ${
                index === 0
                  ? "bg-white/85 font-medium text-slate-900"
                  : "border border-white/10 bg-white/5 text-slate-300"
              }`}
            >
              {genre}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1 rounded-full border border-white/8 bg-white/5 px-1.5 py-0.5 text-[0.34rem] text-slate-400 sm:text-[0.42rem]">
            <Icon name="search" size={6} />
            {t.demoSearch}
          </span>
        </div>

        {/* Three columns: 224 dp cards on a television, not six narrow ones. */}
        <div className="mt-1 grid grid-cols-3 gap-1 px-2.5 pb-1.5">
          {DEMO_TITLES.slice(0, 3).map((title, index) => (
            <div key={title} className="min-w-0">
              <div className={`aspect-[16/10] rounded-[3px] ${["poster-b", "poster-c", "poster-d"][index]}`} />
              <p className="mt-0.5 truncate text-[0.34rem] text-slate-400 sm:text-[0.42rem]">{title}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Settings → Premium card, in the state an active subscription produces. */
function PremiumScreen({ t }: { t: Preview }) {
  return (
    <div className="w-full bg-[#080d16] px-2 pb-2 pt-1.5">
      <div className="flex items-center gap-1">
        <span className="grid size-3 place-items-center rounded-full border border-white/12 text-slate-400">
          <Icon name="play" size={5} />
        </span>
        <p className="text-[0.42rem] font-semibold text-slate-200">Einstellungen</p>
      </div>

      {/* Contrast on #0d1420 stays AA for the small scale: slate-100 16.8:1,
          cyan 7.6:1, slate-400 7.2:1 – slate-500 (3.9:1) is deliberately avoided. */}
      <div className="mt-1.5 rounded-[4px] border border-white/10 bg-[#0d1420] p-2">
        <p className="text-[0.56rem] font-semibold text-slate-100">{t.premiumTitle}</p>
        <p className="text-[0.4rem] text-slate-400">{t.premiumBilling}</p>

        <p className="mt-1.5 flex items-center gap-1 text-[0.46rem] font-medium text-cyan">
          <Icon name="check" size={6} />
          {t.premiumActive}
        </p>
        <p className="mt-0.5 text-[0.4rem] text-slate-400">{t.premiumRenewal}</p>
        <p className="mt-0.5 text-[0.4rem] leading-relaxed text-slate-400">{t.premiumBenefit}</p>

        <span className="mt-1.5 inline-flex items-center rounded-full border border-white/14 px-1.5 py-[2px] text-[0.38rem] text-slate-300">
          {t.premiumRefresh}
        </span>
      </div>
    </div>
  );
}

function PhoneScreen({ t }: { t: Preview }) {
  return (
    <div className="aspect-[9/18] w-full bg-[#080d16] px-1 py-1.5">
      <div className="mx-auto mb-1 h-[2px] w-6 rounded-full bg-white/25" />
      <AppHeaderRow t={t} compact />

      <div className="poster-a relative mx-1 mt-1 overflow-hidden rounded-[3px] aspect-[3/3.1]">
        <div className="absolute inset-0 bg-gradient-to-t from-[#050a12] via-transparent to-transparent" />
        <div className="absolute bottom-1 left-1 right-1">
          <p className="text-[0.26rem] text-cyan-200/80">{t.demoCategory}</p>
          <p className="text-[0.34rem] font-semibold leading-tight text-white">{t.demoTitle}</p>
          <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-white px-1 py-[1px] text-[0.22rem] font-semibold text-slate-900">
            <Icon name="play" size={4} filled />
            {t.nowPlaying}
          </span>
        </div>
      </div>

      {/* One column on a phone: the grid adapts instead of switching layout. */}
      <div className="mt-1 space-y-0.5 px-1">
        {DEMO_TITLES.slice(0, 2).map((title, index) => (
          <div key={title} className="flex items-center gap-1">
            <div className={`size-3 shrink-0 rounded-[2px] ${index === 0 ? "poster-c" : "poster-d"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.26rem] text-slate-300">{title}</p>
              <div className="mt-0.5 h-[2px] w-2/3 rounded-full bg-white/15" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
