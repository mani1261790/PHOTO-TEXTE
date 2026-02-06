export default function Home() {
  return (
    <div>
      <div className="card panel-highlight hero">
        <h1>PHOTO-TEXTE</h1>
        <p className="hero-lead">
          写真を起点に、フランス語の表現と意図を丁寧に磨き上げる学習スタジオ。
          下書きから最終文まで、思考の流れを整理しながら仕上げられます。
        </p>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>学習の流れ</h2>
        </div>
        <div className="flow-grid">
          <div className="flow-box">
            <strong>1. 写真と下書きを登録</strong>
            タイトルとフランス語下書きを添えて、観察と言葉を結びつけます。
          </div>
          <div className="flow-box">
            <strong>2. 意図を日本語で整える</strong>
            自動翻訳を土台に、自分の意図だけを短く言語化します。
          </div>
          <div className="flow-box">
            <strong>3. 最終フランス語を磨く</strong>
            差分を確認しながら、提出用の文に仕上げます。
          </div>
        </div>
      </div>
    </div>
  );
}
