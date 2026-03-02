import './globals.css';

import type { Metadata } from 'next';
import { LanguageProvider } from '@/components/LanguageProvider';
import { TopNav } from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'PHOTO-TEXTE',
  description: '写真とフランス語下書きから日本語の意図確認と最終文を整え、提出用PPTXまで作成できる学習支援サービス'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <LanguageProvider>
          <TopNav />
          <main>{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
