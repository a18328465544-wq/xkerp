import { createHash } from "node:crypto";
import { withDatabaseTransaction } from "./db.ts";

export const MEDIA_MAX_BYTES = 110_000;
export const MEDIA_TARGET_BYTES = 100_000;
export const MEDIA_MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const MEDIA_URL_PREFIX = "/api/media/assets/";

const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const entityPartPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;

export type MediaAsset = {
  id: string;
  mimeType: string;
  originalName?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  sha256: string;
  createdBy?: string;
  createdAt: string;
};

export type MediaRelation = MediaAsset & {
  entityType: string;
  entityId: string;
  relationRole: string;
  sortOrder: number;
};

export class MediaValidationError extends Error {
  readonly code: string;
  readonly status = 400;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MediaValidationError";
    this.code = code;
  }
}

type ParsedImage = {
  mimeType: string;
  content: Buffer;
};

function validateEntityPart(value: string, label: string) {
  if (!entityPartPattern.test(value)) {
    throw new MediaValidationError("INVALID_MEDIA_ENTITY", `${label}格式无效`);
  }
}

function parseDataUrl(dataUrl: unknown): ParsedImage {
  if (typeof dataUrl !== "string" || !dataUrl.trim()) {
    throw new MediaValidationError("INVALID_IMAGE", "图片数据不能为空");
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new MediaValidationError("UNSUPPORTED_IMAGE", "仅支持 JPG、PNG 或 WEBP 图片");
  }
  const rawMimeType = match[1];
  const encodedContent = match[2];
  if (!rawMimeType || !encodedContent) throw new MediaValidationError("INVALID_IMAGE", "图片内容为空");
  const mimeType = rawMimeType.toLowerCase();
  if (!supportedMimeTypes.has(mimeType)) {
    throw new MediaValidationError("UNSUPPORTED_IMAGE", "仅支持 JPG、PNG 或 WEBP 图片");
  }
  const content = Buffer.from(encodedContent.replace(/\s+/g, ""), "base64");
  if (!content.length) throw new MediaValidationError("INVALID_IMAGE", "图片内容为空");
  if (content.length > MEDIA_MAX_INPUT_BYTES) {
    throw new MediaValidationError("IMAGE_INPUT_TOO_LARGE", "原始图片不能超过 12MB");
  }
  if (content.length > MEDIA_MAX_BYTES) {
    throw new MediaValidationError("IMAGE_NEEDS_COMPRESSION", `图片压缩后必须不超过 ${MEDIA_MAX_BYTES} 字节（约 100KB）`);
  }
  return { mimeType, content };
}

export function imageUrlForAsset(id: string) {
  return `${MEDIA_URL_PREFIX}${encodeURIComponent(id)}`;
}

export function parseMediaAssetId(url: string) {
  if (!url.startsWith(MEDIA_URL_PREFIX)) return null;
  const id = decodeURIComponent(url.slice(MEDIA_URL_PREFIX.length));
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id) ? id : null;
}

function mapAsset(row: {
  id: string;
  mime_type: string;
  original_name: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  created_by: string | null;
  created_at: Date;
}): MediaAsset {
  return {
    id: row.id,
    mimeType: row.mime_type,
    originalName: row.original_name || undefined,
    sizeBytes: Number(row.size_bytes),
    width: row.width || undefined,
    height: row.height || undefined,
    sha256: row.sha256,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at.toISOString(),
  };
}

export async function replaceEntityImages(input: {
  entityType: string;
  entityId: string;
  values: unknown[];
  relationRole?: string;
  createdBy?: string;
}): Promise<string[]> {
  const entityType = String(input.entityType || "").trim();
  const entityId = String(input.entityId || "").trim();
  const relationRole = String(input.relationRole || "attachment").trim() || "attachment";
  validateEntityPart(entityType, "实体类型");
  validateEntityPart(entityId, "实体编号");
  validateEntityPart(relationRole, "图片用途");
  if (!Array.isArray(input.values) || input.values.length > 20) {
    throw new MediaValidationError("INVALID_IMAGE_COUNT", "单个业务对象最多关联 20 张图片");
  }

  return withDatabaseTransaction(async (client) => {
    const assetIds: string[] = [];
    for (const [index, value] of input.values.entries()) {
      const existingId = typeof value === "string" ? parseMediaAssetId(value) : null;
      let assetId = existingId;
      if (assetId) {
        const existing = await client.query<{ id: string }>("SELECT id FROM gpu_media_assets WHERE id = $1", [assetId]);
        if (!existing.rowCount) throw new MediaValidationError("MEDIA_NOT_FOUND", "图片资源不存在或已被删除");
      } else {
        const parsed = parseDataUrl(value);
        const sha256 = createHash("sha256").update(parsed.content).digest("hex");
        assetId = `IMG-${sha256.slice(0, 24)}`;
        await client.query(
          `INSERT INTO gpu_media_assets (id, mime_type, original_name, size_bytes, sha256, content, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (sha256) DO NOTHING`,
          [assetId, parsed.mimeType, undefined, parsed.content.length, sha256, parsed.content, input.createdBy || null],
        );
        const resolved = await client.query<{ id: string }>("SELECT id FROM gpu_media_assets WHERE sha256 = $1", [sha256]);
        assetId = resolved.rows[0]?.id || assetId;
      }
      assetIds.push(assetId);
      await client.query(
        `INSERT INTO gpu_media_relations (asset_id, entity_type, entity_id, relation_role, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (asset_id, entity_type, entity_id, relation_role)
         DO UPDATE SET sort_order = EXCLUDED.sort_order`,
        [assetId, entityType, entityId, relationRole, index],
      );
    }
    await client.query(
      `DELETE FROM gpu_media_relations
       WHERE entity_type = $1 AND entity_id = $2 AND relation_role = $3
         AND NOT (asset_id = ANY($4::text[]))`,
      [entityType, entityId, relationRole, assetIds],
    );
    return assetIds.map(imageUrlForAsset);
  });
}

export async function listEntityImages(entityType: string, entityId: string, relationRole?: string): Promise<MediaRelation[]> {
  validateEntityPart(entityType, "实体类型");
  validateEntityPart(entityId, "实体编号");
  const role = relationRole?.trim();
  if (role) validateEntityPart(role, "图片用途");
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      mime_type: string;
      original_name: string | null;
      size_bytes: number;
      width: number | null;
      height: number | null;
      sha256: string;
      created_by: string | null;
      created_at: Date;
      entity_type: string;
      entity_id: string;
      relation_role: string;
      sort_order: number;
    }>(
      `SELECT a.id, a.mime_type, a.original_name, a.size_bytes, a.width, a.height, a.sha256,
              a.created_by, a.created_at, r.entity_type, r.entity_id, r.relation_role, r.sort_order
       FROM gpu_media_relations r
       JOIN gpu_media_assets a ON a.id = r.asset_id
       WHERE r.entity_type = $1 AND r.entity_id = $2 ${role ? "AND r.relation_role = $3" : ""}
       ORDER BY r.sort_order ASC, r.created_at ASC`,
      role ? [entityType, entityId, role] : [entityType, entityId],
    );
    return result.rows.map((row) => ({ ...mapAsset(row), entityType: row.entity_type, entityId: row.entity_id, relationRole: row.relation_role, sortOrder: row.sort_order }));
  });
}

export async function getMediaAsset(id: string) {
  validateEntityPart(id, "图片编号");
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<{ id: string; mime_type: string; content: Buffer }>(
      "SELECT id, mime_type, content FROM gpu_media_assets WHERE id = $1",
      [id],
    );
    return result.rows[0] || null;
  });
}
