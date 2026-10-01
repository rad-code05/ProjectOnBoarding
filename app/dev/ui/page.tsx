import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Avatar,
  Button,
  IconButton,
  InlineError,
  Logo,
  Notice,
  PasswordField,
  PlusIcon,
  SignOutIcon,
  TextField,
} from "@/components/ui";

export const metadata = { title: "UI components — dev only" };

const swatches = [
  ["Sand", "bg-sand", "#F4F0EA"],
  ["Ink", "bg-ink", "#000000"],
  ["Stone", "bg-stone", "#7e7e7e"],
  ["Signal", "bg-signal", "#cf2e2e"],
  ["Graphite", "bg-graphite", "#535353"],
  ["Paper", "bg-paper", "#FFFFFF"],
  ["Line", "bg-line", "#dcd4c7"],
  ["Suggest", "bg-suggest", "#f9e4b4"],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-paper p-6">
      <h2 className="font-serif text-2xl">{title}</h2>
      {children}
    </section>
  );
}

/** Dev-only preview of the UI primitives (compare with the Components board). */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-graphite uppercase">
          Dev only
        </p>
        <h1 className="font-serif text-4xl">UI components</h1>
      </div>

      <Section title="Colour & type">
        <div className="grid grid-cols-4 gap-3">
          {swatches.map(([name, cls, hex]) => (
            <div key={name} className="flex flex-col gap-1">
              <div className={`h-12 rounded-field border border-line ${cls}`} />
              <span className="text-xs font-semibold">{name}</span>
              <span className="text-xs text-graphite">{hex}</span>
            </div>
          ))}
        </div>
        <p className="font-serif text-3xl">
          Newsreader <span className="font-accent italic">accent</span>
        </p>
        <p>Raleway — body, labels, buttons</p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="text">Text</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <Button size="sm" iconLeft={<PlusIcon size={12} />}>
            Small with icon
          </Button>
          <Button size="lg">Large</Button>
          <IconButton label="Add" icon={<PlusIcon />} />
          <IconButton label="Add" icon={<PlusIcon />} variant="solid" />
          <div className="rounded-field bg-ink p-2">
            <IconButton
              label="Sign out"
              icon={<SignOutIcon />}
              variant="dark"
            />
          </div>
        </div>
      </Section>

      <Section title="Fields">
        <div className="grid grid-cols-2 gap-5">
          <TextField
            label="Work email"
            type="email"
            placeholder="name@laine.ai"
          />
          <PasswordField label="Password" />
          <TextField label="Manager" required error="Required — type a name." />
          <TextField
            label="Ticket ID"
            readOnly
            defaultValue="UAM-2026-000124 · auto"
          />
          <TextField
            label="Country"
            hint="Where the person works."
            fieldSize="lg"
          />
        </div>
      </Section>

      <Section title="Feedback & identity">
        <InlineError>Email or password is incorrect.</InlineError>
        <Notice>
          Access is by invitation only. There is no self sign-up — contact Raju
          if you need an account.
        </Notice>
        <Notice
          tone="ai"
          actions={
            <>
              <Button size="sm">Accept all</Button>
              <Button size="sm" variant="text">
                Dismiss
              </Button>
            </>
          }
        >
          The assistant suggested <strong>9 values</strong>.
        </Notice>
        <div className="flex items-center gap-4 rounded-field bg-ink p-4">
          <Logo size="sm" />
          <Logo size="lg" />
          <Avatar name="Raju Bholani" />
          <Avatar name="Moises Larez" size="md" />
        </div>
        <Avatar name="Raju Bholani" tone="ink" size="lg" />
      </Section>
    </main>
  );
}
