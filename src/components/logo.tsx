import Link from "next/link";

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
  href?: string | null;
};

export function LogoMark({ size = 36 }: { size?: number }) {
  const id = "sh-logo-gradient";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="StreamingHub"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={id} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="0.55" stopColor="#2563EB" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill="url(#sh-logo-gradient)" />
      <rect
        x="1.5"
        y="1.5"
        width="45"
        height="45"
        rx="13"
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1"
      />
      <path d="M18.5 15.5 33.5 24l-15 8.5V15.5Z" fill="#FFFFFF" />
      <path
        d="M12 30.5c4.2 2.4 8.5 3.5 12.5 3.5 4.6 0 8.7-1.4 11.5-3.6"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({ size = 36, withWordmark = true, className = "", href = "/" }: LogoProps) {
  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {withWordmark ? (
        <span className="text-[1.05rem] font-semibold tracking-tight text-fg">
          Streaming<span className="grad-text">Hub</span>
        </span>
      ) : null}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label="StreamingHub Startseite" className="inline-flex min-h-6 items-center rounded-lg">
      {content}
    </Link>
  );
}
