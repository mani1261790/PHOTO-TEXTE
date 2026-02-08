import { ImageResponse } from 'next/og';

export const size = {
  width: 64,
  height: 64
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '64px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '16px',
          background: 'linear-gradient(145deg, #0f766e, #38bdf8)'
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '14px',
            border: '2px solid rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: 1
          }}
        >
          PT
        </div>
      </div>
    ),
    {
      ...size
    }
  );
}

