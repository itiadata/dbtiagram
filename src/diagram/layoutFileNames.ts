export const LAYOUT_FILE_SUFFIX = '.dbtiagram.yml';

export function isLayoutFilePath(fsPath: string | undefined): boolean {
  return fsPath !== undefined && fsPath !== '' && fsPath.toLowerCase().endsWith(LAYOUT_FILE_SUFFIX);
}

export function defaultLayoutName(fsPath: string): string {
  return stripLayoutSuffix(fsPath.split(/[\\/]/).pop() ?? fsPath);
}

export function stripLayoutSuffix(name: string): string {
  return name.toLowerCase().endsWith(LAYOUT_FILE_SUFFIX)
    ? name.slice(0, name.length - LAYOUT_FILE_SUFFIX.length)
    : name;
}
