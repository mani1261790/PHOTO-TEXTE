'use client';

export function LogoMark({ title = 'PHOTO-TEXTE' }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width="24"
      height="24"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ptg" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F766E" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient id="shine" x1="16" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(255,255,255,0.75)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#ptg)" />

      <rect
        x="16"
        y="18"
        width="32"
        height="26"
        rx="8"
        fill="rgba(255,255,255,0.14)"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
      />
      <circle cx="46" cy="22" r="3" fill="rgba(255,255,255,0.75)" />

      <path
        d="M18 48 L40 26"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M38 24 L48 30"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M18 16 C30 10, 40 10, 52 16"
        stroke="url(#shine)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

