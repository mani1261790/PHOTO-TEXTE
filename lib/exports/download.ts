export type ExportFormat = "pptx" | "pdf";

function normalizeBaseName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asciiFallback(value: string, format: ExportFormat): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .trim();
  return normalized || `photo-texte-export.${format}`;
}

export function buildExportDownloadFilename(
  title: string | null | undefined,
  format: ExportFormat,
): string {
  const normalized = normalizeBaseName((title ?? "").trim());
  return `${normalized || "photo-texte-export"}.${format}`;
}

export function buildExportContentDisposition(
  title: string | null | undefined,
  format: ExportFormat,
): string {
  const fileName = buildExportDownloadFilename(title, format);
  const fallback = asciiFallback(fileName, format);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
