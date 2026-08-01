import { describe, expect, it } from 'vitest';
import {
  isDiagramLayoutFile,
  layoutFileContextKey,
  modelFileContextKey,
  shouldShowButton,
} from '../../../src/vscode/editorButton';

const MODEL_PATHS = new Set([
  'c:\\repo\\models\\orders.yml',
  'c:\\repo\\models\\customers.yml',
]);

describe('shouldShowButton', () => {
  it('hides the button when no editor is active', () => {
    expect(shouldShowButton(undefined, MODEL_PATHS)).toBe(false);
  });

  it('shows the button when the active file is a model file', () => {
    expect(shouldShowButton('c:\\repo\\models\\orders.yml', MODEL_PATHS)).toBe(true);
  });

  it('hides the button when the active file is not a model file', () => {
    expect(shouldShowButton('c:\\repo\\models\\orders.sql', MODEL_PATHS)).toBe(false);
  });

  it('hides the button for an unsaved/untitled editor', () => {
    expect(shouldShowButton('', MODEL_PATHS)).toBe(false);
  });
});

describe('modelFileContextKey', () => {
  it('is the stable key used by the editor/title when clause', () => {
    expect(modelFileContextKey).toBe('dbtiagram.isModelYml');
  });
});

describe('isDiagramLayoutFile', () => {
  it('shows the layout button for .dbtiagram.yml files', () => {
    expect(isDiagramLayoutFile('c:\\repo\\diagrams\\order-marts.dbtiagram.yml')).toBe(true);
    expect(isDiagramLayoutFile('a/b/x.dbtiagram.yml')).toBe(true);
  });

  it('hides it for every other file', () => {
    expect(isDiagramLayoutFile('c:\\repo\\models\\orders.yml')).toBe(false);
    expect(isDiagramLayoutFile('x.dbtiagram.yaml')).toBe(false);
    expect(isDiagramLayoutFile('')).toBe(false);
    expect(isDiagramLayoutFile(undefined)).toBe(false);
  });
});

describe('layoutFileContextKey', () => {
  it('is the stable key used by the layout editor/title when clause', () => {
    expect(layoutFileContextKey).toBe('dbtiagram.isDiagramLayout');
  });
});
