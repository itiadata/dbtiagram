/** Diagram domain selected for one panel. Shared and VS Code independent. */
export type DiagramMode = 'model' | 'source';

export interface DiagramModeLabels {
  fileSection: 'Model yml files' | 'Source yml files';
  entitySection: 'Models' | 'Tables';
  entitySingular: 'model' | 'table';
  sourceFile: 'model.yml' | 'source yml';
}

export function diagramModeLabels(mode: DiagramMode): DiagramModeLabels {
  return mode === 'source'
    ? { fileSection: 'Source yml files', entitySection: 'Tables', entitySingular: 'table', sourceFile: 'source yml' }
    : { fileSection: 'Model yml files', entitySection: 'Models', entitySingular: 'model', sourceFile: 'model.yml' };
}
