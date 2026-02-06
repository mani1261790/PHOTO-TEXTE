import crypto from 'node:crypto';

export function issueExportToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export function hashExportToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
