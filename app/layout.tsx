import './globals.css';

import type { Metadata } from 'next';
import { TopNav } from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'PHOTO-TEXTE',
  description: 'プライバシー重視の課題作成フロー'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <TopNav />
        <main>{children}</main>
      </body>
    </html>
  );
}
