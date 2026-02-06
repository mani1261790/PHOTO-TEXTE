export function photoBucket(): string {
  return process.env.PHOTO_BUCKET ?? 'photos';
}

export function exportBucket(): string {
  return process.env.EXPORT_BUCKET ?? 'exports';
}
