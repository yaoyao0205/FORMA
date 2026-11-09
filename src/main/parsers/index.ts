import { stlParser } from './stl'
import { objParser } from './obj'
import { threeMfParser } from './threemf'
import type { MeshParser } from './types'

const registry: MeshParser[] = [stlParser, objParser, threeMfParser]

export const SUPPORTED_EXTENSIONS = registry.flatMap((p) => p.extensions)

export function parserFor(ext: string): MeshParser | undefined {
  const clean = ext.replace('.', '').toLowerCase()
  return registry.find((p) => p.extensions.includes(clean))
}

export function parserLabel(ext: string): string {
  return parserFor(ext)?.label ?? ext.toUpperCase()
}
