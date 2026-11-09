const api = window.forma

export const forma = {
  libraries: api.library,
  models: api.models,
  importPaths: api.importPaths,
  onImportProgress: api.onImportProgress,
  onModelsChanged: api.onModelsChanged,
  geometry: api.geometry,
  thumbnail: api.thumbnail,
  tags: api.tags,
  projects: api.projects,
  print: api.print,
  settings: api.settings,
  stats: api.stats,
  revealUserData: api.revealUserData,
  chooseExternalApp: api.chooseExternalApp,
  onMenu: api.onMenu
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
  }
  return String(error)
}
