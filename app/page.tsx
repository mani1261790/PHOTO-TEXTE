import Link from 'next/link';

export default function Home() {
  return (
    <div className="card">
      <h1>PHOTO-TEXTE</h1>
      <p>プライバシー重視のPHOTO-TEXTE課題作成アプリです。</p>
      <p>
        <Link href="/login">ログイン</Link>
      </p>
    </div>
  );
}
