import Link from 'next/link';

export default function Home() {
  return (
    <div>
      <div className="card panel-highlight">
        <h1>PHOTO-TEXTE</h1>
        <p>
          写真から意図を整理し、フランス語の最終文まで一気に作る学習サービスです。
        </p>
        <div className="actions-row">
          <Link href="/login" className="badge">
            はじめる
          </Link>
          <Link href="/entries" className="badge">
            エントリーを見る
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>使い方（3ステップ）</h2>
        </div>
        <div className="flow-grid">
          <div className="flow-box">
            <strong>1. 入力</strong>
            写真・タイトル・下書きFRを登録
          </div>
          <div className="flow-box">
            <strong>2. 意図確定</strong>
            JP自動翻訳を1回だけ編集してロック
          </div>
          <div className="flow-box">
            <strong>3. 提出</strong>
            最終FR確認 → 差分確認 → PPTX出力
          </div>
        </div>
      </div>
    </div>
  );
}
