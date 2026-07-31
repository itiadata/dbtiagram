import type { VsCodeApi } from './vscode-api';

declare global {
  interface Window {
    acquireVsCodeApi(): VsCodeApi;
  }
}

export {};
