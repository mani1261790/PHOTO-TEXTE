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
  const [menuOpen, setMenuOpen] = useState(false);

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
    setMenuOpen(false);
  }, [pathname]);

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = () => {
    clearAccessToken();
    setIsAuthed(false);
    closeMenu();
    router.push('/login');
  };

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <div className="topnav-mobile-row">
          <Link href="/" className="brand" onClick={closeMenu}>
            <span className="brand-mark" aria-hidden>
              PT
            </span>
            <span>
              <strong>PHOTO-TEXTE</strong>
              <small>Atelier de rédaction visuelle</small>
            </span>
          </Link>
          <button
            type="button"
            className="topnav-toggle"
            aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
            aria-expanded={menuOpen}
            aria-controls="primary-menu"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span aria-hidden />
            <span aria-hidden />
            <span aria-hidden />
          </button>
        </div>
        <nav
          id="primary-menu"
          className={`topnav-links${menuOpen ? ' open' : ''}`}
          aria-label="主要メニュー"
        >
          {isAuthed ? (
            <>
              <Link href="/" onClick={closeMenu}>
                エントリー一覧
              </Link>
              <Link href="/settings" onClick={closeMenu}>
                設定
              </Link>
              <button type="button" className="topnav-action" onClick={handleLogout}>
                ログアウト
              </button>
            </>
          ) : (
            <Link href="/login" onClick={closeMenu}>
              ログイン・新規登録
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
