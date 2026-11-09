import { getDb } from './database'
import type { AppSettings, Unit } from '@shared/types'

const DEFAULTS: AppSettings = {
  defaultUnit: 'mm',
  externalApps: [],
  gridDensity: 'cozy',
  background: 'dark'
}

export function getSettings(): AppSettings {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const unit = (map.get('defaultUnit') ?? 'mm') as Unit
  const density = (map.get('gridDensity') ?? 'cozy') as AppSettings['gridDensity']
  const background = (map.get('background') ?? 'dark') as AppSettings['background']
  let externalApps: AppSettings['externalApps'] = []
  try {
    const raw = map.get('externalApps')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        externalApps = parsed
          .filter((x) => x && typeof x.label === 'string' && typeof x.path === 'string')
          .map((x) => ({ label: x.label as string, path: x.path as string }))
      }
    }
  } catch {
    externalApps = []
  }

  return {
    defaultUnit: ['mm', 'cm', 'inch'].includes(unit) ? unit : DEFAULTS.defaultUnit,
    externalApps,
    gridDensity: ['compact', 'cozy', 'roomy'].includes(density) ? density : DEFAULTS.gridDensity,
    background: ['dark', 'light', 'transparent'].includes(background) ? background : DEFAULTS.background
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb()
  const write = db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  if (patch.defaultUnit !== undefined) write.run('defaultUnit', patch.defaultUnit)
  if (patch.gridDensity !== undefined) write.run('gridDensity', patch.gridDensity)
  if (patch.background !== undefined) write.run('background', patch.background)
  if (patch.externalApps !== undefined) {
    write.run('externalApps', JSON.stringify(patch.externalApps))
  }
  return getSettings()
}
