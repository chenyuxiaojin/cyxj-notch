export type Progress = { done: number; total: number; now: string }

declare module 'claude-code' {
  interface PluginState {
    'task-progress': { progress: Progress | null }
  }
}
