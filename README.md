# PHOTO-TEXTE

PHOTO-TEXTE 作成アプリです（Next.js + Supabase + OpenAI API）。

## 概要

- **目的**: 写真ごとのフランス語下書きから、日本語意図整理→最終フランス語化→PPTX出力までを一貫処理。
- **主な構成**: Next.js (App Router) / Supabase (Auth, Postgres, Storage) / OpenAI API（未設定時はフォールバック文生成）。
- **データモデルの要点**:
  - 現行: `entries` + `entry_photos`（複数写真）
  - 互換: `entries` 単体（旧・単写真フロー）

---

## システム全体フロー（精密版）

### 1. 認証からエントリー作成まで

```mermaid
flowchart TD
    A[ユーザーアクセス] --> B{ログイン済み?}
    B -- No --> C[サインアップとログイン API]
    C --> C1{signupで既存ユーザー?}
    C1 -- Yes --> C2[パスワードリセット送信]
    C1 -- No --> C3[Auth作成と user_profiles 初期化]
    C2 --> D[ダッシュボード表示]
    C3 --> D
    B -- Yes --> D

    D --> E[写真アップロード API]
    E --> E1{レート制限内?}
    E1 -- No --> X1[429系エラー]
    E1 -- Yes --> E2{file存在かつ 8MB以下?}
    E2 -- No --> X2[入力エラー]
    E2 -- Yes --> E3[EXIF除去とサニタイズ]
    E3 --> E4[Storage保存と assets 登録]

    E4 --> F{新規エントリー作成種別}
    F -- 複数写真 --> G["/api/entries/multi"]
    G --> G1{photo_asset_id 重複なし?}
    G1 -- No --> X3[DUPLICATE_PHOTO]
    G1 -- Yes --> G2{asset存在かつ所有者一致?}
    G2 -- No --> X4[ASSET_NOT_FOUND または ASSET_FORBIDDEN]
    G2 -- Yes --> G3[entries作成 status DRAFT_FR]
    G3 --> G4{旧スキーマで photo_asset_id が NOT NULL ?}
    G4 -- Yes --> G5[先頭写真で互換 insert を再試行]
    G4 -- No --> G6[entry_photos を position 順に insert]
    G5 --> G6

    F -- 単写真互換 --> H["/api/entries"]
    H --> H1[entries作成 status DRAFT_FR]

    G6 --> I[編集フェーズへ]
    H1 --> I
```

### 2. 編集と最終文確定

```mermaid
flowchart TD
    I[編集フェーズ] --> I1[下書き更新]
    I1 --> I2{状態が DRAFT_FR または JP_AUTO_READY ?}
    I2 -- No --> X5[ENTRY_LOCKED または 更新拒否]
    I2 -- Yes --> I3[更新反映]

    I --> J[翻訳 API]
    J --> J1{レート制限内?}
    J1 -- No --> X1[429系エラー]
    J1 -- Yes --> J2{対象存在かつ所有者一致?}
    J2 -- No --> X6[ENTRY または PHOTO が見つからない]
    J2 -- Yes --> J3{draft更新可能状態?}
    J3 -- No --> X5
    J3 -- Yes --> J4[FR から JA へ翻訳]
    J4 --> J5[JP_AUTO_READY へ遷移]

    I --> K[意図ロックとリライト API]
    K --> K1{レート制限内?}
    K1 -- No --> X1
    K1 -- Yes --> K2{対象存在かつ所有者一致?}
    K2 -- No --> X6
    K2 -- Yes --> K3{プロフィール取得可?}
    K3 -- No --> X7[PROFILE_NOT_FOUND]

    K3 --> K4{現行が JP_AUTO_READY ?}
    K4 -- Yes --> K8[JA意図から FR 最終文を生成]
    K4 -- No --> K5{現行が JP_INTENT_LOCKED ?}
    K5 -- No --> X8[状態不正]
    K5 -- Yes --> K6{final_fr 既存?}
    K6 -- No --> X9[REWRITE_FAILED]
    K6 -- Yes --> K7[FINAL_FR_READY へ確定]

    K8 --> K9{生成結果が空でない?}
    K9 -- No --> X9
    K9 -- Yes --> K10[jp_intent と final_fr を保存]
    K10 --> K11[FINAL_FR_READY へ確定]

    K7 --> L[差分表示 API]
    K11 --> L
    L --> L1{final_fr 存在?}
    L1 -- No --> X10[FINAL_TEXT_REQUIRED]
    L1 -- Yes --> L2[diff計算と CEFR 未知語ハイライト]

    I --> M[メモ API]
    M --> M1[手動メモ CRUD]
    M --> M2[自動メモ生成]
    M2 --> M3{レート制限内?}
    M3 -- No --> X1
    M3 -- Yes --> M4{final_fr が 1件以上ある?}
    M4 -- No --> M5[suggestions は空配列]
    M4 -- Yes --> M6[未知語抽出と学習メモ生成]
```

### 3. エクスポートとダウンロード

```mermaid
flowchart TD
    I[編集フェーズ] --> N[PPTX出力 API]
    N --> N1{レート制限内?}
    N1 -- No --> X1[429系エラー]
    N1 -- Yes --> N2[runExportWorkflow]

    N2 --> N3{複数写真モード?}
    N3 -- Yes --> N4{全photoで jp_auto と jp_intent と final_fr がある?}
    N4 -- No --> X11[ENTRY_NOT_READY]
    N4 -- Yes --> N5{全photo status が FINAL_FR_READY または EXPORTED ?}
    N5 -- No --> X12[ENTRY_STATUS]
    N5 -- Yes --> N8[assets解決と署名URL取得と画像読込]

    N3 -- No --> N6{entryに jp_auto と jp_intent と final_fr と photo_asset_id がある?}
    N6 -- No --> X11
    N6 -- Yes --> N7{entry status が FINAL_FR_READY または EXPORTED ?}
    N7 -- No --> X12
    N7 -- Yes --> N8

    N8 --> N9{include_memos が true ?}
    N9 -- Yes --> N10[SELF_NOTE のみ抽出]
    N9 -- No --> N11[学習メモなし]
    N10 --> N12[PPTX生成]
    N11 --> N12

    N12 --> N13[exports バケットへ保存と token_hash 登録]
    N13 --> N14[状態更新]
    N14 --> O[トークン付きダウンロード URL を返却]

    O --> P["/api/exports/:token/download"]
    P --> P1{token_hash 一致?}
    P1 -- No --> X13[EXPORT_NOT_FOUND]
    P1 -- Yes --> P2{有効期限内?}
    P2 -- No --> X14[EXPORT_EXPIRED]
    P2 -- Yes --> P3[PPTXダウンロード返却]
```

### 4. 定期 keepalive

```mermaid
flowchart TD
    Q["Vercel Cron: /api/internal/supabase-keepalive"] --> Q1{Bearer CRON_SECRET 一致?}
    Q1 -- No --> X15[401 UNAUTHORIZED]
    Q1 -- Yes --> Q2[user_profiles を head select]
    Q2 --> Q3[ok true を返却]
```

---

## ステータスマシン（業務状態）

- 共通状態: `DRAFT_FR → JP_AUTO_READY → JP_INTENT_LOCKED → FINAL_FR_READY → EXPORTED`
- 下書き編集可: `DRAFT_FR`, `JP_AUTO_READY` のみ
- リライト可: `JP_INTENT_LOCKED` のみ（`/rewrite` ワークフロー）
- エクスポート可:
  - 複数写真: すべての写真が `FINAL_FR_READY` または `EXPORTED`
  - 単写真: entry が `FINAL_FR_READY` または `EXPORTED`

---

## 最小セットアップ

### 1) 環境変数

`.env.local` を作成し設定:

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

`APP_MASTER_KEY_B64` 生成:

```bash
openssl rand -base64 32
```

### 2) Supabase

- プロジェクト作成
- SQL Editor でマイグレーション適用: `supabase/migrations/202602050001_init_photo_texte.sql`

### 3) 起動

```bash
npm install
npm run dev
```

### 4) テスト

```bash
npm test
```

---

## デプロイ要点（Vercel）

- GitHub連携で `Next.js` として Import
- 上記環境変数を Vercel Project に登録
- Supabase `Authentication > URL Configuration` に本番URLを設定
- `vercel.json` の Cron で毎日 keepalive 実行（`CRON_SECRET` 必須）
