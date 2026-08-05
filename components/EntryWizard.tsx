"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CorrectionAnnotationEditor } from "@/components/CorrectionAnnotationEditor";
import { EntryDiffComparison } from "@/components/EntryDiffComparison";
import { useLanguage } from "@/components/LanguageProvider";
import { apiFetch } from "@/lib/api/fetcher";
import { getAccessToken } from "@/lib/auth/token-store";
import { computeReadOnlyDiff } from "@/lib/diff/read-only";
import {
  CorrectionAnnotations,
  emptyCorrectionAnnotations,
  normalizeCorrectionAnnotations,
} from "@/lib/learning/annotations";

type EntryStatus =
  | "DRAFT_FR"
  | "JP_AUTO_READY"
  | "JP_INTENT_LOCKED"
  | "FINAL_FR_READY"
  | "EXPORTED";

type EditorStep = "draft" | "jp_edit" | "jp_confirm" | "final";

type Entry = {
  id: string;
  title_fr: string;
  status: EntryStatus;
};

type EntryPhoto = {
  id: string;
  entry_id: string;
  user_id: string;
  position: number;
  photo_asset_id: string;
  draft_fr: string;
  jp_auto: string | null;
  jp_intent: string | null;
  final_fr: string | null;
  learning_highlights: unknown;
  status: EntryStatus;
  created_at: string;
  updated_at: string;
  photo_preview_url: string | null;
};

type Memo = {
  id: string;
  memo_type: "TEACHER_FEEDBACK" | "SELF_NOTE";
  content: string;
};

function isDraftEditable(status: EntryStatus): boolean {
  return status === "DRAFT_FR" || status === "JP_AUTO_READY";
}

function deriveEditorStep(photo: EntryPhoto): EditorStep {
  if (photo.final_fr || photo.status === "FINAL_FR_READY" || photo.status === "EXPORTED") {
    return "final";
  }
  if (photo.jp_auto || photo.status === "JP_AUTO_READY") return "jp_edit";
  return "draft";
}

function isExportReady(photos: EntryPhoto[]): boolean {
  return (
    photos.length > 0 &&
    photos.every(
      (photo) =>
        (photo.status === "FINAL_FR_READY" || photo.status === "EXPORTED") &&
        Boolean(photo.final_fr) &&
        Boolean(photo.jp_auto) &&
        Boolean(photo.jp_intent),
    )
  );
}

function PhotoPreview({
  photo,
  unavailableLabel,
}: {
  photo: EntryPhoto;
  unavailableLabel: string;
}) {
  return photo.photo_preview_url ? (
    <img
      src={photo.photo_preview_url}
      alt={`photo-${photo.position}`}
      className="editor-photo-preview"
    />
  ) : (
    <div className="editor-photo-placeholder">{unavailableLabel}</div>
  );
}

export function EntryWizard({ id }: { id: string }) {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === "fr" ? fr : ja);

  const [entry, setEntry] = useState<Entry | null>(null);
  const [photos, setPhotos] = useState<EntryPhoto[]>([]);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [stepByPhotoId, setStepByPhotoId] = useState<Record<string, EditorStep>>({});
  const [jpIntentDraftByPhotoId, setJpIntentDraftByPhotoId] = useState<Record<string, string>>({});
  const [finalDraftByPhotoId, setFinalDraftByPhotoId] = useState<Record<string, string>>({});
  const [annotationsByPhotoId, setAnnotationsByPhotoId] = useState<Record<string, CorrectionAnnotations>>({});
  const [annotationDirtyByPhotoId, setAnnotationDirtyByPhotoId] = useState<Record<string, boolean>>({});
  const [annotationSavingId, setAnnotationSavingId] = useState<string | null>(null);
  const [annotationSavedId, setAnnotationSavedId] = useState<string | null>(null);

  const [memos, setMemos] = useState<Memo[]>([]);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoDraftTouched, setMemoDraftTouched] = useState(false);
  const [memoPendingSave, setMemoPendingSave] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoSavedAt, setMemoSavedAt] = useState<number | null>(null);
  const memoSavePromiseRef = useRef<Promise<void> | null>(null);

  const [hintSuggestions, setHintSuggestions] = useState<string[]>([]);
  const [hintLoading, setHintLoading] = useState(false);
  const hintRequestedRef = useRef<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [finalSavingId, setFinalSavingId] = useState<string | null>(null);
  const [finalSavedId, setFinalSavedId] = useState<string | null>(null);
  const [exportUrls, setExportUrls] = useState<Partial<Record<"pptx" | "pdf", string>>>({});
  const [exportingFormat, setExportingFormat] = useState<"pptx" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activePhoto = useMemo(
    () => photos.find((photo) => photo.id === activePhotoId) ?? photos[0] ?? null,
    [photos, activePhotoId],
  );
  const activePhotoIndex = useMemo(
    () => (activePhoto ? photos.findIndex((photo) => photo.id === activePhoto.id) : -1),
    [activePhoto, photos],
  );
  const activeStep = activePhoto
    ? (stepByPhotoId[activePhoto.id] ?? deriveEditorStep(activePhoto))
    : "draft";
  const activeJpIntentDraft = activePhoto
    ? (jpIntentDraftByPhotoId[activePhoto.id] ?? activePhoto.jp_auto ?? "")
    : "";
  const activeFinalDraft = activePhoto
    ? (finalDraftByPhotoId[activePhoto.id] ?? activePhoto.final_fr ?? "")
    : "";
  const activeAnnotations = activePhoto
    ? (annotationsByPhotoId[activePhoto.id] ??
      normalizeCorrectionAnnotations(activePhoto.learning_highlights, activePhoto.final_fr ?? ""))
    : emptyCorrectionAnnotations("");
  const activeDiffTokens = useMemo(
    () =>
      activePhoto?.final_fr
        ? computeReadOnlyDiff(activePhoto.draft_fr, activeFinalDraft).tokens
        : [],
    [activeFinalDraft, activePhoto?.draft_fr, activePhoto?.final_fr],
  );
  const exportReady = useMemo(() => isExportReady(photos), [photos]);
  const hasFinalText = photos.some((photo) => Boolean(photo.final_fr?.trim()));
  const progress = photos.length
    ? Math.round(
        (photos.filter((photo) => photo.status === "FINAL_FR_READY" || photo.status === "EXPORTED")
          .length /
          photos.length) *
          100,
      )
    : 0;

  const steps = useMemo(
    () => [
      { key: "draft" as const, label: t("1. 写真とフランス語", "1. Photo et français") },
      { key: "jp_edit" as const, label: t("2. 日本語を修正", "2. Corriger le japonais") },
      { key: "jp_confirm" as const, label: t("3. 日本語を確定", "3. Valider le japonais") },
      { key: "final" as const, label: t("4. 最終フランス語", "4. Français final") },
    ],
    [language],
  );

  async function loadAll() {
    const [entryData, photosData, memoData] = await Promise.all([
      apiFetch<Entry>(`/api/entries/${id}`),
      apiFetch<{ photos: EntryPhoto[] }>(`/api/entries/${id}/photos`),
      apiFetch<{ memos: Memo[] }>(`/api/entries/${id}/memos`).catch(() => ({ memos: [] })),
    ]);

    const orderedPhotos = (photosData.photos ?? []).slice().sort((a, b) => a.position - b.position);
    setEntry(entryData);
    setPhotos(orderedPhotos);
    setMemos(memoData.memos);
    setActivePhotoId((current) =>
      current && orderedPhotos.some((photo) => photo.id === current)
        ? current
        : (orderedPhotos.find((photo) => !photo.final_fr)?.id ?? orderedPhotos[0]?.id ?? null),
    );
    setJpIntentDraftByPhotoId((current) => {
      const next = { ...current };
      orderedPhotos.forEach((photo) => {
        if (next[photo.id] === undefined) next[photo.id] = photo.jp_intent ?? photo.jp_auto ?? "";
      });
      return next;
    });
    setFinalDraftByPhotoId((current) => {
      const next = { ...current };
      orderedPhotos.forEach((photo) => {
        if (next[photo.id] === undefined) next[photo.id] = photo.final_fr ?? "";
      });
      return next;
    });
    setAnnotationsByPhotoId(
      Object.fromEntries(
        orderedPhotos.map((photo) => [
          photo.id,
          normalizeCorrectionAnnotations(photo.learning_highlights, photo.final_fr ?? ""),
        ]),
      ),
    );
    setAnnotationDirtyByPhotoId({});
    setAnnotationSavedId(null);

    const selfNote = memoData.memos.find((memo) => memo.memo_type === "SELF_NOTE");
    if (!memoDraftTouched) setMemoDraft(selfNote?.content ?? "");
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    void loadAll().catch((err) => setError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => {
    if (!activePhoto || !isDraftEditable(activePhoto.status) || !activePhoto.draft_fr.trim()) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => void savePhotoDraft(activePhoto, true), 900);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhoto?.id, activePhoto?.draft_fr, activePhoto?.status]);

  useEffect(() => {
    if (!entry || !memoDraftTouched || !memoPendingSave) return;
    const timer = setTimeout(() => void saveSelfNote(memoDraft), 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, memoDraft, memoDraftTouched, memoPendingSave]);

  useEffect(() => {
    if (!entry || !hasFinalText || hintRequestedRef.current === entry.id) return;
    hintRequestedRef.current = entry.id;
    void requestHints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, hasFinalText]);

  function setActiveStep(next: EditorStep) {
    if (!activePhoto) return;
    setStepByPhotoId((current) => ({ ...current, [activePhoto.id]: next }));
  }

  function canOpenStep(step: EditorStep): boolean {
    if (!activePhoto) return false;
    if (step === "draft") return true;
    if (step === "jp_edit" || step === "jp_confirm") return Boolean(activePhoto.jp_auto);
    return Boolean(activePhoto.final_fr);
  }

  function goToPhoto(index: number) {
    const next = photos[index];
    if (next) setActivePhotoId(next.id);
  }

  async function updateEntryTitle(nextTitle: string) {
    if (!entry || !nextTitle.trim()) return;
    setError(null);
    try {
      const updated = await apiFetch<Entry>(`/api/entries/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title_fr: nextTitle }),
      });
      setEntry(updated);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function savePhotoDraft(photo: EntryPhoto, silent = false) {
    if (!isDraftEditable(photo.status) || !photo.draft_fr.trim()) return null;
    if (silent) setDraftSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<EntryPhoto>(`/api/entries/${id}/photos/${photo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ draft_fr: photo.draft_fr }),
      });
      setPhotos((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      return updated;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      if (silent) setDraftSaving(false);
    }
  }

  async function generateJapanese() {
    if (!activePhoto?.draft_fr.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await savePhotoDraft(activePhoto);
      if (!saved) return;
      const updated = await apiFetch<EntryPhoto>(
        `/api/entries/${id}/photos/${activePhoto.id}/translate`,
        { method: "POST", body: "{}" },
      );
      setPhotos((current) =>
        current.map((photo) => (photo.id === updated.id ? { ...photo, ...updated } : photo)),
      );
      setJpIntentDraftByPhotoId((current) => ({
        ...current,
        [updated.id]: updated.jp_auto ?? "",
      }));
      setStepByPhotoId((current) => ({ ...current, [updated.id]: "jp_edit" }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmJapanese() {
    if (!activePhoto || !activeJpIntentDraft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<EntryPhoto>(
        `/api/entries/${id}/photos/${activePhoto.id}/lock_intent`,
        {
          method: "POST",
          body: JSON.stringify({ jp_intent: activeJpIntentDraft }),
        },
      );
      setPhotos((current) =>
        current.map((photo) => (photo.id === updated.id ? { ...photo, ...updated } : photo)),
      );
      setFinalDraftByPhotoId((current) => ({ ...current, [updated.id]: updated.final_fr ?? "" }));
      setAnnotationsByPhotoId((current) => ({
        ...current,
        [updated.id]: emptyCorrectionAnnotations(updated.final_fr ?? ""),
      }));
      setAnnotationDirtyByPhotoId((current) => ({ ...current, [updated.id]: false }));
      setStepByPhotoId((current) => ({ ...current, [updated.id]: "final" }));
      hintRequestedRef.current = entry?.id ?? id;
      void requestHints();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveFinalText() {
    if (!activePhoto || activePhoto.status === "EXPORTED" || !activeFinalDraft.trim()) return;
    setFinalSavingId(activePhoto.id);
    setFinalSavedId(null);
    setError(null);
    try {
      const textChanged = activeFinalDraft !== (activePhoto.final_fr ?? "");
      const nextAnnotations = textChanged
        ? emptyCorrectionAnnotations(activeFinalDraft)
        : activeAnnotations;
      const updated = await apiFetch<EntryPhoto>(`/api/entries/${id}/photos/${activePhoto.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          final_fr: activeFinalDraft,
          ...(textChanged ? { learning_highlights: nextAnnotations } : {}),
        }),
      });
      setPhotos((current) =>
        current.map((photo) => (photo.id === updated.id ? { ...photo, ...updated } : photo)),
      );
      setAnnotationsByPhotoId((current) => ({
        ...current,
        [updated.id]: normalizeCorrectionAnnotations(
          updated.learning_highlights ?? nextAnnotations,
          updated.final_fr ?? "",
        ),
      }));
      setAnnotationDirtyByPhotoId((current) => ({ ...current, [updated.id]: false }));
      setAnnotationSavedId(null);
      setFinalSavedId(updated.id);
      hintRequestedRef.current = entry?.id ?? id;
      void requestHints();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFinalSavingId(null);
    }
  }

  function updateAnnotations(photoId: string, next: CorrectionAnnotations) {
    setAnnotationsByPhotoId((current) => ({ ...current, [photoId]: next }));
    setAnnotationDirtyByPhotoId((current) => ({ ...current, [photoId]: true }));
    setAnnotationSavedId(null);
  }

  async function saveAnnotationsForPhoto(photoId: string, silent = false) {
    const photo = photos.find((item) => item.id === photoId);
    if (!photo?.final_fr) return null;
    const annotations = annotationsByPhotoId[photoId] ??
      normalizeCorrectionAnnotations(photo.learning_highlights, photo.final_fr);
    if (!silent) setAnnotationSavingId(photoId);
    setError(null);
    try {
      const updated = await apiFetch<EntryPhoto>(`/api/entries/${id}/photos/${photoId}`, {
        method: "PATCH",
        body: JSON.stringify({ learning_highlights: annotations }),
      });
      setPhotos((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setAnnotationDirtyByPhotoId((current) => ({ ...current, [photoId]: false }));
      setAnnotationSavedId(photoId);
      return updated;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      if (!silent) setAnnotationSavingId(null);
    }
  }

  async function requestHints() {
    setHintLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ suggestions: string[] }>(`/api/entries/${id}/memos/auto`);
      setHintSuggestions(result.suggestions);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setHintLoading(false);
    }
  }

  async function saveSelfNote(content: string) {
    const run = (async () => {
      const trimmed = content.trim();
      const selfNote = memos.find((memo) => memo.memo_type === "SELF_NOTE");
      setMemoSaving(true);
      setError(null);
      try {
        if (!trimmed && selfNote) {
          await apiFetch(`/api/memos/${selfNote.id}`, { method: "DELETE", body: "{}" });
        } else if (trimmed && selfNote) {
          await apiFetch(`/api/memos/${selfNote.id}`, {
            method: "PATCH",
            body: JSON.stringify({ content: trimmed }),
          });
        } else if (trimmed) {
          await apiFetch(`/api/entries/${id}/memos`, {
            method: "POST",
            body: JSON.stringify({ memo_type: "SELF_NOTE", content: trimmed }),
          });
        }
        const memoData = await apiFetch<{ memos: Memo[] }>(`/api/entries/${id}/memos`);
        setMemos(memoData.memos);
        setMemoPendingSave(false);
        setMemoSavedAt(Date.now());
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setMemoSaving(false);
      }
    })();
    memoSavePromiseRef.current = run;
    try {
      await run;
    } finally {
      if (memoSavePromiseRef.current === run) memoSavePromiseRef.current = null;
    }
  }

  async function exportFile(format: "pptx" | "pdf") {
    setBusy(true);
    setExportingFormat(format);
    setError(null);
    try {
      if (memoSavePromiseRef.current) await memoSavePromiseRef.current;
      else if (memoPendingSave) await saveSelfNote(memoDraft);
      const dirtyAnnotationIds = Object.entries(annotationDirtyByPhotoId)
        .filter(([, dirty]) => dirty)
        .map(([photoId]) => photoId);
      for (const photoId of dirtyAnnotationIds) {
        const saved = await saveAnnotationsForPhoto(photoId, true);
        if (!saved) return;
      }
      const result = await apiFetch<{ token: string }>(`/api/entries/${id}/export/${format}`, {
        method: "POST",
        body: JSON.stringify({ include_memos: true }),
      });
      setExportUrls((current) => ({
        ...current,
        [format]: `/api/exports/${result.token}/download`,
      }));
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setExportingFormat(null);
    }
  }

  if (!entry) {
    return <div className="card">{t("エントリーを読み込み中...", "Chargement de l’entrée...")}</div>;
  }

  return (
    <div className="page-stack editor-page">
      <header className="card editor-workspace-header">
        <div>
          <Link href="/" className="editor-back-link">
            {t("← エントリー一覧", "← Liste des entrées")}
          </Link>
          <div className="editor-title-row">
            <h1>{entry.title_fr || "PHOTO-TEXTE"}</h1>
            <span className="badge">{t(`${progress}% 完了`, `${progress}% terminé`)}</span>
          </div>
        </div>
        <nav className="editor-stepper" aria-label={t("編集ステップ", "Étapes de l’édition")}>
          {steps.map((step) => (
            <button
              key={step.key}
              type="button"
              className={`editor-step${activeStep === step.key ? " active" : ""}`}
              onClick={() => setActiveStep(step.key)}
              disabled={!canOpenStep(step.key)}
              aria-current={activeStep === step.key ? "step" : undefined}
            >
              {step.label}
            </button>
          ))}
        </nav>
      </header>

      {activePhoto ? (
        <>
          <div className="editor-photo-toolbar" aria-label={t("写真の切り替え", "Navigation des photos")}>
            <button
              type="button"
              className="btn-secondary editor-photo-arrow"
              onClick={() => goToPhoto(activePhotoIndex - 1)}
              disabled={activePhotoIndex <= 0}
            >
              {t("← 前の写真", "← Photo précédente")}
            </button>
            <div className="editor-photo-position">
              <strong>{t(`写真 ${activePhotoIndex + 1} / ${photos.length}`, `Photo ${activePhotoIndex + 1} / ${photos.length}`)}</strong>
              <span>{t(`ステップ ${steps.findIndex((step) => step.key === activeStep) + 1}`, `Étape ${steps.findIndex((step) => step.key === activeStep) + 1}`)}</span>
            </div>
            <button
              type="button"
              className="btn-secondary editor-photo-arrow"
              onClick={() => goToPhoto(activePhotoIndex + 1)}
              disabled={activePhotoIndex >= photos.length - 1}
            >
              {t("次の写真 →", "Photo suivante →")}
            </button>
          </div>

          {activeStep === "draft" ? (
            <div className="editor-stage-grid">
              <section className="card editor-stage-card">
                <div className="editor-card-heading">
                  <span className="editor-step-number">1</span>
                  <h2>{t("写真", "Photo")}</h2>
                </div>
                <PhotoPreview
                  photo={activePhoto}
                  unavailableLabel={t("プレビューを取得できません", "Prévisualisation indisponible")}
                />
              </section>
              <section className="card editor-stage-card">
                <div className="editor-card-heading">
                  <span className="editor-step-number">1</span>
                  <h2>{t("タイトルとフランス語", "Titre et texte français")}</h2>
                </div>
                <label>
                  {t("フランス語タイトル", "Titre en français")}
                  <input
                    value={entry.title_fr}
                    onChange={(event) => setEntry({ ...entry, title_fr: event.target.value })}
                    onBlur={() => void updateEntryTitle(entry.title_fr)}
                    maxLength={200}
                  />
                </label>
                <label>
                  {t(`写真 ${activePhoto.position} のフランス語テキスト`, `Texte français de la photo ${activePhoto.position}`)}
                  <textarea
                    rows={10}
                    value={activePhoto.draft_fr}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPhotos((current) =>
                        current.map((photo) =>
                          photo.id === activePhoto.id ? { ...photo, draft_fr: value } : photo,
                        ),
                      );
                    }}
                    onBlur={() => void savePhotoDraft(activePhoto, true)}
                    disabled={!isDraftEditable(activePhoto.status) || busy}
                    maxLength={8000}
                  />
                </label>
                {draftSaving ? <p className="badge">{t("保存中…", "Enregistrement…")}</p> : null}
                {!isDraftEditable(activePhoto.status) ? (
                  <p className="field-meta editor-field-note">
                    {t("日本語確定後のため、元のフランス語は読み取り専用です。", "Le français source est en lecture seule après validation du japonais.")}
                  </p>
                ) : null}
                <button type="button" onClick={() => void generateJapanese()} disabled={busy || !activePhoto.draft_fr.trim()}>
                  {busy ? t("日本語を生成中…", "Génération du japonais…") : t("日本語文を生成して次へ", "Générer le japonais et continuer")}
                </button>
              </section>
            </div>
          ) : null}

          {activeStep === "jp_edit" ? (
            <div className="editor-stage-grid">
              <section className="card editor-stage-card">
                <div className="editor-card-heading">
                  <span className="editor-step-number">2</span>
                  <h2>{t("写真とフランス語", "Photo et français")}</h2>
                </div>
                <PhotoPreview
                  photo={activePhoto}
                  unavailableLabel={t("プレビューを取得できません", "Prévisualisation indisponible")}
                />
                <p className="editor-source-text">{activePhoto.draft_fr}</p>
              </section>
              <section className="card editor-stage-card">
                <div className="editor-card-heading">
                  <span className="editor-step-number">2</span>
                  <h2>{t("日本語文を修正", "Corriger le texte japonais")}</h2>
                </div>
                <label>
                  {t("日本語文", "Texte japonais")}
                  <textarea
                    rows={12}
                    value={activeJpIntentDraft}
                    onChange={(event) =>
                      setJpIntentDraftByPhotoId((current) => ({
                        ...current,
                        [activePhoto.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="editor-card-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      setJpIntentDraftByPhotoId((current) => ({
                        ...current,
                        [activePhoto.id]: activePhoto.jp_auto ?? "",
                      }))
                    }
                  >
                    {t("元に戻す", "Rétablir la traduction")}
                  </button>
                  <button type="button" onClick={() => setActiveStep("jp_confirm")} disabled={!activeJpIntentDraft.trim()}>
                    {t("修正内容を確認", "Vérifier les corrections")}
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {activeStep === "jp_confirm" ? (
            <div className="editor-stage-grid">
              <section className="card editor-stage-card editor-compare-source">
                <div className="editor-card-heading">
                  <span className="editor-step-number">3</span>
                  <h2>{t("翻訳された日本語文", "Traduction japonaise")}</h2>
                </div>
                <p className="editor-comparison-text">{activePhoto.jp_auto}</p>
              </section>
              <section className="card editor-stage-card editor-compare-result">
                <div className="editor-card-heading">
                  <span className="editor-step-number">3</span>
                  <h2>{t("修正後の日本語文", "Japonais corrigé")}</h2>
                </div>
                <textarea
                  rows={12}
                  value={activeJpIntentDraft}
                  onChange={(event) =>
                    setJpIntentDraftByPhotoId((current) => ({
                      ...current,
                      [activePhoto.id]: event.target.value,
                    }))
                  }
                />
                <div className="editor-card-actions">
                  <button type="button" className="btn-secondary" onClick={() => setActiveStep("jp_edit")}>
                    {t("修正に戻る", "Revenir aux corrections")}
                  </button>
                  <button type="button" onClick={() => void confirmJapanese()} disabled={busy || !activeJpIntentDraft.trim()}>
                    {busy ? t("最終文を生成中…", "Génération du texte final…") : t("日本語文を確定", "Valider le texte japonais")}
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {activeStep === "final" ? (
            <div className="editor-final-stage">
              <div className="editor-card-heading editor-final-heading">
                <span className="editor-step-number">4</span>
                <h2>{t("元のフランス語と最終フランス語", "Français original et final")}</h2>
              </div>
              <EntryDiffComparison
                tokens={activeDiffTokens}
                afterTone="blue"
                beforeLabel={t("元のフランス語", "Français original")}
                afterLabel={t("最終フランス語", "Français final")}
                afterEditor={
                  <div className="editor-final-input">
                    <label>
                      {t("最終フランス語を編集", "Modifier le français final")}
                      <textarea
                        rows={8}
                        value={activeFinalDraft}
                        onChange={(event) => {
                          setFinalSavedId(null);
                          setFinalDraftByPhotoId((current) => ({
                            ...current,
                            [activePhoto.id]: event.target.value,
                          }));
                        }}
                        disabled={activePhoto.status === "EXPORTED"}
                      />
                    </label>
                    {activePhoto.status === "EXPORTED" ? (
                      <p className="field-meta editor-field-note">{t("出力済みのため編集できません。", "Ce texte ne peut plus être modifié après export.")}</p>
                    ) : (
                      <button type="button" onClick={() => void saveFinalText()} disabled={finalSavingId === activePhoto.id || !activeFinalDraft.trim()}>
                        {finalSavingId === activePhoto.id ? t("保存中…", "Enregistrement…") : t("最終フランス語を保存", "Enregistrer le français final")}
                      </button>
                    )}
                    {finalSavedId === activePhoto.id ? <p className="badge">{t("保存しました", "Enregistré")}</p> : null}
                  </div>
                }
              />
              {activePhoto.final_fr && activeFinalDraft === activePhoto.final_fr ? (
                <CorrectionAnnotationEditor
                  text={activePhoto.final_fr}
                  value={activeAnnotations}
                  dirty={Boolean(annotationDirtyByPhotoId[activePhoto.id])}
                  saving={annotationSavingId === activePhoto.id}
                  saved={annotationSavedId === activePhoto.id}
                  onChange={(next) => updateAnnotations(activePhoto.id, next)}
                  onSave={() => void saveAnnotationsForPhoto(activePhoto.id)}
                />
              ) : (
                <div className="card correction-annotation-pending">
                  <h2>{t("訂正ハイライト", "Repérage des corrections")}</h2>
                  <p>
                    {t(
                      "最終フランス語を保存すると、範囲指定と色付けができます。文章を変更した場合、以前の指定は消去されます。",
                      "Enregistrez d’abord le texte final pour définir les plages. Toute modification du texte efface les anciennes annotations.",
                    )}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <div className="card">{t("写真がありません。", "Aucune photo.")}</div>
      )}

      {hasFinalText ? (
        <div className="editor-support-grid">
          <section className="card editor-hints-card">
            <div className="editor-card-heading">
              <h2>{t("ヒント", "Conseils")}</h2>
              <span className="badge">{t("自動生成", "Générés automatiquement")}</span>
            </div>
            {hintLoading ? (
              <p>{t("ヒントを生成中…", "Génération des conseils…")}</p>
            ) : hintSuggestions.length ? (
              <ul className="editor-hint-list">
                {hintSuggestions.map((hint, index) => <li key={`${index}-${hint}`}>{hint}</li>)}
              </ul>
            ) : (
              <p className="timeline-detail">{t("ヒントはまだありません。", "Aucun conseil pour le moment.")}</p>
            )}
            <button type="button" className="btn-secondary" onClick={() => void requestHints()} disabled={hintLoading}>
              {t("ヒントを再生成", "Regénérer les conseils")}
            </button>
          </section>

          <section className="card editor-notes-card">
            <div className="editor-card-heading">
              <h2>{t("手書きメモ", "Notes personnelles")}</h2>
              <span className="badge">{t("PPTX・PDFに出力", "Incluses dans le PPTX et le PDF")}</span>
            </div>
            <textarea
              rows={8}
              value={memoDraft}
              onChange={(event) => {
                setMemoDraft(event.target.value);
                setMemoDraftTouched(true);
                setMemoPendingSave(true);
              }}
              placeholder={t("ヒントを参考に、自分の言葉でメモを書いてください。", "Écrivez vos propres notes en vous aidant des conseils.")}
            />
            <div className="editor-card-actions">
              <button type="button" onClick={() => void saveSelfNote(memoDraft)} disabled={memoSaving || !memoPendingSave}>
                {memoSaving ? t("保存中…", "Enregistrement…") : t("メモを保存", "Enregistrer les notes")}
              </button>
              {!memoSaving && !memoPendingSave && memoSavedAt ? <span className="badge">{t("保存済み", "Enregistré")}</span> : null}
            </div>
          </section>
        </div>
      ) : null}

      <section className="card editor-export-card">
        <div className="editor-card-heading">
          <h2>{t("提出用ファイル", "Fichiers à remettre")}</h2>
          <span className="badge">{exportReady ? t("出力可能", "Prêt") : t("未完了", "Incomplet")}</span>
        </div>
        <p className="timeline-detail">
          {exportReady
            ? t("すべての写真の最終文が完成しています。", "Tous les textes finaux sont prêts.")
            : t("すべての写真で最終フランス語まで完了してください。", "Terminez le français final pour chaque photo.")}
        </p>
        <div className="editor-export-formats">
          <div className="editor-export-format">
            <strong>PPTX</strong>
            <button type="button" onClick={() => void exportFile("pptx")} disabled={busy || !exportReady}>
              {exportingFormat === "pptx" ? t("生成中…", "Génération…") : t("PPTXを生成", "Générer le PPTX")}
            </button>
            {exportUrls.pptx ? <a href={exportUrls.pptx}>{t("PPTXをダウンロード", "Télécharger le PPTX")}</a> : null}
          </div>
          <div className="editor-export-format">
            <strong>PDF</strong>
            <button type="button" onClick={() => void exportFile("pdf")} disabled={busy || !exportReady}>
              {exportingFormat === "pdf" ? t("生成中…", "Génération…") : t("PDFを生成", "Générer le PDF")}
            </button>
            {exportUrls.pdf ? <a href={exportUrls.pdf}>{t("PDFをダウンロード", "Télécharger le PDF")}</a> : null}
          </div>
        </div>
      </section>

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
