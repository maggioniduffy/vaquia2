import Link from "next/link";
import { BarsIcon, HeartPulseIcon, ShieldIcon } from "@/components/ui/icons";
import { VaquiaMark, VaquiaWordmark } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { t } from "@/i18n/es-AR";
import { AsciiCanvas } from "./ascii-canvas";
import { ThemedImage } from "./themed-image";

const L = t.landing;
const MONO = "font-mono font-medium";
const H2 =
  "m-0 text-[34px] min-[68.75rem]:text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] text-balance";
const GUTTER = "px-4 sm:px-10 min-[68.75rem]:px-20";
const BTN_PRIMARY =
  "lp-btn inline-flex items-center rounded-full bg-[var(--l-btn)] font-medium no-underline";

function Nav() {
  const link = "lp-muted no-underline";
  return (
    <header className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-4 sm:px-10">
      <Link href="/" className="lp-link flex items-center no-underline" aria-label={t.app.name}>
        <VaquiaWordmark size="md" />
      </Link>
      <nav aria-label={L.nav.label} className="hidden gap-9 text-[15px] min-[56.25rem]:flex">
        <a href="#producto" className={link}>
          {L.nav.product}
        </a>
        <a href="#campo" className={link}>
          {L.nav.field}
        </a>
        <a href="#oficina" className={link}>
          {L.nav.office}
        </a>
        <a href="#campo" className={link}>
          {L.nav.contractors}
        </a>
      </nav>
      <div className="flex items-center gap-2.5">
        <ThemeToggle variant="round" label={L.nav.toggleTheme} />
        <Link href="/login" className="lp-muted px-3.5 py-2.5 text-[15px] no-underline">
          {L.nav.login}
        </Link>
        <a href={L.demoHref} className={`${BTN_PRIMARY} px-5 py-[11px] text-[15px] max-sm:hidden`}>
          {L.nav.demo}
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto flex max-w-[1440px] flex-col items-center gap-[22px] px-4 pt-12 text-center sm:px-10 sm:pt-[72px]">
      <span
        className={`${MONO} rounded-full bg-[var(--l-pill)] px-3.5 py-[7px] text-[11px] tracking-[0.12em] text-[var(--l-muted)] sm:text-[12px]`}
      >
        {L.hero.eyebrow}
      </span>
      <h1 className="m-0 max-w-[980px] text-[44px] leading-none font-semibold tracking-[-0.045em] text-balance sm:text-[60px] min-[68.75rem]:text-[76px]">
        {L.hero.titleLine1}
        <br />
        {L.hero.titleLine2}
      </h1>
      <p className="m-0 max-w-[640px] text-[17px] leading-normal text-pretty text-[var(--l-muted)] sm:text-[19px]">
        {L.hero.lead}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <a href={L.demoHref} className={`${BTN_PRIMARY} px-6 py-3.5 text-[16px]`}>
          {L.hero.primary}
        </a>
        <a
          href="#oficina"
          className="lp-link rounded-full border border-[var(--l-border)] px-[22px] py-3.5 text-[16px] font-medium no-underline"
        >
          {L.hero.secondary}
        </a>
      </div>
    </section>
  );
}

function AsciiDashboard() {
  return (
    <div className="relative mt-14 min-h-[640px] overflow-hidden min-[68.75rem]:h-[1000px]">
      {/* Full-bleed: the ASCII landscape spans the viewport; the screenshot stays centered. */}
      <div
        className="landing-ascii-mask absolute top-0 left-0 h-full w-full min-[68.75rem]:h-[760px]"
        aria-hidden
      >
        <AsciiCanvas
          src="/landing/patagonia.png"
          className="absolute inset-0 block h-full w-full"
        />
      </div>
      <div className="relative mx-auto mt-[110px] w-[92%] overflow-hidden rounded-[14px] shadow-[var(--l-shadow-hero)] max-sm:w-full max-sm:rounded-none min-[68.75rem]:absolute min-[68.75rem]:top-[250px] min-[68.75rem]:left-1/2 min-[68.75rem]:mt-0 min-[68.75rem]:w-[min(1080px,92%)] min-[68.75rem]:-translate-x-1/2">
        <ThemedImage
          name="inicio"
          width={2160}
          height={1442}
          alt={L.hero.dashboardAlt}
          sizes="(min-width: 68.75rem) 1080px, 92vw"
          className="block h-auto w-full"
          priority
        />
      </div>
    </div>
  );
}

function Pillars() {
  const icons = [ShieldIcon, HeartPulseIcon, BarsIcon] as const;
  return (
    <section
      id="producto"
      className="mx-auto grid max-w-[1440px] grid-cols-1 px-4 pt-10 pb-16 sm:px-10 min-[68.75rem]:grid-cols-3 min-[68.75rem]:pb-28"
    >
      {L.pillars.map((p, i) => {
        const Icon = icons[i] ?? ShieldIcon;
        return (
          <div
            key={p.label}
            className="flex flex-col gap-3.5 border-b border-[var(--l-line)] px-0 py-6 last:border-b-0 min-[68.75rem]:border-r min-[68.75rem]:border-b-0 min-[68.75rem]:px-10 min-[68.75rem]:py-2 min-[68.75rem]:last:border-r-0"
          >
            <Icon size={28} strokeWidth={1.6} className="text-accent" />
            <div className={`${MONO} text-[13px] tracking-[0.12em]`}>{p.label}</div>
            <div className="text-[16px] leading-[1.55] text-pretty text-[var(--l-muted)]">
              {p.body}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Field() {
  const phones = [
    { name: "hoy", alt: L.field.phones.hoy, mt: "" },
    { name: "charla", alt: L.field.phones.charla, mt: "min-[68.75rem]:mt-12" },
    { name: "firma", alt: L.field.phones.firma, mt: "min-[68.75rem]:mt-24" },
  ];
  return (
    <section id="campo" className="bg-[var(--l-section)]">
      <div
        className={`mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-10 py-16 min-[68.75rem]:grid-cols-[360px_minmax(0,1fr)] min-[68.75rem]:gap-12 min-[68.75rem]:py-28 ${GUTTER}`}
      >
        <div className="flex flex-col gap-5">
          <span className={`${MONO} text-accent text-[12px] tracking-[0.12em]`}>
            {L.field.eyebrow}
          </span>
          <h2 className={H2}>{L.field.title}</h2>
          <p className="m-0 text-[17px] leading-[1.55] text-pretty text-[var(--l-muted)]">
            {L.field.body}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {L.field.chips.map((c) => (
              <span
                key={c}
                className={`${MONO} rounded-full border border-[var(--l-line)] px-3 py-[7px] text-[12px] text-[var(--l-muted)]`}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
        <div className="lp-scroller -mx-4 flex snap-x snap-mandatory items-start gap-4 overflow-x-auto px-4 pb-8 sm:-mx-10 sm:gap-6 sm:px-10 min-[68.75rem]:mx-0 min-[68.75rem]:snap-none min-[68.75rem]:justify-end min-[68.75rem]:overflow-visible min-[68.75rem]:px-0 min-[68.75rem]:pb-0">
          {phones.map((p) => (
            <div
              key={p.name}
              className={`w-[274px] flex-none snap-center overflow-hidden rounded-[30px] shadow-[var(--l-shadow-phone)] min-[68.75rem]:w-auto min-[68.75rem]:max-w-[274px] min-[68.75rem]:min-w-0 min-[68.75rem]:flex-1 min-[68.75rem]:basis-0 ${p.mt}`}
            >
              <ThemedImage
                name={p.name}
                width={548}
                height={1188}
                alt={p.alt}
                sizes="274px"
                className="block h-auto w-full"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Office() {
  return (
    <section
      id="oficina"
      className={`mx-auto flex max-w-[1440px] flex-col gap-10 py-16 min-[68.75rem]:gap-14 min-[68.75rem]:py-28 ${GUTTER}`}
    >
      <div className="flex flex-col justify-between gap-6 min-[68.75rem]:flex-row min-[68.75rem]:items-end min-[68.75rem]:gap-12">
        <div className="flex max-w-[640px] flex-col gap-5">
          <span className={`${MONO} text-accent text-[12px] tracking-[0.12em]`}>
            {L.office.eyebrow}
          </span>
          <h2 className={H2}>{L.office.title}</h2>
        </div>
        <p className="m-0 max-w-[420px] text-[17px] leading-[1.55] text-pretty text-[var(--l-muted)]">
          {L.office.body}
        </p>
      </div>
      <ol className="m-0 grid list-none grid-cols-1 gap-y-8 border-t border-[var(--l-border)] p-0 sm:grid-cols-2 min-[68.75rem]:grid-cols-4 min-[68.75rem]:gap-y-0">
        {L.office.steps.map((s, i) => (
          <li
            key={s.title}
            className={`flex flex-col gap-3 pt-7 sm:pr-7 ${
              i % 2 === 1 ? "sm:border-l sm:border-[var(--l-line)] sm:pl-7" : ""
            } min-[68.75rem]:border-l min-[68.75rem]:border-[var(--l-line)] min-[68.75rem]:px-7 ${
              i === 0 ? "min-[68.75rem]:border-l-0 min-[68.75rem]:pl-0" : ""
            } ${i === 3 ? "min-[68.75rem]:pr-0" : ""}`}
          >
            <span className={`${MONO} text-accent text-[13px]`}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="text-[22px] font-semibold tracking-[-0.02em]">{s.title}</div>
            <div className="text-[15px] leading-[1.55] text-[var(--l-muted)]">{s.body}</div>
          </li>
        ))}
      </ol>
      <div className="mx-auto w-full max-w-[1280px] overflow-hidden rounded-[14px] shadow-[var(--l-shadow-card)] max-sm:-mx-4 max-sm:w-[calc(100%+32px)] max-sm:max-w-none max-sm:rounded-none">
        <ThemedImage
          name="acciones"
          width={2560}
          height={1708}
          alt={L.office.screenshotAlt}
          sizes="(min-width: 1360px) 1280px, 100vw"
          className="block h-auto w-full"
        />
      </div>
    </section>
  );
}

function Footer() {
  const label = `${MONO} mb-1.5 text-[12px] text-[var(--l-label)]`;
  const link = "lp-link no-underline";
  return (
    <footer className="relative overflow-hidden bg-[var(--l-footer)]">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 40% 55% at 22% 105%,rgba(0,209,199,.30),transparent 70%),radial-gradient(ellipse 45% 50% at 72% 108%,rgba(140,160,179,.55),transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-[1440px] px-4 pt-16 pb-8 sm:px-10 min-[68.75rem]:pt-24">
        <div className="grid grid-cols-1 gap-8 min-[68.75rem]:grid-cols-4">
          <div className="flex flex-col gap-4 min-[68.75rem]:col-span-2">
            <div className="max-w-[460px] text-[28px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[34px]">
              {L.footer.cta}
            </div>
            <a href={L.demoHref} className={`${BTN_PRIMARY} self-start px-[22px] py-3 text-[15px]`}>
              {L.footer.demo}
            </a>
          </div>
          <div className="flex flex-col gap-2.5 text-[16px]">
            <span className={label}>{L.footer.productLabel}</span>
            <a href="#campo" className={link}>
              {L.nav.field}
            </a>
            <a href="#oficina" className={link}>
              {L.nav.office}
            </a>
            <a href="#campo" className={link}>
              {L.nav.contractors}
            </a>
          </div>
          <div className="flex flex-col gap-2.5 text-[16px]">
            <span className={label}>{L.footer.contactLabel}</span>
            <a href={`mailto:${L.footer.email}`} className={link}>
              {L.footer.email}
            </a>
            <span>{L.footer.location}</span>
          </div>
        </div>
        <div
          aria-hidden
          className="mt-16 flex items-end gap-[0.113em] text-[clamp(56px,22vw,318px)] min-[68.75rem]:mt-[120px]"
        >
          <VaquiaMark size={230} className="h-[0.7233em] w-[0.9434em] shrink-0" />
          <span className="text-text leading-[0.74] font-semibold tracking-[-0.06em]">
            {t.app.name}
          </span>
        </div>
        <div
          className={`mt-10 flex flex-wrap justify-between gap-2 font-mono text-[13px] text-[var(--l-footer-text)] min-[68.75rem]:mt-14`}
        >
          <span>{L.footer.tagline}</span>
          <span>{L.footer.copyright}</span>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="landing bg-bg">
      <Nav />
      <main>
        <Hero />
        <AsciiDashboard />
        <Pillars />
        <Field />
        <Office />
      </main>
      <Footer />
    </div>
  );
}
