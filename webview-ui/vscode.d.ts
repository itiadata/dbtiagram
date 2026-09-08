interface Window {
  acquireVsCodeApi(): import('./vscode-api').VsCodeApi;
}

declare module '*.md' {
  const content: string;
  export default content;
}
