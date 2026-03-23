"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api/fetcher";
import { getAccessToken } from "@/lib/auth/token-store";
import { useLanguage } from "@/components/LanguageProvider";
import { DiffReadOnly } from "@/components/DiffReadOnly";
import {
  buildLearningHighlights,
  LearningHighlights,
  normalizeLearningHighlights,
} from "@/lib/learning/highlight";
import { DiffToken } from "@/lib/diff/read-only";
import { CEFRLevel } from "@/lib/types";

type EntryStatus =
  | "DRAFT_FR"
  | "JP_AUTO_READY"
  | "JP_INTENT_LOCKED"
  | "FINAL_FR_READY"
  | "EXPORTED";

type Entry = {
  id: string;
  title_fr: string;
  // Legacy single-photo fields may exist; multi-photo uses entry_photos.
  draft_fr: string;
  jp_auto: string | null;
  jp_intent: string | null;
  final_fr: string | null;
  status: EntryStatus;
  created_at?: string;
  updated_at?: string;
};

type EntryPhoto = {
  id: string;
  entry_id: string;
  user_id: string;
  position: number; // 1-based
  photo_asset_id: string;
  draft_fr: string;
  jp_auto: string | null;
  jp_intent: string | null;
  final_fr: string | null;
  learning_highlights?: LearningHighlights | null;
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

type Profile = {
  cefr_level: CEFRLevel;
};

type PhotoDiff = {
  entry_id: string;
  photo_id: string;
  diff: {
    tokens: DiffToken[];
  };
  learning_highlights?: LearningHighlights;
};

const statusIndex: Record<EntryStatus, number> = {
  DRAFT_FR: 0,
  JP_AUTO_READY: 1,
  JP_INTENT_LOCKED: 2,
  FINAL_FR_READY: 3,
  EXPORTED: 4,
};

function pickFirstIncompleteIndex(photos: EntryPhoto[]): number {
  if (!photos.length) return 0;
  const idx = photos.findIndex(
    (p) => p.status !== "FINAL_FR_READY" && p.status !== "EXPORTED",
  );
  return idx >= 0 ? idx : 0;
}

function isDraftEditable(status: EntryStatus): boolean {
  return status === "DRAFT_FR" || status === "JP_AUTO_READY";
}

function canTranslatePhoto(p: EntryPhoto, busy: boolean): boolean {
  return !busy && isDraftEditable(p.status) && Boolean(p.draft_fr.trim());
}

function canLockIntentPhoto(
  p: EntryPhoto,
  busy: boolean,
  jpIntentDraft: string,
): boolean {
  return !busy && p.status === "JP_AUTO_READY" && Boolean(jpIntentDraft.trim());
}

function isExportReadyForAllPhotos(photos: EntryPhoto[]): boolean {
  if (!photos.length) return false;
  return photos.every(
    (p) =>
      (p.status === "FINAL_FR_READY" || p.status === "EXPORTED") &&
      Boolean(p.final_fr) &&
      Boolean(p.jp_auto),
  );
}



export function EntryWizard({ id }: { id: string }) {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === "fr" ? fr : ja);

  const [entry, setEntry] = useState<Entry | null>(null);
  const [photos, setPhotos] = useState<EntryPhoto[]>([]);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);

  const [memos, setMemos] = useState<Memo[]>([]);
  const [jpIntentDraftByPhotoId, setJpIntentDraftByPhotoId] = useState<
    Record<string, string>
  >({});

  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draftSaving, setDraftSaving] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoDraftTouched, setMemoDraftTouched] = useState(false);
  const [memoAutoLoading, setMemoAutoLoading] = useState(false);
  const [highlightRegeneratingId, setHighlightRegeneratingId] = useState<string | null>(null);
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoPendingSave, setMemoPendingSave] = useState(false);
  const [memoSavedAt, setMemoSavedAt] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const memoAutoRequestedRef = useRef<string | null>(null);
  const memoSavePromiseRef = useRef<Promise<void> | null>(null);
  const [diffLoadingId, setDiffLoadingId] = useState<string | null>(null);
  const [diffByPhotoId, setDiffByPhotoId] = useState<
    Record<
      string,
      {
        draft: string;
        final: string;
        tokens: DiffToken[];
        learningHighlights: LearningHighlights;
        cefrLevel: CEFRLevel;
      }
    >
  >({});
  const [diffErrorByPhotoId, setDiffErrorByPhotoId] = useState<
    Record<string, string>
  >({});
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightSaveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const autoTranslateInFlightRef = useRef<Record<string, boolean>>({});

  const draftCardRef = useRef<HTMLDivElement | null>(null);
  const jpAutoCardRef = useRef<HTMLDivElement | null>(null);
  const jpIntentCardRef = useRef<HTMLDivElement | null>(null);
  const finalCardRef = useRef<HTMLDivElement | null>(null);
  const exportCardRef = useRef<HTMLDivElement | null>(null);

  const initializedVisibleStepRef = useRef(false);
  const previousVisibleStepRef = useRef<string>("draft");

  const activePhoto = useMemo(() => {
    if (!photos.length) return null;
    if (!activePhotoId) return photos[0] ?? null;
    return photos.find((p) => p.id === activePhotoId) ?? photos[0] ?? null;
  }, [photos, activePhotoId]);

  const activeJpIntentDraft = useMemo(() => {
    if (!activePhoto) return "";
    return jpIntentDraftByPhotoId[activePhoto.id] ?? activePhoto.jp_auto ?? "";
  }, [activePhoto, jpIntentDraftByPhotoId]);

  const exportReady = useMemo(
    () => isExportReadyForAllPhotos(photos),
    [photos],
  );

  const activeLearningHighlights = useMemo(() => {
    if (!activePhoto?.final_fr) return { knownWords: [], unknownWords: [], grammarWords: [] };
    const cached = activePhoto ? diffByPhotoId[activePhoto.id]?.learningHighlights : null;
    const cachedLevel = activePhoto ? diffByPhotoId[activePhoto.id]?.cefrLevel : null;
    if (cached && cachedLevel === (profile?.cefr_level ?? "A2")) return cached;
    const saved = normalizeLearningHighlights(activePhoto.learning_highlights);
    if (saved) return saved;
    return buildLearningHighlights(
      activePhoto.draft_fr ?? "",
      activePhoto.final_fr ?? "",
      profile?.cefr_level ?? "A2",
    );
  }, [
    activePhoto?.id,
    activePhoto?.draft_fr,
    activePhoto?.final_fr,
    diffByPhotoId,
    profile?.cefr_level,
  ]);

  useEffect(() => {
    return () => {
      Object.values(highlightSaveTimerRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const progress = useMemo(() => {
    if (!photos.length) return 0;
    const done = photos.filter(
      (p) => p.status === "FINAL_FR_READY" || p.status === "EXPORTED",
    ).length;
    return Math.round((done / photos.length) * 100);
  }, [photos]);

  const statusLabel: Record<EntryStatus, string> = useMemo(
    () => ({
      DRAFT_FR: t("下書き入力中", "Brouillon en cours"),
      JP_AUTO_READY: t("日本語文を確認中", "Vérif. du japonais"),
      JP_INTENT_LOCKED: t("最終文を生成中", "Final en cours"),
      FINAL_FR_READY: t("最終文の確認完了", "Final validé"),
      EXPORTED: t("提出資料を出力済み", "Export effectué"),
    }),
    [language],
  );

  const steps = useMemo(
    () => [
      {
        key: "DRAFT_FR",
        title: t("1. 下書きを入力", "1. Saisir le brouillon"),
        detail: t(
          "写真を選択し、その写真について文章を書きます",
          "Choisissez une photo et écrivez le texte.",
        ),
      },
      {
        key: "JP_AUTO_READY",
        title: t("2. 日本語文を確認", "2. Vérifier le texte japonais"),
        detail: t(
          "フランス語から自動で日本語文を作成します",
          "Le japonais est généré depuis le français.",
        ),
      },
      {
        key: "JP_INTENT_LOCKED",
        title: t("3. 日本語文を確定", "3. Valider le texte japonais"),
        detail: t(
          "確定後に最終フランス語を生成します",
          "La validation déclenche le français final.",
        ),
      },
      {
        key: "FINAL_FR_READY",
        title: t("4. 最終文を確認", "4. Vérifier le texte final"),
        detail: t(
          "最終文は自動生成され、編集できません",
          "Le texte final est généré automatiquement et non modifiable.",
        ),
      },
      {
        key: "EXPORTED",
        title: t("5. 提出資料を出力", "5. Exporter le dossier"),
        detail: t(
          "PPTXをダウンロードして提出します",
          "Téléchargez le PPTX pour le rendre.",
        ),
      },
    ],
    [language],
  );

  async function loadAll() {
    const [entryData, photosData, memoData, profileData] = await Promise.all([
      apiFetch<Entry>(`/api/entries/${id}`),
      apiFetch<{ entry_id: string; photos: EntryPhoto[] }>(`/api/entries/${id}/photos`),
      apiFetch<{ memos: Memo[] }>(`/api/entries/${id}/memos`).catch(() => ({ memos: [] })),
      apiFetch<Profile>(`/api/me`).catch(() => ({ cefr_level: "A2" as CEFRLevel })),
    ]);

    setEntry(entryData);

    const list = (photosData.photos ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    setPhotos(list);

    setMemos(memoData.memos);
    setProfile({ cefr_level: profileData.cefr_level ?? "A2" });
    const selfNote = (memoData.memos ?? []).find((m) => m.memo_type === "SELF_NOTE");
    if (!memoDraftTouched) setMemoDraft(selfNote?.content ?? "");

    // Initialize active photo if not set.
    setActivePhotoId((current) => {
      if (current && list.some((p) => p.id === current)) return current;
      const idx = pickFirstIncompleteIndex(list);
      return list[idx]?.id ?? list[0]?.id ?? null;
    });

    // Initialize jpIntent drafts per photo, if missing.
    setJpIntentDraftByPhotoId((prev) => {
      const next = { ...prev };
      for (const p of list) {
        const fallback = p.jp_intent ?? p.jp_auto ?? "";
        if (next[p.id] === undefined || (!next[p.id].trim() && fallback.trim())) {
          next[p.id] = fallback;
        }
      }
      return next;
    });
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    setMemoDraft("");
    setMemoDraftTouched(false);
    setMemoPendingSave(false);
    setMemoSavedAt(null);
    memoAutoRequestedRef.current = null;
    loadAll().catch((err) => setError((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  // Auto-save draft_fr per photo (debounced) while editable.
  useEffect(() => {
    if (!activePhoto) return;
    if (!isDraftEditable(activePhoto.status)) return;

    if (!activePhoto.draft_fr.trim()) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void updateActivePhotoDraft({ autoTranslate: true, silent: true });
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePhoto?.id, activePhoto?.draft_fr, activePhoto?.status]);

  const currentIndex = useMemo(() => {
    if (!activePhoto) return 0;
    return statusIndex[activePhoto.status];
  }, [activePhoto]);

  const draftDone = currentIndex >= statusIndex.JP_AUTO_READY;
  const jpAutoDone = currentIndex >= statusIndex.JP_INTENT_LOCKED;
  const jpIntentDone = currentIndex >= statusIndex.FINAL_FR_READY;
  const finalDone = Boolean(activePhoto?.final_fr);
  const exportDone = Boolean(exportUrl);

  const showJpAutoCard = Boolean(
    activePhoto && currentIndex >= statusIndex.JP_AUTO_READY,
  );
  const showJpIntentCard = Boolean(
    activePhoto && currentIndex >= statusIndex.JP_AUTO_READY,
  );
  const showFinalCard = Boolean(
    activePhoto &&
    (currentIndex >= statusIndex.JP_INTENT_LOCKED ||
      Boolean(activePhoto.final_fr)),
  );
  const showExportCard = exportReady;

  const canTranslate = useMemo(() => {
    if (!activePhoto) return false;
    return canTranslatePhoto(activePhoto, busy) && !draftSaving;
  }, [activePhoto, busy, draftSaving]);

  const visibleStepKey = showExportCard
    ? "export"
    : showFinalCard
      ? "final"
      : activePhoto?.status === "JP_AUTO_READY"
        ? "jpAuto"
        : showJpIntentCard
          ? "jpIntent"
          : showJpAutoCard
            ? "jpAuto"
            : "draft";

  useEffect(() => {
    if (!activePhoto) return;

    if (!initializedVisibleStepRef.current) {
      initializedVisibleStepRef.current = true;
      previousVisibleStepRef.current = visibleStepKey;
      return;
    }
    if (previousVisibleStepRef.current === visibleStepKey) return;
    previousVisibleStepRef.current = visibleStepKey;

    const target =
      visibleStepKey === "export"
        ? exportCardRef.current
        : visibleStepKey === "final"
          ? finalCardRef.current
          : visibleStepKey === "jpIntent"
            ? jpIntentCardRef.current
            : visibleStepKey === "jpAuto"
              ? jpAutoCardRef.current
              : draftCardRef.current;

    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activePhoto?.id, visibleStepKey]);

  useEffect(() => {
    if (!entry) return;
    if (memoAutoRequestedRef.current === entry.id) return;
    if (memoDraftTouched || memoDraft.trim()) return;

    const hasFinal = photos.some((p) => (p.final_fr ?? "").trim());
    if (!hasFinal) return;

    memoAutoRequestedRef.current = entry.id;
    void requestAutoMemo({ overwriteExisting: false, markAsTouched: false });
  }, [entry, id, memoDraft, memoDraftTouched, photos]);

  useEffect(() => {
    if (!activePhoto) return;
    if (!activePhoto.final_fr) return;

    const draft = activePhoto.draft_fr ?? "";
    const final = activePhoto.final_fr ?? "";
    const cefrLevel = profile?.cefr_level ?? "A2";
    const cached = diffByPhotoId[activePhoto.id];
    if (
      cached &&
      cached.draft === draft &&
      cached.final === final &&
      cached.cefrLevel === cefrLevel
    ) return;

    setDiffLoadingId(activePhoto.id);
    setDiffErrorByPhotoId((prev) => {
      const next = { ...prev };
      delete next[activePhoto.id];
      return next;
    });

    apiFetch<PhotoDiff>(`/api/entries/${id}/photos/${activePhoto.id}/diff`)
      .then((res) => {
        const learningHighlights =
          normalizeLearningHighlights(res.learning_highlights) ??
          normalizeLearningHighlights(activePhoto.learning_highlights) ??
          buildLearningHighlights(draft, final, cefrLevel);

        setDiffByPhotoId((prev) => ({
          ...prev,
          [activePhoto.id]: {
            draft,
            final,
            tokens: res.diff.tokens,
            cefrLevel,
            learningHighlights,
          },
        }));
      })
      .catch((err) => {
        setDiffErrorByPhotoId((prev) => ({
          ...prev,
          [activePhoto.id]: (err as Error).message,
        }));
      })
      .finally(() => {
        setDiffLoadingId((current) =>
          current === activePhoto.id ? null : current,
        );
      });
  }, [activePhoto?.id, activePhoto?.draft_fr, activePhoto?.final_fr, id, profile?.cefr_level]);

  function scheduleLearningHighlightsSave(
    photoId: string,
    learningHighlights: LearningHighlights,
  ) {
    const existingTimer = highlightSaveTimerRef.current[photoId];
    if (existingTimer) clearTimeout(existingTimer);

    highlightSaveTimerRef.current[photoId] = setTimeout(async () => {
      try {
        const updated = await apiFetch<EntryPhoto>(
          `/api/entries/${id}/photos/${photoId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ learning_highlights: learningHighlights }),
          },
        );

        setPhotos((prev) =>
          prev.map((photo) => (photo.id === updated.id ? { ...photo, ...updated } : photo)),
        );
      } catch (err) {
        setError((err as Error).message);
      } finally {
        delete highlightSaveTimerRef.current[photoId];
      }
    }, 500);
  }

  function handleLearningHighlightsChange(
    photoId: string,
    learningHighlights: LearningHighlights,
  ) {
    setDiffByPhotoId((prev) => {
      const current = prev[photoId];
      if (!current) return prev;
      return {
        ...prev,
        [photoId]: {
          ...current,
          learningHighlights,
        },
      };
    });

    setPhotos((prev) =>
      prev.map((photo) =>
        photo.id === photoId
          ? { ...photo, learning_highlights: learningHighlights }
          : photo,
      ),
    );

    scheduleLearningHighlightsSave(photoId, learningHighlights);
  }

  async function regenerateLearningHighlights(photoId: string) {
    if (!window.confirm(
      t(
        "現在の訂正ハイライトは消えて、自動色付けをやり直します。よろしいですか？",
        "Le surlignage actuel sera effacé et recalculé automatiquement. Continuer ?",
      ),
    )) {
      return;
    }

    const photo = photos.find((p) => p.id === photoId);
    if (!photo?.final_fr) return;

    setHighlightRegeneratingId(photoId);
    setError(null);
    try {
      const res = await apiFetch<PhotoDiff>(`/api/entries/${id}/photos/${photoId}/diff?refresh=1`);
      const learningHighlights =
        normalizeLearningHighlights(res.learning_highlights) ??
        buildLearningHighlights(photo.draft_fr ?? "", photo.final_fr ?? "", profile?.cefr_level ?? "A2");
      handleLearningHighlightsChange(photoId, learningHighlights);
      setDiffByPhotoId((prev) => ({
        ...prev,
        [photoId]: {
          draft: photo.draft_fr ?? "",
          final: photo.final_fr ?? "",
          tokens: res.diff.tokens,
          cefrLevel: profile?.cefr_level ?? "A2",
          learningHighlights,
        },
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setHighlightRegeneratingId((current) => current === photoId ? null : current);
    }
  }

  async function requestAutoMemo(options: {
    overwriteExisting: boolean;
    markAsTouched: boolean;
  }) {
    const existing = memoDraft.trim();
    if (options.overwriteExisting && existing) {
      const confirmed = window.confirm(
        t(
          "今のメモ内容は上書きされます。自動生成をやり直しますか？",
          "Le contenu actuel des notes sera remplacé. Relancer la génération automatique ?",
        ),
      );
      if (!confirmed) return;
    }

    setMemoAutoLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ suggestions: string[] }>(`/api/entries/${id}/memos/auto`);
      if (!res.suggestions.length) return;
      setMemoDraft(res.suggestions.join("\n"));
      setMemoPendingSave(true);
      if (options.markAsTouched) setMemoDraftTouched(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMemoAutoLoading(false);
    }
  }

  async function updateEntryTitle(nextTitle: string) {
    if (!entry) return;
    setEntry({ ...entry, title_fr: nextTitle });
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<Entry>(`/api/entries/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title_fr: nextTitle }),
      });
      setEntry(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateActivePhotoDraft(options?: {
    autoTranslate?: boolean;
    silent?: boolean;
  }) {
    if (!activePhoto) return;
    if (!isDraftEditable(activePhoto.status)) return;

    const silent = options?.silent ?? false;
    if (!silent) setBusy(true);
    else setDraftSaving(true);

    setError(null);

    try {
      const updated = await apiFetch<EntryPhoto>(
        `/api/entries/${id}/photos/${activePhoto.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ draft_fr: activePhoto.draft_fr }),
        },
      );

      setPhotos((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );

      if (
        options?.autoTranslate &&
        (updated.status === "DRAFT_FR" || updated.status === "JP_AUTO_READY")
      ) {
        await translatePhoto(updated.id, { auto: true });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!silent) setBusy(false);
      else setDraftSaving(false);
    }
  }

  async function translatePhoto(photoId: string, options?: { auto?: boolean }) {
    if (options?.auto) {
      if (autoTranslateInFlightRef.current[photoId]) return;
      autoTranslateInFlightRef.current[photoId] = true;
    }

    setBusy(true);
    setError(null);

    try {
      const updated = await apiFetch<EntryPhoto>(
        `/api/entries/${id}/photos/${photoId}/translate`,
        {
          method: "POST",
          body: "{}",
        },
      );

      setPhotos((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );

      setJpIntentDraftByPhotoId((prev) => ({
        ...prev,
        [updated.id]: updated.jp_intent ?? updated.jp_auto ?? "",
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (options?.auto) autoTranslateInFlightRef.current[photoId] = false;
    }
  }

  async function lockIntentPhoto(photoId: string) {
    const jpIntent = jpIntentDraftByPhotoId[photoId] ?? "";
    setBusy(true);
    setError(null);

    try {
      const updated = await apiFetch<EntryPhoto>(
        `/api/entries/${id}/photos/${photoId}/lock_intent`,
        {
          method: "POST",
          body: JSON.stringify({ jp_intent: jpIntent }),
        },
      );

      setPhotos((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );

      // Refresh memos/entry photos status (diff/unknown words are not implemented for multi-photo yet)
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSelfNote(content: string) {
    const run = (async () => {
      const trimmed = content.trim();
      const selfNote = memos.find((m) => m.memo_type === "SELF_NOTE");

      setMemoSaving(true);
      setError(null);
      try {
        if (!trimmed) {
          if (selfNote) {
            await apiFetch(`/api/memos/${selfNote.id}`, { method: "DELETE", body: "{}" });
          }
          await loadAll();
          setMemoPendingSave(false);
          setMemoSavedAt(Date.now());
          return;
        }

        if (selfNote) {
          await apiFetch(`/api/memos/${selfNote.id}`, {
            method: "PATCH",
            body: JSON.stringify({ content: trimmed }),
          });
        } else {
          await apiFetch(`/api/entries/${id}/memos`, {
            method: "POST",
            body: JSON.stringify({ memo_type: "SELF_NOTE", content: trimmed }),
          });
        }
        await loadAll();
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
      if (memoSavePromiseRef.current === run) {
        memoSavePromiseRef.current = null;
      }
    }
  }


  useEffect(() => {
    if (!entry || !memoDraftTouched || !memoPendingSave) return;
    const timer = setTimeout(() => {
      void saveSelfNote(memoDraft);
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoDraft, memoDraftTouched, memoPendingSave, entry?.id]);

  async function exportPptx() {
    setBusy(true);
    setError(null);
    try {
      if (memoSavePromiseRef.current) {
        await memoSavePromiseRef.current;
      } else if (memoPendingSave) {
        await saveSelfNote(memoDraft);
      }

      const result = await apiFetch<{ token: string }>(
        `/api/entries/${id}/export/pptx`,
        {
          method: "POST",
          body: JSON.stringify({ include_memos: true }),
        },
      );
      setExportUrl(`/api/exports/${result.token}/download`);
      await loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!entry) {
    return (
      <div className="card">
        {t("エントリーを読み込み中...", "Chargement de l’entrée...")}
      </div>
    );
  }

  return (
    <div className="wizard-shell">
      <aside className="card timeline desktop-only">
        <h3>{t("進捗", "Progression")}</h3>
        <p className="badge">
          {t(`${progress}% 完了`, `${progress}% terminé`)}
        </p>
        <div className="timeline-detail">
          {t(
            "写真ごとに進捗が進みます。",
            "La progression avance photo par photo.",
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <strong>{t("写真", "Photos")}</strong>
          <div
            style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}
          >
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                className={
                  activePhoto?.id === p.id ? "pill pill-active" : "pill"
                }
                onClick={() => setActivePhotoId(p.id)}
                style={{ width: "auto", margin: 0 }}
              >
                {t("写真", "Photo")} {p.position} · {statusLabel[p.status]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {steps.map((step) => (
            <div key={step.key} className="timeline-step">
              <strong>{step.title}</strong>
              <div className="timeline-detail">{step.detail}</div>
            </div>
          ))}
        </div>

        <p>
          <Link href="/">{t("一覧に戻る", "Retour à la liste")}</Link>
        </p>
      </aside>

      <section>
        <div className="mobile-progress">
          <div className="mobile-progress-row">
            <strong>
              {t(`進捗 ${progress}%`, `Progression ${progress}%`)}
            </strong>
            <span className="badge">
              {activePhoto
                ? `${t("写真", "Photo")} ${activePhoto.position} · ${statusLabel[activePhoto.status]}`
                : statusLabel[entry.status]}
            </span>
          </div>
          <div className="progress-track" aria-hidden>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div
            style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}
          >
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                className={
                  activePhoto?.id === p.id ? "pill pill-active" : "pill"
                }
                onClick={() => setActivePhotoId(p.id)}
                style={{ width: "auto", margin: 0 }}
              >
                {t("写真", "Photo")} {p.position}
              </button>
            ))}
          </div>
        </div>

        <div className="card hero desktop-only">
          <div className="hero-title-row">
            <h1>{entry.title_fr || "PHOTO-TEXTE"}</h1>
            <span className="badge">
              {t(`写真 ${photos.length}枚`, `${photos.length} photos`)}
            </span>
          </div>
          <div className="metric-grid">
            <div className="metric">
              <span>{t("進捗(全体)", "Progression (global)")}</span>
              <strong>{progress}%</strong>
            </div>
            <div className="metric">
              <span>{t("メモ", "Notes")}</span>
              <strong>
                {memos.filter((m) => m.memo_type === "SELF_NOTE").length}
              </strong>
            </div>
            <div className="metric">
              <span>{t("エクスポート", "Export")}</span>
              <strong>{exportReady ? t("可能", "OK") : t("未", "Non")}</strong>
            </div>
          </div>
        </div>

        <div className="card step-card">
          <div className="step-head">
            <h3>{t("タイトル", "Titre")}</h3>
          </div>
          <label>
            {t("タイトル（フランス語）", "Titre (français)")}
            <input
              value={entry.title_fr}
              onChange={(e) => setEntry({ ...entry, title_fr: e.target.value })}
              onBlur={() => void updateEntryTitle(entry.title_fr)}
              disabled={busy}
              maxLength={200}
            />
          </label>
          <p className="timeline-detail">
            {t(
              "タイトルはエントリー全体で共通です。",
              "Le titre est commun à toute l’entrée.",
            )}
          </p>
        </div>

        {activePhoto ? (
          <div className="card" style={{ padding: 12 }}>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div className="entry-photo-panel">
                {activePhoto.photo_preview_url ? (
                  <img
                    src={activePhoto.photo_preview_url}
                    alt={`photo-${activePhoto.position}`}
                    style={{
                      width: "100%",
                      height: "auto",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                    }}
                  />
                ) : (
                  <div className="badge">
                    {t(
                      "プレビューを取得できません",
                      "Prévisualisation indisponible",
                    )}
                  </div>
                )}
                <p className="badge" style={{ marginTop: 10 }}>
                  {t("選択中:", "Sélection :")} {t("写真", "Photo")}{" "}
                  {activePhoto.position} · {statusLabel[activePhoto.status]}
                </p>
              </div>

              <div className="entry-photo-content">
                <div
                  ref={draftCardRef}
                  className={`card step-card${draftDone ? " step-done" : ""}`}
                  style={{ marginBottom: 12 }}
                >
                  <div className="step-head">
                    <h3>
                      {t(
                        `下書き（写真 ${activePhoto.position}）`,
                        `Brouillon (photo ${activePhoto.position})`,
                      )}
                    </h3>
                    {draftDone ? <span className="step-check">✓</span> : null}
                  </div>

                  <label>
                    {t(
                      "下書き本文（フランス語）",
                      "Texte du brouillon (français)",
                    )}
                    <textarea
                      rows={8}
                      value={activePhoto.draft_fr}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPhotos((prev) =>
                          prev.map((p) =>
                            p.id === activePhoto.id
                              ? { ...p, draft_fr: value }
                              : p,
                          ),
                        );
                      }}
                      disabled={!isDraftEditable(activePhoto.status) || busy}
                      maxLength={8000}
                    />
                  </label>

                  {draftSaving ? (
                    <p className="badge">
                      {t("自動保存しています…", "Enregistrement auto…")}
                    </p>
                  ) : null}

                  {!isDraftEditable(activePhoto.status) ? (
                    <p className="badge">
                      {t(
                        "日本語文の確定後は編集できません",
                        "Impossible après validation du japonais.",
                      )}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() =>
                      void updateActivePhotoDraft({ autoTranslate: true })
                    }
                    disabled={!canTranslate}
                  >
                    {t("日本語文を生成", "Générer le texte japonais")}
                  </button>
                </div>

                {showJpAutoCard ? (
                  <div
                    ref={jpAutoCardRef}
                    className={`card step-card${jpAutoDone ? " step-done" : ""}`}
                    style={{ marginBottom: 12 }}
                  >
                    <div className="step-head">
                      <h3>{t("日本語文（自動）", "Texte japonais (auto)")}</h3>
                      {jpAutoDone ? (
                        <span className="step-check">✓</span>
                      ) : null}
                    </div>
                    <textarea
                      rows={6}
                      value={activePhoto.jp_auto ?? ""}
                      readOnly
                    />
                    <p className="timeline-detail">
                      {t(
                        "この内容は下の「日本語文を確定」にも自動で入ります。",
                        "Ce contenu est recopié automatiquement dans « Valider le texte japonais » ci-dessous.",
                      )}
                    </p>
                  </div>
                ) : null}

                {showJpIntentCard ? (
                  <div
                    ref={jpIntentCardRef}
                    className={`card step-card${jpIntentDone ? " step-done" : ""}`}
                    style={{ marginBottom: 12 }}
                  >
                    <div className="step-head">
                      <h3>
                        {t("日本語文を確定", "Valider le texte japonais")}
                      </h3>
                      {jpIntentDone ? (
                        <span className="step-check">✓</span>
                      ) : null}
                    </div>

                    {activePhoto.status === "JP_AUTO_READY" ? (
                      <>
                        <textarea
                          rows={6}
                          value={activeJpIntentDraft}
                          onChange={(e) => {
                            const value = e.target.value;
                            setJpIntentDraftByPhotoId((prev) => ({
                              ...prev,
                              [activePhoto.id]: value,
                            }));
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void lockIntentPhoto(activePhoto.id)}
                          disabled={
                            !canLockIntentPhoto(
                              activePhoto,
                              busy,
                              activeJpIntentDraft,
                            )
                          }
                        >
                          {t("日本語文を確定", "Valider le texte japonais")}
                        </button>
                      </>
                    ) : (
                      <textarea
                        rows={6}
                        value={activePhoto.jp_intent ?? activeJpIntentDraft}
                        readOnly
                      />
                    )}
                  </div>
                ) : null}

                {showFinalCard ? (
                  <div
                    ref={finalCardRef}
                    className={`card step-card${finalDone ? " step-done" : ""}`}
                    style={{ marginBottom: 12 }}
                  >
                    <div className="step-head">
                      <h3>{t("最終フランス語", "Français final")}</h3>
                      {finalDone ? <span className="step-check">✓</span> : null}
                    </div>
                    {activePhoto.status === "JP_INTENT_LOCKED" &&
                    !activePhoto.final_fr ? (
                      <p className="badge">
                        {t(
                          "最終フランス語を自動生成しています…",
                          "Génération du français final…",
                        )}
                      </p>
                    ) : null}
                    <textarea
                      rows={6}
                      value={activePhoto.final_fr ?? ""}
                      readOnly
                    />
                  </div>
                ) : null}

                {activePhoto.final_fr ? (
                  diffErrorByPhotoId[activePhoto.id] ? (
                    <div className="card">
                      <h3>{t("訂正ハイライト", "Surlignage des corrections")}</h3>
                      <p className="badge">
                        {t(
                          "訂正ハイライトの読み込みに失敗しました。",
                          "Échec du chargement du surlignage des corrections.",
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => void regenerateLearningHighlights(activePhoto.id)}
                        disabled={highlightRegeneratingId === activePhoto.id}
                      >
                        {highlightRegeneratingId === activePhoto.id
                          ? t("自動色付けをやり直し中…", "Recalcul du surlignage…")
                          : t("自動色付けをやり直す", "Relancer le surlignage auto")}
                      </button>
                    </div>
                  ) : diffByPhotoId[activePhoto.id]?.tokens ? (
                    <>
                      <DiffReadOnly
                        tokens={diffByPhotoId[activePhoto.id].tokens}
                        knownWords={activeLearningHighlights.knownWords}
                        unknownWords={activeLearningHighlights.unknownWords}
                        grammarWords={activeLearningHighlights.grammarWords}
                        savedTokenSignature={activeLearningHighlights.tokenSignature}
                        savedWordClassByKey={activeLearningHighlights.wordClassByKey}
                        onLearningHighlightsChange={(next) =>
                          handleLearningHighlightsChange(activePhoto.id, next)
                        }
                        showLegend
                        interactiveWordHighlight
                        showDiffColors={false}
                      />
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => void regenerateLearningHighlights(activePhoto.id)}
                          disabled={highlightRegeneratingId === activePhoto.id}
                        >
                          {highlightRegeneratingId === activePhoto.id
                            ? t("自動色付けをやり直し中…", "Recalcul du surlignage…")
                            : t("自動色付けをやり直す", "Relancer le surlignage auto")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="card">
                      <h3>{t("訂正ハイライト", "Surlignage des corrections")}</h3>
                      <p className="badge">
                        {diffLoadingId === activePhoto.id
                          ? t("訂正ハイライトを読み込み中…", "Chargement du surlignage des corrections…")
                          : t("訂正ハイライトを準備中…", "Préparation du surlignage des corrections…")}
                      </p>
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="card">
            {t(
              "写真がありません。新規作成から写真を追加してください。",
              "Aucune photo. Ajoutez des photos lors de la création.",
            )}
          </div>
        )}

        <div className="card">
          <h3>{t("メモ", "Notes")}</h3>
          <p className="timeline-detail">
            {t(
              "ここに書いた内容は、PPTXの最後のスライドに箇条書きで出力されます。",
              "Ce contenu apparaîtra en puces sur la dernière diapositive du PPTX.",
            )}
          </p>

          <textarea
            rows={6}
            value={memoDraft}
            onChange={(e) => {
              setMemoDraft(e.target.value);
              setMemoDraftTouched(true);
              setMemoPendingSave(true);
            }}
            placeholder={t(
              "メモを自由に書くと自動保存されます（改行OK）",
              "Écrivez librement vos notes (sauvegarde auto).",
            )}
          />
          {memoAutoLoading && !memoDraftTouched && !memoDraft.trim() ? (
            <p className="badge">{t("メモを自動生成中…", "Génération des notes…")}</p>
          ) : null}
          {memoSaving ? <p className="badge">{t("自動保存中…", "Sauvegarde automatique…")}</p> : null}
          {!memoSaving && !memoPendingSave && memoSavedAt ? (
            <p className="badge">{t("自動保存済み", "Sauvegarde auto terminée")}</p>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void saveSelfNote(memoDraft)}
              disabled={memoSaving || !memoPendingSave}
            >
              {t("保存", "Enregistrer")}
            </button>
            <button
              type="button"
              onClick={() => void requestAutoMemo({ overwriteExisting: true, markAsTouched: true })}
              disabled={memoAutoLoading || !photos.some((p) => (p.final_fr ?? "").trim())}
            >
              {memoAutoLoading
                ? t("メモを自動生成中…", "Génération des notes…")
                : t("メモの自動生成をやり直す", "Relancer la génération des notes")}
            </button>
          </div>
        </div>

        <div
          ref={exportCardRef}
          className={`card step-card${exportDone ? " step-done" : ""}`}
        >
          <div className="step-head">
            <h3>{t("提出用PPTXを出力", "Exporter le PPTX")}</h3>
            {exportDone ? <span className="step-check">✓</span> : null}
          </div>

          {exportReady ? (
            <p className="badge">
              {t(
                "全ての写真が完了しました。エクスポートできます。",
                "Toutes les photos sont prêtes. Vous pouvez exporter.",
              )}
            </p>
          ) : (
            <p className="badge">
              {t(
                "未完了の写真があります。すべての写真で最終文まで完了してください。",
                "Certaines photos ne sont pas prêtes. Terminez toutes les photos.",
              )}
            </p>
          )}

          <button
            type="button"
            onClick={exportPptx}
            disabled={busy || !exportReady}
          >
            {t("エクスポートを生成", "Générer l'export")}
          </button>

          {exportUrl ? (
            <p>
              <a href={exportUrl}>
                {t("最新PPTXをダウンロード", "Télécharger le PPTX")}
              </a>
            </p>
          ) : null}
        </div>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </div>
  );
}
