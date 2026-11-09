export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function asString(v: unknown, field: string, max = 4096): string {
  if (typeof v !== 'string') throw new ValidationError(`${field} 必须是字符串`)
  if (v.length > max) throw new ValidationError(`${field} 过长`)
  return v
}

export function asOptionalString(v: unknown, field: string, max = 4096): string | undefined {
  if (v === undefined || v === null) return undefined
  return asString(v, field, max)
}

export function asId(v: unknown, field = 'id'): string {
  const s = asString(v, field, 128)
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(s)) throw new ValidationError(`${field} 格式非法`)
  return s
}

export function asIdArray(v: unknown, field = 'ids'): string[] {
  if (!Array.isArray(v)) throw new ValidationError(`${field} 必须是数组`)
  if (v.length > 5000) throw new ValidationError(`${field} 数量过多`)
  return v.map((x) => asId(x, field))
}

export function asNumber(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ValidationError(`${field} 必须是数字`)
  return v
}

export function asOptionalNumber(v: unknown, field: string): number | undefined {
  if (v === undefined || v === null) return undefined
  return asNumber(v, field)
}

export function asBoolean(v: unknown, field: string, fallback = false): boolean {
  if (v === undefined || v === null) return fallback
  if (typeof v !== 'boolean') throw new ValidationError(`${field} 必须是布尔值`)
  return v
}

export function asObject(v: unknown, field: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ValidationError(`${field} 必须是对象`)
  }
  return v as Record<string, unknown>
}

export function oneOf<T extends string>(v: unknown, values: readonly T[], field: string, fallback?: T): T {
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback
    throw new ValidationError(`${field} 缺失`)
  }
  if (typeof v !== 'string' || !values.includes(v as T)) {
    throw new ValidationError(`${field} 取值非法`)
  }
  return v as T
}
