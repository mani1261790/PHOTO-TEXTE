'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  authChangeEventName,
  clearAccessToken,
  getAccessToken
} from '@/lib/auth/token-store';
import { LogoMark } from '@/components/LogoMark';
import { useLanguage } from '@/components/LanguageProvider';

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === 'fr' ? fr : ja);
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
              <LogoMark />
            </span>
            <span>
              <strong>PHOTO-TEXTE</strong>
              <small>Atelier de rédaction visuelle</small>
            </span>
          </Link>
          <button
            type="button"
            className="topnav-toggle"
            aria-label={menuOpen ? t('メニューを閉じる', 'Fermer le menu') : t('メニューを開く', 'Ouvrir le menu')}
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
          aria-label={t('主要メニュー', 'Menu principal')}
        >
          {isAuthed ? (
            <>
              <Link href="/" onClick={closeMenu}>
                {t('エントリー一覧', 'Entrées')}
              </Link>
              <Link href="/settings" onClick={closeMenu}>
                {t('設定', 'Paramètres')}
              </Link>
              <button type="button" className="topnav-action" onClick={handleLogout}>
                {t('ログアウト', 'Déconnexion')}
              </button>
            </>
          ) : (
            <Link href="/login" onClick={closeMenu}>
              {t('ログイン・新規登録', 'Connexion / Inscription')}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
