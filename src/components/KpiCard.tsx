export default function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-risk-green"
      : tone === "negative"
        ? "text-risk-red"
        : "text-foreground";

  return (
    <div className="card-hover flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            {icon}
          </span>
        )}
        <p className="min-w-0 truncate text-xs text-foreground-muted">{label}</p>
      </div>
      <p
        className={`mt-2 break-words text-xl font-semibold leading-tight tabular-nums sm:text-2xl ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}
