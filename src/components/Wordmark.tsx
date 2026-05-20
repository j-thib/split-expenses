type Props = { size?: number }

export function NicklMark({ size = 32 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
    >
      <defs>
        <clipPath id="nickl-disc">
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <g clipPath="url(#nickl-disc)">
        <rect width="64" height="64" fill="#2F5D50" />
        <polygon points="64,0 64,64 0,64" fill="#C97B5B" />
        <line x1="-2" y1="-2" x2="66" y2="66" stroke="#FAFAF8" strokeWidth="1" />
      </g>
    </svg>
  )
}

export function NicklWordmark({ size = 28 }: Props) {
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: size * 0.32 }}
      aria-label="Nickl"
    >
      <NicklMark size={size} />
      <span
        className="font-sans font-bold text-ink"
        style={{
          fontSize: size * 0.95,
          letterSpacing: -size * 0.02,
          lineHeight: 1,
        }}
      >
        nickl<span className="text-accent">.</span>
      </span>
    </span>
  )
}
