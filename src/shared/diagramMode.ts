/** Entity/file domain within a combined diagram. Shared and VS Code independent. */
export type DiagramDomain = 'model' | 'source';
/** File-classification compatibility alias; combined panels do not have a mode. */
export type DiagramMode = DiagramDomain;

export interface DiagramDomainLabels {
  fileSection: 'Model YAML files' | 'Source YAML files';
  entitySection: 'Models' | 'Sources';
  entitySingular: 'model' | 'source';
  sourceFile: 'model.yml' | 'source yml';
}

export function diagramDomainLabels(domain: DiagramDomain): DiagramDomainLabels {
  return domain === 'source'
    ? { fileSection: 'Source YAML files', entitySection: 'Sources', entitySingular: 'source', sourceFile: 'source yml' }
    : { fileSection: 'Model YAML files', entitySection: 'Models', entitySingular: 'model', sourceFile: 'model.yml' };
}
