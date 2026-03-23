"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, apiFetchForm } from "@/lib/api/fetcher";
import { getAccessToken } from "@/lib/auth/token-store";
import { useLanguage } from "@/components/LanguageProvider";

const NEW_ENTRY_DRAFT_STORAGE_KEY = "photo-texte:new-entry-draft:v1";
const NEW_ENTRY_DRAFT_DB = "photo-texte-drafts";
const NEW_ENTRY_DRAFT_STORE = "new-entry";
const NEW_ENTRY_DRAFT_ID = "current";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2560;

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

type IndexedPhotoDraft = {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
  draftFr: string;
};

type IndexedNewEntryDraft = {
  id: string;
  titleFr: string;
  photos: IndexedPhotoDraft[];
  updatedAt: string;
};

function photoDraftKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function asJpegFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_DECODE_FAILED"));
    };
    img.src = url;
  });
}

async function maybeDownscalePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_UPLOAD_BYTES) {
    return file;
  }

  const image = await loadImageElement(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(image, 0, 0, width, height);

  const tryQualities = [0.88, 0.8, 0.72, 0.64, 0.56];
  for (const quality of tryQualities) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) continue;
    if (blob.size <= MAX_UPLOAD_BYTES) {
      return new File([blob], asJpegFileName(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    }
  }

  return file;
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(NEW_ENTRY_DRAFT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NEW_ENTRY_DRAFT_STORE)) {
        db.createObjectStore(NEW_ENTRY_DRAFT_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadIndexedDraft(): Promise<IndexedNewEntryDraft | null> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEW_ENTRY_DRAFT_STORE, "readonly");
    const store = tx.objectStore(NEW_ENTRY_DRAFT_STORE);
    const req = store.get(NEW_ENTRY_DRAFT_ID);
    req.onsuccess = () => {
      resolve((req.result as IndexedNewEntryDraft | undefined) ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function saveIndexedDraft(
  payload: Omit<IndexedNewEntryDraft, "id">,
): Promise<void> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEW_ENTRY_DRAFT_STORE, "readwrite");
    const store = tx.objectStore(NEW_ENTRY_DRAFT_STORE);
    store.put({ ...payload, id: NEW_ENTRY_DRAFT_ID });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function clearIndexedDraft(): Promise<void> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEW_ENTRY_DRAFT_STORE, "readwrite");
    tx.objectStore(NEW_ENTRY_DRAFT_STORE).delete(NEW_ENTRY_DRAFT_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export default function NewEntryPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === "fr" ? fr : ja);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const [titleFr, setTitleFr] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [savedDraftByPhotoKey, setSavedDraftByPhotoKey] = useState<
    Record<string, string>
  >({});

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function buildReselectPhotoMessage(photoNumber: number): string {
    return t(
      `写真 ${photoNumber} の読み込みまたは送信に失敗しました。もう一度この写真を選択してください。`,
      `La lecture ou l’envoi de la photo ${photoNumber} a échoué. Veuillez sélectionner cette photo de nouveau.`,
    );
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(NEW_ENTRY_DRAFT_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as NewEntryAutoDraft;
        setTitleFr(parsed.titleFr ?? "");
        setSavedDraftByPhotoKey(parsed.draftByPhotoKey ?? {});
      } catch {
        // Ignore invalid cached content.
      }
    }

    loadIndexedDraft()
      .then((draft) => {
        if (!draft) return;
        setTitleFr(draft.titleFr ?? "");
        const restored = (draft.photos ?? []).map((p) => {
          const file = new File([p.blob], p.name, {
            type: p.type,
            lastModified: p.lastModified,
          });
          return {
            file,
            previewUrl: URL.createObjectURL(file),
            draftFr: p.draftFr ?? "",
          };
        });
        setPhotos(restored);
        setSavedDraftByPhotoKey(
          Object.fromEntries(
            restored.map((p) => [photoDraftKey(p.file), p.draftFr]),
          ),
        );
      })
      .catch(() => {
        // Ignore IndexedDB errors and continue without restore.
      });
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
        void clearIndexedDraft().catch(() => undefined);
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

      void saveIndexedDraft({
        titleFr,
        photos: photos.map((p) => ({
          name: p.file.name,
          type: p.file.type,
          lastModified: p.file.lastModified,
          blob: p.file,
          draftFr: p.draftFr,
        })),
        updatedAt: payload.updatedAt,
      }).catch(() => undefined);
    }, 500);

    return () => clearTimeout(timer);
  }, [titleFr, photos]);

  async function onPickFiles(files: FileList | null) {
    if (!files) return;

    setError(null);

    const selected = Array.from(files);
    const existingCount = photos.length;
    const maxAdd = Math.max(0, 10 - existingCount);
    const toAdd = selected.slice(0, maxAdd);

    if (selected.length > maxAdd) {
      setError(t("写真は最大10枚までです。", "Maximum 10 photos."));
    }

    const next: PhotoDraft[] = [];
    for (const originalFile of toAdd) {
      const file = await maybeDownscalePhoto(originalFile).catch(() => originalFile);
      const draftFr =
        savedDraftByPhotoKey[photoDraftKey(originalFile)] ??
        savedDraftByPhotoKey[photoDraftKey(file)] ??
        "";
      next.push({
        file,
        previewUrl: URL.createObjectURL(file),
        draftFr,
      });
    }

    setPhotos((prev) => [...prev, ...next]);
    // Focus the first newly added photo for drafting.
    if (next.length > 0) {
      setActiveIndex(existingCount);
    }
  }

  async function replacePhoto(index: number, fileList: FileList | null) {
    const originalFile = fileList?.[0];
    if (!originalFile) return;

    setError(null);

    const file = await maybeDownscalePhoto(originalFile).catch(() => originalFile);
    const nextPreviewUrl = URL.createObjectURL(file);
    setPhotos((prev) =>
      prev.map((photo, photoIndex) => {
        if (photoIndex !== index) return photo;
        try {
          URL.revokeObjectURL(photo.previewUrl);
        } catch {
          // no-op
        }
        return {
          ...photo,
          file,
          previewUrl: nextPreviewUrl,
        };
      }),
    );
    setActiveIndex(index);
  }

  async function ensurePhotoReadable(photo: PhotoDraft, index: number) {
    if (!(photo.file instanceof File) || photo.file.size <= 0) {
      throw new Error(`PHOTO_RESELECT_REQUIRED:${index}`);
    }

    try {
      await photo.file.slice(0, Math.min(photo.file.size, 32)).arrayBuffer();
    } catch {
      throw new Error(`PHOTO_RESELECT_REQUIRED:${index}`);
    }
  }

  function handleAddFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.currentTarget.value = "";
    void onPickFiles(files);
  }

  function handleReplaceFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.currentTarget.value = "";
    void replacePhoto(activeIndex, files);
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

  function goToPhoto(nextIndex: number) {
    setActiveIndex((current) => {
      const max = photos.length - 1;
      if (max < 0) return 0;
      if (nextIndex < 0) return 0;
      if (nextIndex > max) return max;
      if (nextIndex === current) return current;
      return nextIndex;
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
      // Upload sequentially to avoid intermittent browser/network failures
      // with concurrent multipart requests (seen as "Load failed" in UI).
      const uploaded: Array<{ assetId: string; draftFr: string }> = [];
      for (let index = 0; index < photos.length; index += 1) {
        const p = photos[index];
        await ensurePhotoReadable(p, index);

        const form = new FormData();
        form.append("file", p.file);
        let asset: { id: string };
        try {
          asset = await apiFetchForm<{ id: string }>(
            "/api/assets/photo",
            form,
          );
        } catch (uploadError) {
          const message = (uploadError as Error).message || "";
          if (message === "Load failed") {
            throw new Error(`PHOTO_RESELECT_REQUIRED:${index}`);
          }
          throw uploadError;
        }
        uploaded.push({ assetId: asset.id, draftFr: p.draftFr });
      }

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
        void clearIndexedDraft().catch(() => undefined);
      }
      router.push(`/entries/${created.entry.id}`);
    } catch (err) {
      const message = (err as Error).message || "";
      if (message.startsWith("PHOTO_RESELECT_REQUIRED:")) {
        const failedIndex = Number(message.split(":")[1] ?? activeIndex);
        const photoNumber = Number.isFinite(failedIndex) ? failedIndex + 1 : activeIndex + 1;
        setActiveIndex(Number.isFinite(failedIndex) ? failedIndex : activeIndex);
        setError(buildReselectPhotoMessage(photoNumber));
        return;
      }
      setError(
        message === "Load failed"
          ? t(
              "通信に失敗しました。時間をおいて再度お試しください。",
              "Échec de communication. Veuillez réessayer dans un instant.",
            )
          : message,
      );
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
              onChange={handleAddFilesChange}
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
                      onClick={() => goToPhoto(activeIndex - 1)}
                      disabled={busy || activeIndex === 0}
                    >
                      {t("← 前の写真", "← Photo précédente")}
                    </button>
                    <button
                      type="button"
                      onClick={() => goToPhoto(activeIndex + 1)}
                      disabled={busy || activeIndex === photos.length - 1}
                    >
                      {t("次の写真 →", "Photo suivante →")}
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhoto(activeIndex)}
                      disabled={busy}
                    >
                      {t("この写真を削除", "Supprimer cette photo")}
                    </button>
                    <button
                      type="button"
                      onClick={() => replaceInputRef.current?.click()}
                      disabled={busy || !activePhoto}
                    >
                      {t("この写真を選び直す", "Sélectionner de nouveau cette photo")}
                    </button>
                    <input
                      ref={replaceInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleReplaceFileChange}
                      style={{ display: "none" }}
                    />
                  </div>
                  <p className="field-meta">
                    {t(
                      "この端末で元の写真を読み込めなくなった場合は、この写真を選び直してください。",
                      "Si le fichier d’origine n’est plus lisible sur cet appareil, sélectionnez de nouveau cette photo.",
                    )}
                  </p>
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
