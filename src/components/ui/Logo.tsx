export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo-mark">
      <circle cx="32" cy="32" r="27" className="logo-mark__ring" />
      <path d="M24 17v30h18" className="logo-mark__l" />
      <circle cx="42" cy="21" r="3.5" className="logo-mark__dot" />
    </svg>
  );
}
