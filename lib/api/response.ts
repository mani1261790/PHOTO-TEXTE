import { NextResponse } from 'next/server';

import { ApiError } from '@/lib/api/errors';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

const codeToJaMessage: Record<string, string> = {
  INTERNAL_ERROR: 'サーバー内部でエラーが発生しました。',
  CONFIG_ERROR: 'サーバー設定が未完了です。環境変数を確認してください。',
  AUTH_REQUIRED: 'ログインが必要です。',
  AUTH_INVALID: '認証情報が無効です。再ログインしてください。',
  LOGIN_FAILED: 'メールアドレスまたはパスワードが正しくありません。',
  SIGNUP_FAILED: 'アカウントを作成できませんでした。',
  PROFILE_CREATE_FAILED: 'プロフィール初期化に失敗しました。',
  PROFILE_NOT_FOUND: 'プロフィールが見つかりません。',
  PROFILE_UPDATE_FAILED: 'プロフィール更新に失敗しました。',
  ENTRY_NOT_FOUND: 'エントリーが見つかりません。',
  ENTRY_CREATE_FAILED: 'エントリーを作成できませんでした。',
  ENTRY_UPDATE_FAILED: 'エントリーを更新できませんでした。',
  ENTRY_LIST_FAILED: 'エントリー一覧を取得できませんでした。',
  ENTRY_LOCKED: '意図ロック後は本文を編集できません。',
  TRANSLATE_FAILED: '日本語への変換に失敗しました。',
  LOCK_FAILED: '意図JPのロックに失敗しました。',
  REWRITE_FAILED: '最終フランス語の生成に失敗しました。',
  FINAL_TEXT_REQUIRED: '最終フランス語がまだ生成されていません。',
  MISSING_INTENT: '意図JPが設定されていません。',
  PHOTO_REQUIRED: '写真ファイルを選択してください。',
  PHOTO_TOO_LARGE: '写真サイズが上限を超えています。',
  PHOTO_UPLOAD_FAILED: '写真アップロードに失敗しました。',
  ASSET_CREATE_FAILED: '画像アセット登録に失敗しました。',
  RATE_LIMITED: 'リクエストが多すぎます。少し待ってから再試行してください。',
  MEMO_LIST_FAILED: 'メモ一覧の取得に失敗しました。',
  MEMO_CREATE_FAILED: 'メモの作成に失敗しました。',
  EXPORT_NOT_FOUND: 'ダウンロードトークンが見つかりません。',
  EXPORT_EXPIRED: 'ダウンロードトークンの有効期限が切れています。',
  EXPORT_DOWNLOAD_FAILED: 'エクスポートのダウンロードに失敗しました。',
  EXPORT_UPLOAD_FAILED: 'PPTXファイル保存に失敗しました。',
  EXPORT_DB_FAILED: 'エクスポート情報の登録に失敗しました。',
  ENTRY_NOT_READY: 'エクスポート前に最終文の生成が必要です。',
  ENTRY_STATUS: '現在の状態ではエクスポートできません。',
  INVALID_JSON: 'JSON形式が正しくありません。',
  VALIDATION_ERROR: '入力内容が正しくありません。',
  NO_FIELDS: '更新対象の項目がありません。'
};

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    const ja = codeToJaMessage[error.code] ?? 'リクエストを処理できませんでした。';
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: ja
        }
      },
      { status: error.status }
    );
  }

  if (
    error instanceof Error &&
    error.message.includes('Missing environment variable:')
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFIG_ERROR',
          message: codeToJaMessage.CONFIG_ERROR
        }
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: codeToJaMessage.INTERNAL_ERROR
      }
    },
    { status: 500 }
  );
}
