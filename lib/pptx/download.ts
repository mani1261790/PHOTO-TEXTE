const DEFAULT_PPTX_FILENAME = "photo-texte-export.pptx";

function normalizeBaseName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asciiFallback(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .trim();

  return normalized || DEFAULT_PPTX_FILENAME;
}

export function buildPptxDownloadFilename(title: string | null | undefined): string {
  const normalized = normalizeBaseName((title ?? "").trim());
  return `${normalized || "photo-texte-export"}.pptx`;
}

export function buildPptxContentDisposition(title: string | null | undefined): string {
  const fileName = buildPptxDownloadFilename(title);
  const fallback = asciiFallback(fileName);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
