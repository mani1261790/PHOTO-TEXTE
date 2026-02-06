'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  authChangeEventName,
  clearAccessToken,
  getAccessToken
} from '@/lib/auth/token-store';

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const syncAuth = () => setIsAuthed(Boolean(getAccessToken()));
    const authEvent = authChangeEventName();
    syncAuth();
    window.addEventListener('storage', syncAuth);
    window.addEventListener(authEvent, syncAuth);
    return () => {
      window.removeEventListener('storage', syncAuth);
      window.removeEventListener(authEvent, syncAuth);
    };
  }, []);

  useEffect(() => {
    setIsAuthed(Boolean(getAccessToken()));
  }, [pathname]);

  const handleLogout = () => {
    clearAccessToken();
    setIsAuthed(false);
    router.push('/login');
  };

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
              <button type="button" className="topnav-action" onClick={handleLogout}>
                ログアウト
              </button>
            </>
          ) : (
            <Link href="/login">ログイン・新規登録</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
