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
  const { language, setLanguage } = useLanguage();
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

  const handleLogout = async () => {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'same-origin'
    }).catch(() => undefined);
    clearAccessToken();
    setIsAuthed(false);
    closeMenu();
    router.push('/login');
  };

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <Link href="/" className="brand" onClick={closeMenu}>
          <span className="brand-mark" aria-hidden>
            <LogoMark />
          </span>
          <span>
            <strong>PHOTO-TEXTE</strong>
            <small>Atelier de rédaction visuelle</small>
          </span>
        </Link>
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
            <div className="topnav-auth-links">
              <Link href="/login" onClick={closeMenu}>
                {t('ログイン', 'Connexion')}
              </Link>
              <Link href="/login?mode=signup" onClick={closeMenu}>
                {t('新規登録', 'Créer un compte')}
              </Link>
            </div>
          )}
        </nav>
        <div className="topnav-utilities">
          <fieldset className="language-switcher" aria-label={t('表示言語', "Langue d'affichage")}>
            <legend className="visually-hidden">{t('表示言語', "Langue d'affichage")}</legend>
            <label className="language-option" title="日本語">
              <input
                type="radio"
                name="service-language"
                value="ja"
                checked={language === 'ja'}
                onChange={() => setLanguage('ja')}
              />
              <span className="language-flag language-flag-ja" aria-hidden />
              <span className="visually-hidden">日本語</span>
            </label>
            <label className="language-option" title="Français">
              <input
                type="radio"
                name="service-language"
                value="fr"
                checked={language === 'fr'}
                onChange={() => setLanguage('fr')}
              />
              <span className="language-flag language-flag-fr" aria-hidden />
              <span className="visually-hidden">Français</span>
            </label>
          </fieldset>
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
      </div>
    </header>
  );
}
