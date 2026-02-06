import Link from 'next/link';

export function TopNav() {
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            PT
          </span>
          <span>
            <strong>PHOTO-TEXTE</strong>
            <small>Visual Writing Studio</small>
          </span>
        </Link>
        <nav className="topnav-links" aria-label="主要メニュー">
          <Link href="/entries">エントリー</Link>
          <Link href="/settings">設定</Link>
        </nav>
      </div>
    </header>
  );
}
