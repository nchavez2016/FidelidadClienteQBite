import { createFileRoute } from "@tanstack/react-router";
import precisionSystem from "../assets/precision-system.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kinetics — Enterprise Infrastructure" },
      {
        name: "description",
        content: "Deploy resilient enterprise infrastructure with deterministic routing and operational clarity.",
      },
      { property: "og:title", content: "Kinetics — Enterprise Infrastructure" },
      {
        property: "og:description",
        content: "Deploy resilient enterprise infrastructure with deterministic routing and operational clarity.",
      },
    ],
  }),
  component: Index,
});

const featureCards = [
  {
    code: "01",
    label: "Latency",
    title: "Sub-second finality",
    copy: "Validate, sequence, and commit mission-critical operations with a stable control plane built for global teams.",
  },
  {
    code: "02",
    label: "Routing",
    title: "Deterministic flow",
    copy: "Every state transition is visible and auditable, removing ambiguity from complex infrastructure decisions.",
  },
  {
    code: "03",
    label: "Deployment",
    title: "Sovereign by design",
    copy: "Operate in your cloud, private network, or regulated environment without sacrificing speed or governance.",
  },
];

function Index() {
  return (
    <main className="min-h-screen overflow-hidden bg-[image:var(--gradient-hero)] text-foreground">
      <nav className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-3 font-semibold tracking-tight text-foreground">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-sm text-primary-foreground shadow-[var(--shadow-card)]">
              K
            </span>
            Kinetics
          </a>
          <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#platform" className="transition-colors hover:text-foreground">Platform</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#contact" className="transition-colors hover:text-foreground">Contact</a>
          </div>
          <a
            href="#contact"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            Request access
          </a>
        </div>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-20 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:pb-24 lg:pt-28">
        <div className="max-w-3xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-semibold uppercase text-steel-foreground shadow-[var(--shadow-card)]">
            <span className="size-2 rounded-full bg-signal" />
            Deployment 2.4 available
          </div>
          <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[1.03] tracking-normal text-foreground sm:text-6xl lg:text-7xl">
            The structural integrity of your enterprise infrastructure.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
            Kinetics gives teams a deterministic operating layer for complex systems, turning scattered telemetry, routing, and governance into one instantly verifiable command surface.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-machined)] transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            >
              Initialize setup
            </a>
            <a
              href="#platform"
              className="inline-flex items-center justify-center rounded-lg border bg-card/80 px-6 py-3 text-sm font-semibold text-foreground shadow-[var(--shadow-card)] transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            >
              Review platform
            </a>
          </div>
        </div>

        <div id="platform" className="relative">
          <div className="rounded-2xl border bg-[image:var(--gradient-panel)] p-2 shadow-[var(--shadow-machined)]">
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex h-12 items-center gap-4 border-b bg-panel px-4">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="size-3 rounded-full border bg-steel" />
                  <span className="size-3 rounded-full border bg-steel" />
                  <span className="size-3 rounded-full border bg-steel" />
                </div>
                <span className="rounded border bg-card px-2 py-1 font-mono text-xs text-muted-foreground">
                  node-cluster // active
                </span>
              </div>
              <div className="machined-grid relative aspect-[4/3] overflow-hidden sm:aspect-[16/10]">
                <img
                  src={precisionSystem}
                  alt="Abstract enterprise infrastructure visualization"
                  className="absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-multiply"
                  loading="eager"
                />
                <div className="precision-scan absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-signal/30 to-transparent" />
                <div className="absolute inset-x-6 bottom-6 rounded-lg border bg-card/85 p-5 shadow-[var(--shadow-card)] backdrop-blur-md sm:inset-x-auto sm:min-w-80">
                  <div className="flex items-center justify-between gap-4 border-b pb-3">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Throughput</span>
                    <span className="rounded bg-secondary px-2 py-1 font-mono text-xs text-secondary-foreground">1.2ms latency</span>
                  </div>
                  <div className="mt-4 flex items-end gap-2">
                    <strong className="text-4xl font-semibold tracking-normal text-foreground">184,291</strong>
                    <span className="pb-1 text-sm text-muted-foreground">ops/sec</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-t bg-card/55">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-xs font-semibold uppercase text-muted-foreground">Operational layer</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                Built for teams that need certainty at scale.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              A basic landing page foundation with polished sections ready for your real product copy.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {featureCards.map((feature) => (
              <article
                key={feature.code}
                className="group rounded-xl border bg-card/80 p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:bg-card"
              >
                <div className="mb-7 flex items-center justify-between border-b pb-4 font-mono text-xs font-semibold uppercase text-muted-foreground">
                  <span>{feature.code}</span>
                  <span>{feature.label}</span>
                </div>
                <h3 className="text-xl font-semibold tracking-normal text-card-foreground">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{feature.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto flex max-w-7xl flex-col items-center px-5 py-16 text-center sm:px-8 lg:py-24">
        <p className="font-mono text-xs font-semibold uppercase text-muted-foreground">Ready when you are</p>
        <h2 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
          Start with a clearer command surface.
        </h2>
        <a
          href="mailto:hello@example.com"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-machined)] transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        >
          Contact sales
        </a>
      </section>
    </main>
  );
}
