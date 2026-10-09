export type Row = {
  cwd: string
  label: string
  isVersion: boolean
  port?: number
  effort?: string
  model?: string
  isRunning: boolean
  minutes?: number
}

export type Board = { rows: Row[]; at: number }

declare module 'claude-code' {
  interface PluginState {
    'version-board': { board: Board }
  }
}
