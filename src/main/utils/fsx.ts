import { stat, mkdir, copyFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, basename, extname } from 'node:path'

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export interface FileFacts {
  size: number
  mtime: number
  isDirectory: boolean
  isFile: boolean
}

export async function fileFacts(path: string): Promise<FileFacts | null> {
  try {
    const s = await stat(path)
    return { size: s.size, mtime: Math.floor(s.mtimeMs), isDirectory: s.isDirectory(), isFile: s.isFile() }
  } catch {
    return null
  }
}

export function safeExt(path: string): string {
  return extname(path).replace('.', '').toLowerCase()
}

export function baseName(path: string): string {
  return basename(path)
}

/** 托管模式下生成不冲突的目标路径：name.stl → name-1.stl */
export async function uniqueDestination(dir: string, filename: string): Promise<string> {
  const ext = extname(filename)
  const stem = filename.slice(0, filename.length - ext.length)
  let candidate = join(dir, filename)
  let i = 1
  while (await exists(candidate)) {
    candidate = join(dir, `${stem}-${i}${ext}`)
    i += 1
    if (i > 9999) break
  }
  await mkdir(dirname(candidate), { recursive: true })
  return candidate
}

export async function copyTo(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(src, dest)
}
