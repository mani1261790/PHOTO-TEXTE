"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiFetch, apiFetchForm } from "@/lib/api/fetcher";
import { getAccessToken } from "@/lib/auth/token-store";
import { useLanguage } from "@/components/LanguageProvider";

const NEW_ENTRY_DRAFT_STORAGE_KEY = "photo-texte:new-entry-draft:v1";

type PhotoDraft = {
  file: File;
  previewUrl: string;
  draftFr: string;
};

type NewEntryAutoDraft = {
  titleFr: string;
  draftByPhotoKey: Record<string, string>;
  updatedAt: string;
};

function photoDraftKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export default function NewEntryPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === "fr" ? fr : ja);

  const [titleFr, setTitleFr] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [savedDraftByPhotoKey, setSavedDraftByPhotoKey] = useState<
    Record<string, string>
  >({});

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(NEW_ENTRY_DRAFT_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as NewEntryAutoDraft;
      setTitleFr(parsed.titleFr ?? "");
      setSavedDraftByPhotoKey(parsed.draftByPhotoKey ?? {});
    } catch {
      // Ignore invalid cached content.
    }
  }, []);

  // Cleanup object URLs on unmount / when photos list changes.
  useEffect(() => {
    return () => {
      for (const p of photos) {
        try {
          URL.revokeObjectURL(p.previewUrl);
        } catch {
          // no-op
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Ensure active index is always valid.
    if (photos.length === 0) {
      setActiveIndex(0);
    } else if (activeIndex > photos.length - 1) {
      setActiveIndex(photos.length - 1);
    }
  }, [photos.length, activeIndex]);

  const activePhoto = photos[activeIndex] ?? null;

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (!titleFr.trim()) return false;
    if (photos.length === 0) return false;
    if (photos.length > 10) return false;
    if (photos.some((p) => !p.draftFr.trim())) return false;
    return true;
  }, [busy, titleFr, photos]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const timer = setTimeout(() => {
      const draftByPhotoKey = Object.fromEntries(
        photos
          .map((p) => [photoDraftKey(p.file), p.draftFr] as const)
          .filter(([, value]) => Boolean(value.trim())),
      );

      if (!titleFr.trim() && Object.keys(draftByPhotoKey).length === 0) {
        window.localStorage.removeItem(NEW_ENTRY_DRAFT_STORAGE_KEY);
        setSavedDraftByPhotoKey({});
        return;
      }

      const payload: NewEntryAutoDraft = {
        titleFr,
        draftByPhotoKey,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(
        NEW_ENTRY_DRAFT_STORAGE_KEY,
        JSON.stringify(payload),
      );
      setSavedDraftByPhotoKey(draftByPhotoKey);
    }, 500);

    return () => clearTimeout(timer);
  }, [titleFr, photos]);

  function onPickFiles(files: FileList | null) {
    if (!files) return;

    setError(null);

    const selected = Array.from(files);
    const existingCount = photos.length;
    const maxAdd = Math.max(0, 10 - existingCount);
    const toAdd = selected.slice(0, maxAdd);

    if (selected.length > maxAdd) {
      setError(t("写真は最大10枚までです。", "Maximum 10 photos."));
    }

    const next: PhotoDraft[] = toAdd.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      draftFr: savedDraftByPhotoKey[photoDraftKey(file)] ?? "",
    }));

    setPhotos((prev) => [...prev, ...next]);
    // Focus the first newly added photo for drafting.
    if (next.length > 0) {
      setActiveIndex(existingCount);
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const target = prev[index];
      if (target) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {
          // no-op
        }
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function movePhoto(from: number, to: number) {
    setPhotos((prev) => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length)
        return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
    setActiveIndex((current) => {
      if (current === from) return to;
      if (from < current && current <= to) return current - 1;
      if (to <= current && current < from) return current + 1;
      return current;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    if (photos.length === 0) {
      setError(
        t("写真を選択してください。", "Veuillez sélectionner des photos."),
      );
      return;
    }
    if (photos.length > 10) {
      setError(t("写真は最大10枚までです。", "Maximum 10 photos."));
      return;
    }
    if (!titleFr.trim()) {
      setError(t("タイトルを入力してください。", "Veuillez saisir un titre."));
      return;
    }
    if (photos.some((p) => !p.draftFr.trim())) {
      setError(
        t(
          "すべての写真についてフランス語テキストを入力してください。",
          "Veuillez écrire un texte pour chaque photo.",
        ),
      );
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // 1) Upload each photo -> asset id
      const uploaded = await Promise.all(
        photos.map(async (p) => {
          const form = new FormData();
          form.append("file", p.file);
          const asset = await apiFetchForm<{ id: string }>(
            "/api/assets/photo",
            form,
          );
          return { assetId: asset.id, draftFr: p.draftFr };
        }),
      );

      // 2) Create multi-photo entry + per-photo records
      const created = await apiFetch<{ entry: { id: string } }>(
        "/api/entries/multi",
        {
          method: "POST",
          body: JSON.stringify({
            title_fr: titleFr,
            photos: uploaded.map((u) => ({
              photo_asset_id: u.assetId,
              draft_fr: u.draftFr,
            })),
          }),
        },
      );

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(NEW_ENTRY_DRAFT_STORAGE_KEY);
      }
      router.push(`/entries/${created.entry.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="card form-card new-entry-simple">
        <h1>{t("新規エントリー作成", "Créer une entrée")}</h1>
        <p className="timeline-detail">
          {t(
            "写真（最大10枚）を選び、写真ごとにフランス語テキストを書いてください。",
            "Sélectionnez jusqu’à 10 photos et écrivez un texte en français pour chaque photo.",
          )}
        </p>

        <form onSubmit={onSubmit}>
          <label>
            {t("フランス語タイトル", "Titre en français")}
            <input
              value={titleFr}
              onChange={(e) => setTitleFr(e.target.value)}
              required
              maxLength={200}
            />
          </label>

          <label>
            {t("写真（最大10枚）", "Photos (max 10)")}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onPickFiles(e.target.files)}
            />
            <div className="field-meta">
              {t("選択枚数:", "Nombre sélectionné :")} {photos.length}
            </div>
          </label>

          {photos.length > 0 ? (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {photos.map((p, i) => (
                  <button
                    key={`${p.file.name}-${i}`}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className={i === activeIndex ? "pill pill-active" : "pill"}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span>
                      {t("写真", "Photo")} {i + 1}
                    </span>
                    <span style={{ opacity: 0.8 }}>{p.file.name}</span>
                  </button>
                ))}
              </div>

              <div className="new-entry-editor">
                <div className="new-entry-preview-panel">
                  {activePhoto ? (
                    <img
                      src={activePhoto.previewUrl}
                      alt={`photo-${activeIndex + 1}`}
                      style={{
                        width: "100%",
                        height: "auto",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                      }}
                    />
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => movePhoto(activeIndex, activeIndex - 1)}
                      disabled={busy || activeIndex === 0}
                    >
                      {t("← 左へ", "← À gauche")}
                    </button>
                    <button
                      type="button"
                      onClick={() => movePhoto(activeIndex, activeIndex + 1)}
                      disabled={busy || activeIndex === photos.length - 1}
                    >
                      {t("右へ →", "À droite →")}
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhoto(activeIndex)}
                      disabled={busy}
                    >
                      {t("この写真を削除", "Supprimer cette photo")}
                    </button>
                  </div>
                </div>

                <div className="new-entry-draft-panel">
                  <label>
                    {t(
                      `写真 ${activeIndex + 1} のフランス語テキスト`,
                      `Texte en français pour la photo ${activeIndex + 1}`,
                    )}
                    <textarea
                      value={activePhoto?.draftFr ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPhotos((prev) =>
                          prev.map((p, idx) =>
                            idx === activeIndex ? { ...p, draftFr: value } : p,
                          ),
                        );
                      }}
                      rows={10}
                      required
                      maxLength={8000}
                      placeholder={t(
                        "Ex : J'ai vu un coucher de soleil.",
                        "Ex : J'ai vu un coucher de soleil.",
                      )}
                      disabled={!activePhoto}
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          <button type="submit" disabled={!canSubmit}>
            {busy
              ? t("作成中...", "Création...")
              : t("作成して次へ", "Créer et continuer")}
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
