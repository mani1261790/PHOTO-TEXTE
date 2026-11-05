import { AppEnv, getAppEnv } from '@/lib/cloudflare/context';
import { issueStorageSignature } from '@/lib/cloudflare/storage-signature';

type Row = Record<string, unknown>;
type QueryAction = 'select' | 'insert' | 'update' | 'delete';

export interface CloudflareQueryError {
  code: string;
  message: string;
}

export interface CloudflareQueryResult<T = unknown> {
  data: T | null;
  error: CloudflareQueryError | null;
  count?: number | null;
}

export interface QueryBuilderLike<T = any[]> extends PromiseLike<CloudflareQueryResult<T>> {
  select(columns?: string, options?: { head?: boolean; count?: 'exact' }): QueryBuilderLike<any[]>;
  insert(values: Row | Row[]): QueryBuilderLike<any[]>;
  update(values: Row): QueryBuilderLike<any[]>;
  delete(): QueryBuilderLike<any[]>;
  eq(column: string, value: unknown): QueryBuilderLike<T>;
  in(column: string, values: unknown[]): QueryBuilderLike<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilderLike<T>;
  limit(value: number): QueryBuilderLike<T>;
  single(): QueryBuilderLike<any>;
}

const TABLES = {
  user_profiles: { scope: 'id', json: [] },
  assets: { scope: 'user_id', json: [] },
  entries: { scope: 'user_id', json: ['learning_highlights'] },
  entry_photos: { scope: 'user_id', json: ['learning_highlights'] },
  memos: { scope: 'user_id', json: [] },
  exports: { scope: 'user_id', json: [] }
} as const;

type TableName = keyof typeof TABLES;

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function columnsSql(selection: string): string {
  if (selection.trim() === '*') return '*';
  return selection
    .split(',')
    .map((column) => quoteIdentifier(column.trim()))
    .join(', ');
}

function encodeValue(table: TableName, column: string, value: unknown): unknown {
  if ((TABLES[table].json as readonly string[]).includes(column) && value !== null && value !== undefined) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function decodeRow(table: TableName, row: Row): Row {
  const decoded = { ...row };
  for (const column of TABLES[table].json as readonly string[]) {
    const value = decoded[column];
    if (typeof value !== 'string') continue;
    try {
      decoded[column] = JSON.parse(value);
    } catch {
      decoded[column] = null;
    }
  }
  return decoded;
}

function queryError(error: unknown): CloudflareQueryError {
  const message = error instanceof Error ? error.message : String(error);
  let code = 'D1_ERROR';
  if (/NOT NULL constraint failed/i.test(message)) code = '23502';
  if (/UNIQUE constraint failed/i.test(message)) code = '23505';
  if (/FOREIGN KEY constraint failed/i.test(message)) code = '23503';
  return { code, message };
}

class QueryBuilder implements PromiseLike<CloudflareQueryResult<any>> {
  private action: QueryAction = 'select';
  private selection = '*';
  private rows: Row[] = [];
  private updateValues: Row = {};
  private conditions: Array<{ column: string; values: unknown[]; operator: '=' | 'IN' }> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private maxRows: number | null = null;
  private wantsSingle = false;
  private wantsReturning = false;
  private headOnly = false;
  private wantsCount = false;

  constructor(
    private readonly db: D1Database,
    private readonly table: TableName,
    private readonly userId: string | null
  ) {}

  select(columns = '*', options?: { head?: boolean; count?: 'exact' }): this {
    this.selection = columns;
    this.headOnly = options?.head ?? false;
    this.wantsCount = options?.count === 'exact';
    if (this.action !== 'select') this.wantsReturning = true;
    return this;
  }

  insert(values: Row | Row[]): this {
    this.action = 'insert';
    this.rows = (Array.isArray(values) ? values : [values]).map((row) => ({ ...row }));
    return this;
  }

  update(values: Row): this {
    this.action = 'update';
    this.updateValues = { ...values };
    return this;
  }

  delete(): this {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    quoteIdentifier(column);
    this.conditions.push({ column, values: [value], operator: '=' });
    return this;
  }

  in(column: string, values: unknown[]): this {
    quoteIdentifier(column);
    this.conditions.push({ column, values, operator: 'IN' });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    quoteIdentifier(column);
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(value: number): this {
    this.maxRows = Math.max(0, Math.trunc(value));
    return this;
  }

  single(): this {
    this.wantsSingle = true;
    this.maxRows = 1;
    return this;
  }

  then<TResult1 = CloudflareQueryResult<any>, TResult2 = never>(
    onfulfilled?: ((value: CloudflareQueryResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private scopedConditions(): Array<{ column: string; values: unknown[]; operator: '=' | 'IN' }> {
    const conditions = [...this.conditions];
    if (this.userId) {
      const scope = TABLES[this.table].scope;
      conditions.push({ column: scope, values: [this.userId], operator: '=' });
    }
    return conditions;
  }

  private whereSql(conditions = this.scopedConditions()): { sql: string; values: unknown[] } {
    if (!conditions.length) return { sql: '', values: [] };
    const values: unknown[] = [];
    const clauses = conditions.map((condition) => {
      if (condition.operator === 'IN') {
        if (!condition.values.length) return '0 = 1';
        values.push(...condition.values);
        return `${quoteIdentifier(condition.column)} IN (${condition.values.map(() => '?').join(', ')})`;
      }
      values.push(condition.values[0]);
      return `${quoteIdentifier(condition.column)} = ?`;
    });
    return { sql: ` WHERE ${clauses.join(' AND ')}`, values };
  }

  private assertScopedWrite(row: Row): void {
    if (!this.userId) return;
    const scope = TABLES[this.table].scope;
    const provided = row[scope];
    if (provided !== undefined && provided !== this.userId) {
      throw new Error(`User scope mismatch for ${this.table}.${scope}`);
    }
    row[scope] = this.userId;
  }

  private async selectRows(conditions = this.scopedConditions()): Promise<Row[]> {
    const where = this.whereSql(conditions);
    const order = this.orderBy
      ? ` ORDER BY ${quoteIdentifier(this.orderBy.column)} ${this.orderBy.ascending ? 'ASC' : 'DESC'}`
      : '';
    const limit = this.maxRows === null ? '' : ` LIMIT ${this.maxRows}`;
    const sql = `SELECT ${columnsSql(this.selection)} FROM ${quoteIdentifier(this.table)}${where.sql}${order}${limit}`;
    const result = await this.db.prepare(sql).bind(...where.values).all<Row>();
    return (result.results ?? []).map((row) => decodeRow(this.table, row));
  }

  private shape(rows: Row[]): CloudflareQueryResult<any> {
    if (this.wantsSingle) {
      if (!rows.length) {
        return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
      }
      return { data: rows[0], error: null };
    }
    return {
      data: this.headOnly ? null : rows,
      error: null,
      count: this.wantsCount ? rows.length : undefined
    };
  }

  private async executeInsert(): Promise<CloudflareQueryResult<any>> {
    if (!this.rows.length) return { data: [], error: null };
    const ids: string[] = [];
    const statements = this.rows.map((source) => {
      const row = { ...source };
      this.assertScopedWrite(row);
      if (!row.id) row.id = crypto.randomUUID();
      ids.push(String(row.id));
      const columns = Object.keys(row);
      const sql = `INSERT INTO ${quoteIdentifier(this.table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
      return this.db.prepare(sql).bind(...columns.map((column) => encodeValue(this.table, column, row[column])));
    });
    await this.db.batch(statements);
    if (!this.wantsReturning) return { data: null, error: null };
    return this.shape(await this.selectRows([{ column: 'id', values: ids, operator: 'IN' }]));
  }

  private async executeUpdate(): Promise<CloudflareQueryResult<any>> {
    const row = { ...this.updateValues };
    if (this.userId) {
      const scope = TABLES[this.table].scope;
      if (row[scope] !== undefined && row[scope] !== this.userId) {
        throw new Error(`User scope mismatch for ${this.table}.${scope}`);
      }
      delete row[scope];
    }
    const columns = Object.keys(row);
    if (!columns.length) return { data: null, error: null };
    const where = this.whereSql();
    const sql = `UPDATE ${quoteIdentifier(this.table)} SET ${columns.map((column) => `${quoteIdentifier(column)} = ?`).join(', ')}${where.sql}`;
    await this.db
      .prepare(sql)
      .bind(
        ...columns.map((column) => encodeValue(this.table, column, row[column])),
        ...where.values
      )
      .run();
    if (!this.wantsReturning) return { data: null, error: null };
    return this.shape(await this.selectRows());
  }

  private async executeDelete(): Promise<CloudflareQueryResult<any>> {
    const where = this.whereSql();
    if (!where.sql) throw new Error(`Refusing unscoped delete from ${this.table}`);
    await this.db.prepare(`DELETE FROM ${quoteIdentifier(this.table)}${where.sql}`).bind(...where.values).run();
    return { data: null, error: null };
  }

  private async execute(): Promise<CloudflareQueryResult<any>> {
    try {
      if (this.action === 'insert') return await this.executeInsert();
      if (this.action === 'update') return await this.executeUpdate();
      if (this.action === 'delete') return await this.executeDelete();
      return this.shape(await this.selectRows());
    } catch (error) {
      return { data: null, error: queryError(error) };
    }
  }
}

interface StorageUploadOptions {
  upsert?: boolean;
  contentType?: string;
  cacheControl?: string;
}

class StorageBucketClient {
  constructor(
    private readonly env: AppEnv,
    private readonly bucket: string,
    private readonly userId: string | null
  ) {}

  private key(path: string): string {
    const clean = path.replace(/^\/+/, '');
    if (!clean || clean.includes('..')) throw new Error('Invalid storage path');
    if (this.userId && !clean.startsWith(`${this.userId}/`)) {
      throw new Error('Storage path is outside the authenticated user scope');
    }
    return `${this.bucket}/${clean}`;
  }

  async upload(path: string, value: ArrayBuffer | ArrayBufferView | Blob | string, options: StorageUploadOptions = {}) {
    try {
      const key = this.key(path);
      if (!options.upsert && (await this.env.CONTENT_BUCKET.head(key))) {
        return { data: null, error: { code: 'OBJECT_EXISTS', message: 'Object already exists' } };
      }
      await this.env.CONTENT_BUCKET.put(key, value, {
        httpMetadata: {
          contentType: options.contentType,
          cacheControl: options.cacheControl
        }
      });
      return { data: { path }, error: null };
    } catch (error) {
      return { data: null, error: queryError(error) };
    }
  }

  async download(path: string) {
    try {
      const object = await this.env.CONTENT_BUCKET.get(this.key(path));
      if (!object) return { data: null, error: { code: 'OBJECT_NOT_FOUND', message: 'Object not found' } };
      return {
        data: new Blob([await object.arrayBuffer()], { type: object.httpMetadata?.contentType }),
        error: null
      };
    } catch (error) {
      return { data: null, error: queryError(error) };
    }
  }

  async remove(paths: string[]) {
    try {
      await this.env.CONTENT_BUCKET.delete(paths.map((path) => this.key(path)));
      return { data: paths.map((path) => ({ name: path })), error: null };
    } catch (error) {
      return { data: null, error: queryError(error) };
    }
  }

  async list(prefix: string, options?: { limit?: number; sortBy?: { column: string; order: string } }) {
    try {
      const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
      if (this.userId && cleanPrefix !== this.userId && !cleanPrefix.startsWith(`${this.userId}/`)) {
        throw new Error('Storage prefix is outside the authenticated user scope');
      }
      const keyPrefix = `${this.bucket}/${cleanPrefix}${cleanPrefix ? '/' : ''}`;
      const objects = await this.env.CONTENT_BUCKET.list({
        prefix: keyPrefix,
        limit: Math.min(options?.limit ?? 1000, 1000)
      });
      return {
        data: objects.objects.map((object) => ({
          name: object.key.slice(keyPrefix.length),
          metadata: object.customMetadata
        })),
        error: null
      };
    } catch (error) {
      return { data: null, error: queryError(error) };
    }
  }

  async createSignedUrl(path: string, expiresInSeconds: number) {
    try {
      this.key(path);
      const expires = Math.floor(Date.now() / 1000) + Math.max(1, Math.trunc(expiresInSeconds));
      const signature = await issueStorageSignature(this.env, this.bucket, path, expires);
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      return {
        data: {
          signedUrl: `/api/storage/${encodeURIComponent(this.bucket)}/${encodedPath}?expires=${expires}&signature=${signature}`
        },
        error: null
      };
    } catch (error) {
      return { data: null, error: queryError(error) };
    }
  }
}

export class CloudflareClient {
  readonly storage: { from: (bucket: string) => StorageBucketClient };

  constructor(
    private readonly env: AppEnv,
    private readonly userId: string | null = null
  ) {
    this.storage = {
      from: (bucket) => new StorageBucketClient(this.env, bucket, this.userId)
    };
  }

  from(table: string): QueryBuilderLike<any[]> {
    if (!(table in TABLES)) throw new Error(`Unknown D1 table: ${table}`);
    return new QueryBuilder(this.env.DB, table as TableName, this.userId) as unknown as QueryBuilderLike<any[]>;
  }
}

export async function createUserClient(userId: string): Promise<CloudflareClient> {
  return new CloudflareClient(await getAppEnv(), userId);
}

export async function createServiceClient(): Promise<CloudflareClient> {
  return new CloudflareClient(await getAppEnv());
}
