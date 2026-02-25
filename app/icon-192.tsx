import { ImageResponse } from 'next/og';

export const size = {
  width: 192,
  height: 192
};

export const contentType = 'image/png';

function renderIcon(sizePx: number) {
  const innerSize = Math.round(sizePx * 0.7);
  const borderRadius = Math.round(sizePx * 0.25);
  const innerRadius = Math.round(sizePx * 0.22);
  const borderWidth = Math.max(2, Math.round(sizePx * 0.03));
  const fontSize = Math.round(sizePx * 0.28);
  const letterSpacing = Math.round(sizePx * 0.015);

  return (
    <div
      style={{
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: `${borderRadius}px`,
        background: 'linear-gradient(145deg, #0f766e, #38bdf8)'
      }}
    >
      <div
        style={{
          width: `${innerSize}px`,
          height: `${innerSize}px`,
          borderRadius: `${innerRadius}px`,
          border: `${borderWidth}px solid rgba(255,255,255,0.7)`,
          background: 'rgba(255,255,255,0.10)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 800,
          fontSize,
          letterSpacing
        }}
      >
        PT
      </div>
    </div>
  );
}

export default function Icon192() {
  return new ImageResponse(renderIcon(size.width), {
    ...size
  });
}
