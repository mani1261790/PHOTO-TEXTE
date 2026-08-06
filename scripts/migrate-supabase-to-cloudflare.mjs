import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI and production operators may provide variables directly.
}

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const databaseOnly = args.has('--database-only');
const objectsOnly = args.has('--objects-only');
if (databaseOnly && objectsOnly) throw new Error('Choose only one of --database-only or --objects-only');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET ?? 'photo-texte-content';
const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '2ea670c2a6ff28e248ef084adf095e8b';
if (!supabaseUrl || !serviceKey) throw new Error('Supabase migration credentials are missing');

const supabaseHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`
};

const tableColumns = {
  user_profiles: [
    'id', 'email_encrypted', 'wrapped_data_key', 'display_name', 'grammatical_gender',
    'cefr_level', 'politeness_pref', 'service_language', 'created_at', 'updated_at'
  ],
  assets: ['id', 'user_id', 'object_path', 'mime', 'size', 'sha256', 'created_at'],
  entries: [
    'id', 'user_id', 'title_fr', 'draft_fr', 'jp_auto', 'jp_intent', 'final_fr',
    'photo_asset_id', 'learning_highlights', 'status', 'created_at', 'updated_at'
  ],
  entry_photos: [
    'id', 'entry_id', 'user_id', 'position', 'photo_asset_id', 'draft_fr', 'jp_auto',
    'jp_intent', 'final_fr', 'learning_highlights', 'status', 'created_at', 'updated_at'
  ],
  memos: ['id', 'entry_id', 'user_id', 'memo_type', 'content', 'created_at'],
  exports: ['id', 'user_id', 'entry_id', 'token_hash', 'object_path', 'expires_at', 'created_at']
};

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
  return response.json();
}

async function fetchAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const body = await fetchJson(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: supabaseHeaders
    });
    const batch = body.users ?? [];
    users.push(...batch);
    if (batch.length < 1000) return users;
  }
}

async function fetchTable(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
      headers: {
        ...supabaseHeaders,
        range: `${offset}-${offset + 999}`
      }
    });
    if (!response.ok) throw new Error(`Unable to export ${table} (${response.status})`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `'${text.replaceAll("'", "''")}'`;
}

function insertSql(table, columns, row) {
  return `INSERT OR IGNORE INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map((column) => sqlValue(row[column])).join(', ')});`;
}

function runWrangler(parameters) {
  const result = spawnSync('npx', ['wrangler', ...parameters], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: cloudflareAccountId
    },
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error(`Wrangler failed with exit code ${result.status}`);
}

function storageUrl(bucket, objectPath) {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function migrateObject(tempDir, item, index, total) {
  let bytes;
  if (item.sourceFile) {
    bytes = await readFile(item.sourceFile);
  } else {
    const response = await fetch(storageUrl(item.bucket, item.objectPath), { headers: supabaseHeaders });
    if (!response.ok) {
      const body = await response.text();
      const objectMissing = response.status === 404 || /NoSuchKey|Object not found/i.test(body);
      if (item.optional && objectMissing) {
        console.warn(`Skipped unreferenced missing object: ${item.bucket}/${item.objectPath}`);
        return false;
      }
      throw new Error(`Unable to download ${item.bucket} object (${response.status})`);
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (item.sha256) {
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== item.sha256) throw new Error('Photo checksum mismatch during migration');
  }
  const tempPath = path.join(tempDir, `object-${index}`);
  await writeFile(tempPath, bytes);
  runWrangler([
    'r2', 'object', 'put', `${r2Bucket}/${item.bucket}/${item.objectPath}`,
    '--file', tempPath,
    '--content-type', item.contentType,
    '--remote', '--force'
  ]);
  console.log(`Migrated object ${index + 1}/${total}`);
  return true;
}

const [authUsers, profiles, assets, entries, entryPhotos, memos, allExports] = await Promise.all([
  fetchAuthUsers(),
  fetchTable('user_profiles'),
  fetchTable('assets'),
  fetchTable('entries'),
  fetchTable('entry_photos'),
  fetchTable('memos'),
  fetchTable('exports')
]);

const authById = new Map(authUsers.map((user) => [user.id, user]));
const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
const activeExports = allExports.filter((item) => Date.parse(item.expires_at) > Date.now());

for (const profile of profiles) {
  const authUser = authById.get(profile.id);
  if (!authUser?.email) throw new Error('A profile has no matching Supabase Auth email');
}

const betterAuthUsers = authUsers
  .filter((user) => profileById.has(user.id) && user.email)
  .map((user) => {
    const profile = profileById.get(user.id);
    return {
      id: user.id,
      name: profile.display_name || user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0],
      email: user.email.toLowerCase(),
      emailVerified: user.email_confirmed_at ? 1 : 0,
      image: user.user_metadata?.avatar_url ?? null,
      createdAt: Date.parse(user.created_at),
      updatedAt: Date.parse(user.updated_at ?? user.created_at)
    };
  });

const tables = {
  user_profiles: profiles,
  assets,
  entries,
  entry_photos: entryPhotos,
  memos,
  exports: activeExports
};

const referencedAssetIds = new Set([
  ...entries.map((entry) => entry.photo_asset_id).filter(Boolean),
  ...entryPhotos.map((photo) => photo.photo_asset_id).filter(Boolean)
]);

const objects = [
  {
    bucket: 'system',
    objectPath: 'fonts/NotoSansJP-Regular.ttf',
    contentType: 'font/ttf',
    sourceFile: path.join(
      process.cwd(),
      'node_modules/@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf'
    ),
    optional: false
  },
  ...assets.map((asset) => ({
    bucket: 'photos',
    objectPath: asset.object_path,
    contentType: asset.mime,
    sha256: asset.sha256,
    optional: !referencedAssetIds.has(asset.id)
  })),
  ...activeExports.map((item) => ({
    bucket: 'exports',
    objectPath: item.object_path,
    contentType: item.object_path.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    optional: true
  }))
];

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  auth_users: betterAuthUsers.length,
  rows: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
  skipped_expired_exports: allExports.length - activeExports.length,
  objects: objects.length
}, null, 2));

if (!apply) {
  console.log('Dry run only. Add --apply to write to Cloudflare.');
  process.exit(0);
}

const tempDir = await mkdtemp(path.join(tmpdir(), 'photo-texte-migration-'));
try {
  if (!objectsOnly) {
    const sql = [
      ...betterAuthUsers.map((user) => insertSql('user', ['id', 'name', 'email', 'emailVerified', 'image', 'createdAt', 'updatedAt'], user)),
      ...Object.entries(tables).flatMap(([table, rows]) => rows.map((row) => insertSql(table, tableColumns[table], row)))
    ].join('\n');
    const sqlPath = path.join(tempDir, 'data.sql');
    await writeFile(sqlPath, sql, { mode: 0o600 });
    runWrangler(['d1', 'execute', 'DB', '--remote', '--file', sqlPath]);
  }

  if (!databaseOnly) {
    let migrated = 0;
    for (let index = 0; index < objects.length; index += 1) {
      if (await migrateObject(tempDir, objects[index], index, objects.length)) migrated += 1;
    }
    console.log(`Migrated ${migrated}/${objects.length} objects.`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
