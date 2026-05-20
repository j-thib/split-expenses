type SpinnerProps = {
  className?: string
  label?: string
}

export default function Spinner({
  className = 'w-8 h-8 text-brand',
  label = 'Loading',
}: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={label}
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.2"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CenteredSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner label={label} />
    </div>
  )
}
