import type { Api } from '../shared/ipc'

declare global {
  interface Window {
    forma: Api
  }
}

export {}
