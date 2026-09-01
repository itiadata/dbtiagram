/**
 * Subscribes to messages from the extension host and announces readiness.
 *
 * The listener is registered exactly once (empty dep array, as before spec 17):
 * the freshest handlers are read through a ref, so callers may pass inline
 * closures without ever re-subscribing or replaying `webview:ready`.
 */
import { useEffect, useRef } from 'react';
import { postToHost } from '../host';
import type { MessageToWebview } from '../../src/shared/protocol';
import type { OpenBehavior } from '../../src/shared/openBehavior';
import type { MatrixScope, StoredMatrixColumnPref } from '../../src/shared/matrixColumns';

export type DiagramUpdateMessage = Extract<MessageToWebview, { type: 'diagram:update' }>;
export type LayoutApplyMessage = Extract<MessageToWebview, { type: 'layout:apply' }>;
export type LayoutActiveMessage = Extract<MessageToWebview, { type: 'layout:active' }>;

export interface HostMessageHandlers {
  onDiagramUpdate: (message: DiagramUpdateMessage) => void;
  onDiagramError: (message: string) => void;
  onFilterScope: (uri: string) => void;
  onLayoutApply: (message: LayoutApplyMessage) => void;
  onLayoutActive: (message: LayoutActiveMessage) => void;
  onSettingsCurrent: (openBehavior: OpenBehavior) => void;
  onMatrixColumnPrefs: (scope: MatrixScope, columns: StoredMatrixColumnPref[]) => void;
  /** Model names that have a `.sql` file in the workspace (spec 38). */
  onSqlFiles: (models: string[]) => void;
}

export function useHostMessages(handlers: HostMessageHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const listener = (event: MessageEvent<MessageToWebview>): void => {
      const message = event.data;
      const current = handlersRef.current;
      switch (message.type) {
        case 'diagram:update':
          current.onDiagramUpdate(message);
          break;
        case 'diagram:error':
          current.onDiagramError(message.message);
          break;
        case 'filter:scope':
          current.onFilterScope(message.uri);
          break;
        case 'layout:apply':
          current.onLayoutApply(message);
          break;
        case 'layout:active':
          current.onLayoutActive(message);
          break;
        case 'settings:current':
          current.onSettingsCurrent(message.openBehavior);
          break;
        case 'matrix:columnPrefs':
          current.onMatrixColumnPrefs(message.scope, message.columns);
          break;
        case 'model:sqlFiles':
          current.onSqlFiles(message.models);
          break;
      }
    };
    window.addEventListener('message', listener);
    postToHost({ type: 'webview:ready' });
    return () => window.removeEventListener('message', listener);
  }, []);
}
