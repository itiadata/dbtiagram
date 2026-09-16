import type { DiagramLayout } from '../src/diagram/layoutFile';

export interface LayoutCapture { label: string; before: DiagramLayout }
export interface CompletedLayoutCapture { label: string; before: DiagramLayout; after: DiagramLayout }

export function beginLayoutCapture(label: string, before: DiagramLayout): LayoutCapture {
  return { label, before };
}

export function finishLayoutCapture(capture: LayoutCapture, after: DiagramLayout): CompletedLayoutCapture | null {
  return JSON.stringify(capture.before) === JSON.stringify(after)
    ? null
    : { ...capture, after };
}
