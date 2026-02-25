import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PHOTO-TEXTE',
    short_name: 'PHOTO-TEXTE',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f766e',
    icons: [
      {
        src: '/icon-192',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  };
}
