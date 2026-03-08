import definitions from '../../shared/window-definitions.json'

export type AppWindowKind = 'main' | 'settings' | 'about'
export type ChildWindowKind = Exclude<AppWindowKind, 'main'>

export interface ChildWindowDefinition {
  label: ChildWindowKind
  title: string
  width: number
  height: number
  resizable: boolean
}

export const CHILD_WINDOW_DEFINITIONS = definitions as Record<ChildWindowKind, ChildWindowDefinition>
