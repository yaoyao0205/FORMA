import { app } from 'electron'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { getDb } from './database'
import { ensureDir } from '../utils/fsx'
import { logError } from '../utils/log'

export function thumbnailDir(): string {
  return join(app.getPath('userData'), 'thumbnails')
}

export async function saveThumbnail(modelId: string, dataUrl: string): Promise<{ ok: boolean; path?: string }> {
  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl)
  if (!match) return { ok: false }
  const base64 = match[2]
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) return { ok: false }

  const dir = thumbnailDir()
  await ensureDir(dir)
  const file = join(dir, `${modelId}.png`)
  try {
    await writeFile(file, buffer)
    getDb().prepare('UPDATE models SET thumbnail = ? WHERE id = ?').run(file, modelId)
    return { ok: true, path: file }
  } catch (error) {
    logError('thumbnail save failed', modelId, error)
    return { ok: false }
  }
}

export function thumbnailPath(modelId: string): string {
  return join(thumbnailDir(), `${modelId}.png`)
}
