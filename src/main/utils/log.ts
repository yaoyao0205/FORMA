const prefix = '[forma]'

export function logInfo(...args: unknown[]): void {
  console.log(prefix, ...args)
}

export function logWarn(...args: unknown[]): void {
  console.warn(prefix, ...args)
}

export function logError(...args: unknown[]): void {
  console.error(prefix, ...args)
}
