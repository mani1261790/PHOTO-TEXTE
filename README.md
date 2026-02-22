# PHOTO-TEXTE

プライバシー重視の PHOTO-TEXTE 作成アプリです。  
構成は **Vercel + Supabase + OpenAI API** を前提にしています。

## 1. 技術構成

- Next.js (App Router) + TypeScript
- Supabase (Auth / Postgres / Storage)
- OpenAI API（翻訳・リライト）
- PPTX生成（サーバー側）

## 2. 事前準備

- Node.js 20+
- npm
- Supabaseアカウント
- Vercelアカウント
- OpenAI APIキー（任意だが推奨）

## 3. Supabaseセットアップ

### 3-1. プロジェクト作成

Supabaseで新規プロジェクトを作成。

### 3-2. マイグレーション実行

Supabase `SQL Editor` で以下を実行:

- `supabase/migrations/202602050001_init_photo_texte.sql`

### 3-3. APIキー確認

`Project Settings -> API` で取得:

- Project URL
- anon public key
- service_role key

## 4. ローカル起動

```bash
cd /Users/mani/Developer/PHOTO-TEXTE
cp .env.example .env.local
```

`APP_MASTER_KEY_B64` は以下で生成:

```bash
openssl rand -base64 32
```

`.env.local` を設定:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
APP_MASTER_KEY_B64=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
PHOTO_BUCKET=photos
EXPORT_BUCKET=exports
```

起動:

```bash
npm install
npm run dev
```

## 5. Vercelデプロイ（初めて向け）

### 5-1. GitHubにpush

このプロジェクトをGitHubにpush。

### 5-2. VercelでImport

1. Vercel Dashboard -> `Add New...` -> `Project`
2. GitHubリポジトリを選択
3. Framework Preset は `Next.js` のまま

### 5-3. 環境変数を登録

`Project Settings -> Environment Variables` に以下を登録:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `APP_MASTER_KEY_B64`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `PHOTO_BUCKET`
- `EXPORT_BUCKET`

### 5-4. デプロイ

`Deploy` を押す。

## 6. Supabase側で本番URLを反映

Vercelの本番URLが出たら、Supabaseで設定:

1. `Authentication -> URL Configuration`
2. `Site URL` を本番URLに設定
3. `Redirect URLs` に本番URL（必要なら `http://localhost:3000` も）を追加

## 7. メール確認テンプレート（任意）

`Authentication -> Email Templates -> Confirm signup` で日本語テンプレートに変更可能。

## 8. UI/UX方針

- Apple HIG寄りのフラットUI
- テーマ色を統一（Primary: `#0A84FF`）
- 左: 進捗タイムライン / 右: 作業カード
- ロック後編集不可を明示

## 9. Supabase自動pause回避（keepalive）

このリポジトリには `vercel.json` のCron設定が含まれており、毎日 `03:00 UTC` に  
`/api/internal/supabase-keepalive` を呼び出します。

このAPIは `CRON_SECRET` を使って保護されています。  
Vercel Cron は `Authorization: Bearer <CRON_SECRET>` を自動で付けるため、外部からは実行できません。

初回セットアップ:

1. `Project Settings -> Environment Variables` に `CRON_SECRET` を登録
2. `Deployments` で再デプロイ
3. 必要なら手動確認:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/internal/supabase-keepalive`

## 10. テスト

```bash
npm test
```

カバー:

- `JP_INTENT_LOCKED` 後に本文更新拒否
- diffが非破壊
- exportにemail/nameが含まれない
- EXIF除去
- RLSポリシーの存在確認
