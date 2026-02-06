'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getAccessToken } from '@/lib/auth/token-store';

export function TopNav() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const syncAuth = () => setIsAuthed(Boolean(getAccessToken()));
    syncAuth();
    window.addEventListener('storage', syncAuth);
    return () => window.removeEventListener('storage', syncAuth);
  }, []);

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            PT
          </span>
          <span>
            <strong>PHOTO-TEXTE</strong>
            <small>Atelier de rédaction visuelle</small>
          </span>
        </Link>
        <nav className="topnav-links" aria-label="主要メニュー">
          {isAuthed ? (
            <>
              <Link href="/entries">エントリー一覧</Link>
              <Link href="/settings">設定</Link>
            </>
          ) : (
            <Link href="/login">ログイン・新規登録</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
