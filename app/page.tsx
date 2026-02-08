import Link from 'next/link';

export default function Home() {
  return (
    <div className="page-stack">
      <div className="card panel-highlight hero">
        <p className="eyebrow">写真から、ことばへ</p>
        <h1>PHOTO-TEXTE</h1>
        <p className="hero-lead">
          写真を起点に、フランス語の表現と意図を丁寧に磨き上げる学習スタジオ。
          初めてでも、下書きから最終文まで迷わず進めます。
        </p>
        <div className="actions-row">
          <Link href="/entries/new" className="btn-link-primary">
            新しいエントリーを作る
          </Link>
          <Link href="/entries" className="btn-link-secondary">
            これまでのエントリーを見る
          </Link>
        </div>
      </div>

      <div className="card onboarding-card">
        <div className="section-head">
          <h2>最短3ステップで完了</h2>
        </div>
        <div className="flow-grid">
          <div className="flow-box">
            <strong>1. 写真と下書きを登録</strong>
            写真・タイトル・下書き本文を入力します。下書きは途中で自動保存されます。
          </div>
          <div className="flow-box">
            <strong>2. 日本語文を確認して確定</strong>
            自動生成された日本語文を必要に応じて調整し、確定します。
          </div>
          <div className="flow-box">
            <strong>3. 最終フランス語を出力</strong>
            最終文の差分を確認して、提出用PPTXをダウンロードします。
          </div>
        </div>
      </div>

      <div className="card tip-list">
        <h3>はじめて使うときのおすすめ順</h3>
        <ol>
          <li>設定で学習レベル（CEFR）を選ぶ</li>
          <li>新規エントリーで写真と下書きを登録する</li>
          <li>日本語文を確定し、最終フランス語を確認する</li>
        </ol>
      </div>
    </div>
  );
}
