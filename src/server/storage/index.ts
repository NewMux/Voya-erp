import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { env } from '@/lib/env';

/**
 * Attachment storage.
 *
 * A narrow interface with a local-disk implementation. Production runs on
 * Hetzner via Coolify with a persistent volume mounted at the configured path;
 * swapping in S3 or MinIO later means adding one more implementation here and
 * nothing else in the codebase changes.
 *
 * Files are never served from a public path. `fileKey` is opaque and downloads
 * go through /api/files/[key], which checks the session first — ticket PDFs,
 * visa copies and passport scans must not be guessable URLs.
 */

export type StoredFile = {
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export interface StorageAdapter {
  save(file: File, prefix: string): Promise<StoredFile>;
  read(fileKey: string): Promise<Buffer>;
  remove(fileKey: string): Promise<void>;
}

/** Media types staff legitimately attach to a booking. */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Strip anything that could escape the upload directory or confuse a browser. */
export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 120) || 'file';
}

/**
 * Reject a key that is not in the exact shape `save` produces.
 *
 * Belt and braces alongside the path containment check below: a key arriving
 * from a URL must never be able to reach anything but an uploaded file.
 */
function assertValidKey(fileKey: string): void {
  if (!/^[a-z0-9]+\/[a-f0-9]{32}(\.[a-z0-9]{1,8})?$/i.test(fileKey)) {
    throw new StorageError('Invalid file reference.');
  }
}

class LocalDiskStorage implements StorageAdapter {
  private get root(): string {
    // The path comes from STORAGE_LOCAL_PATH at runtime, not build time. Without
    // this hint, Turbopack's build tracer treats the call as unresolvable and
    // conservatively traces the whole project, which can fail the build outside
    // this project's own root (e.g. on Vercel's build container).
    return resolve(/* turbopackIgnore: true */ process.cwd(), env().STORAGE_LOCAL_PATH);
  }

  /** Resolve a key to an absolute path, refusing anything outside the root. */
  private pathFor(fileKey: string): string {
    assertValidKey(fileKey);
    const root = this.root;
    const full = resolve(root, normalize(fileKey));
    if (full !== root && !full.startsWith(root + sep)) {
      throw new StorageError('Invalid file reference.');
    }
    return full;
  }

  async save(file: File, prefix: string): Promise<StoredFile> {
    const maxBytes = env().STORAGE_MAX_BYTES;

    if (file.size === 0) {
      throw new StorageError('That file is empty.');
    }
    if (file.size > maxBytes) {
      throw new StorageError(
        `That file is too large. The limit is ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new StorageError(
        'That file type is not accepted. Attach a PDF, image or office document.',
      );
    }

    const extension = EXTENSION_BY_MIME[file.type] ?? 'bin';
    const folder = prefix.replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'misc';
    const fileKey = `${folder}/${randomBytes(16).toString('hex')}.${extension}`;

    const target = this.pathFor(fileKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await file.arrayBuffer()));

    return {
      fileKey,
      fileName: safeFileName(file.name),
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }

  async read(fileKey: string): Promise<Buffer> {
    return readFile(this.pathFor(fileKey));
  }

  async remove(fileKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(fileKey));
    } catch (error) {
      // Already gone is the desired end state, not an error.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

let adapter: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  adapter ??= new LocalDiskStorage();
  return adapter;
}

/** Stable etag for cache validation on downloads. */
export function etagFor(fileKey: string, sizeBytes: number): string {
  return `"${createHash('sha1').update(`${fileKey}:${sizeBytes}`).digest('hex')}"`;
}

export { join as joinStoragePath };
