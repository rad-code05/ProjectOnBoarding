export type PagePlaceholderProps = {
  title: string;
  /** What will live here, in one sentence. */
  description: string;
  /** Plan item that builds the page, e.g. "F01". */
  feature: string;
};

/** Empty page in the shell until its feature is built. */
export function PagePlaceholder({
  title,
  description,
  feature,
}: PagePlaceholderProps) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-serif text-4xl tracking-tight">{title}</h1>
      <div className="h-[3px] w-12 bg-signal" aria-hidden="true" />
      <p className="max-w-prose text-sm text-graphite">{description}</p>
      <p className="text-xs text-graphite">Coming with {feature}.</p>
    </div>
  );
}
