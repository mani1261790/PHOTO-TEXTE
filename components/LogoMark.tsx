'use client';

export function LogoMark({ title = 'PHOTO-TEXTE' }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width="24"
      height="24"
      role="img"
      aria-label={title}
      shapeRendering="geometricPrecision"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ptg" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F766E" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#ptg)" />

      <rect x="16" y="18" width="32" height="26" rx="8" fill="rgba(255,255,255,0.12)" />
      <rect
        x="16"
        y="18"
        width="32"
        height="26"
        rx="8"
        fill="none"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="2"
      />
      <circle cx="46" cy="22" r="3" fill="rgba(255,255,255,0.8)" />

      <path d="M20 46 L38 28" stroke="rgba(255,255,255,0.92)" strokeWidth="4" strokeLinecap="round" />
      <path d="M36 26 L46 32" stroke="rgba(255,255,255,0.92)" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M18 49 L22 53 L53 22 L49 18 Z"
        fill="rgba(15, 118, 110, 0.22)"
      />
    </svg>
  );
}
