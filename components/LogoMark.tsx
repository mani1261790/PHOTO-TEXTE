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

      <rect x="16" y="16" width="32" height="32" rx="10" fill="rgba(255,255,255,0.12)" />
      <rect
        x="16"
        y="16"
        width="32"
        height="32"
        rx="10"
        fill="none"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="2"
      />
      <text
        x="32"
        y="39"
        textAnchor="middle"
        fontSize="20"
        fontWeight="800"
        letterSpacing="1"
        fill="#fff"
        fontFamily="Aptos, 'Hiragino Sans', 'Yu Gothic', sans-serif"
      >
        PT
      </text>
    </svg>
  );
}
