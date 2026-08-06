# PHOTO-TEXTE

写真ごとのフランス語下書きを、日本語で意図確認しながら最終フランス語へ直し、PPTX / PDFとして出力する Next.js アプリです。

## 構成

- Next.js 16 App Router
- Cloudflare Workers（OpenNext）
- Cloudflare D1（Better Auth・プロフィール・エントリー・メモ）
- Cloudflare R2（写真・PPTX・PDF）
- Better Auth（HttpOnly Cookieセッション）
- OpenAI API（翻訳・書き直し・ヒント生成）

Supabase は移行元としてだけ扱います。通常のAPI処理、認証、データ保存、ファイル保存には使いません。既存利用者のパスワードを安全に引き継ぐ期間だけ、初回ログイン時の本人確認先としてSupabase Authを利用できます。

## 主なデータフロー

1. Better Authでログインし、Cookieセッションを発行
2. ブラウザで写真をJPEG化し、Worker側でもEXIFなどのメタデータを除去
3. 写真をR2、メタデータをD1へ保存
4. 写真ごとの `DRAFT_FR → JP_AUTO_READY → JP_INTENT_LOCKED → FINAL_FR_READY → EXPORTED` をD1トリガーで検証
5. PPTXまたは同じ16:9レイアウトのPDFを生成し、R2へ保存

D1にはSupabaseのRLSがないため、`lib/cloudflare/client.ts` が全ユーザー所有テーブルへ認証済みユーザーID条件を自動付与します。サービス権限のクライアントは、公開ダウンロードトークンの検証など限定したサーバー処理だけで使用します。

## ローカル開発

### 必要な環境変数

`.env.local` に次を設定します。

```env
APP_MASTER_KEY_B64=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
BETTER_AUTH_SECRET=
STORAGE_SIGNING_SECRET=
PHOTO_BUCKET=photos
EXPORT_BUCKET=exports
```

秘密値はそれぞれ32バイト以上のランダム値を使用してください。

```bash
openssl rand -base64 32
```

Supabaseから移行するときだけ、以下も必要です。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### 起動と検証

```bash
npm install
npm run db:migrate:local
npm run dev
```

Cloudflareの実行環境で確認する場合:

```bash
npm run cf:build
npx wrangler dev
```

品質チェック:

```bash
npm run cf:types
npm test
npx tsc --noEmit
npm run build
npm run cf:build
```

## Cloudflareリソース

`wrangler.jsonc` には次のバインディングがあります。

- `DB`: D1 `photo-texte`
- `CONTENT_BUCKET`: R2 `photo-texte-content`
- `ASSETS`: OpenNext静的アセット
- `WORKER_SELF_REFERENCE`: OpenNext自己参照サービス

初回だけR2をCloudflare Dashboardで有効化し、バケットを作成します。

```bash
npx wrangler r2 bucket create photo-texte-content
npm run db:migrate:remote
```

本番へは秘密値を `wrangler secret put` で登録します。値を `wrangler.jsonc` やGitへ書かないでください。

```bash
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put STORAGE_SIGNING_SECRET
npx wrangler secret put APP_MASTER_KEY_B64
npx wrangler secret put OPENAI_API_KEY
```

固定ドメインを使用する場合は `BETTER_AUTH_URL` も設定します。Workersの `*.workers.dev` とlocalhostは動的ホスト検証に対応しています。

## Supabaseからのデータ移行

移行スクリプトは、認証ユーザーIDを維持したままD1へデータを入れ、写真のSHA-256を検証してR2へコピーします。期限切れの一時エクスポートは移行せず、必要時に再生成します。

まず件数だけ確認します。

```bash
npm run data:migrate:cloudflare
```

D1だけを移行:

```bash
npm run data:migrate:cloudflare -- --database-only --apply
```

R2だけを移行:

```bash
npm run data:migrate:cloudflare -- --objects-only --apply
```

全体を移行:

```bash
npm run data:migrate:cloudflare -- --apply
```

### 既存利用者のパスワード

Supabaseの管理APIからパスワードハッシュは取得できません。このため、既存利用者の初回ログインだけ次の処理を行います。

1. Better Authでログインを試す
2. Credential未作成ならSupabase Authで同じメール・パスワードを確認
3. 成功時にBetter Auth形式でパスワードをハッシュし、D1へ保存
4. 以後はCloudflareだけでログイン

移行期間中はCloudflareへ `LEGACY_SUPABASE_URL` と `LEGACY_SUPABASE_ANON_KEY` を登録します。9利用者全員にCredentialが作成されたことを確認した後、この2値とSupabaseプロジェクトを削除できます。

```sql
SELECT COUNT(DISTINCT userId)
FROM account
WHERE providerId = 'credential';
```

## デプロイ

```bash
npm run cf:deploy
```

デプロイ前に、D1マイグレーション、R2コピー、4つの本番秘密値、必要なら2つの旧Supabaseログイン値が揃っていることを確認してください。

旧 `supabase/migrations` は移行元スキーマの記録として残しています。新しい変更は `cloudflare/migrations` に追加します。
