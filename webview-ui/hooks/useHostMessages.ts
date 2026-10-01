/**
 * Subscribes to messages from the extension host and announces readiness.
 *
 * The listener is registered exactly once (empty dep array, as before spec 17):
 * the freshest handlers are read through a ref, so callers may pass inline
 * closures without ever re-subscribing or replaying `webview:ready`.
 */
import { useEffect, useRef } from 'react';
import { postToHost } from '../host';
import type { MessageToWebview, ModelRenameImpact, SourceImportReport } from '../../src/shared/protocol';
import type { OpenBehavior } from '../../src/shared/openBehavior';
import type { MatrixScope, StoredMatrixColumnPref } from '../../src/shared/matrixColumns';
import type { HistoryState } from '../../src/shared/history';
import type { DiagramLayout } from '../../src/diagram/layoutFile';
import type { TableNode } from '../../src/diagram/graph';
import type { LineageEdge } from '../../src/diagram/lineage';
import type { LineageExpansionResult } from '../../src/webview/lineage';

export type DiagramUpdateMessage = Extract<MessageToWebview, { type: 'diagram:update' }>;
export type LayoutApplyMessage = Extract<MessageToWebview, { type: 'layout:apply' }>;
export type LayoutActiveMessage = Extract<MessageToWebview, { type: 'layout:active' }>;

export interface HostMessageHandlers {
  onDiagramUpdate: (message: DiagramUpdateMessage) => void;
  onDiagramError: (message: string) => void;
  onFilterScope: (domain: import('../../src/shared/diagramMode').DiagramDomain, uri: string) => void;
  onLayoutApply: (message: LayoutApplyMessage) => void;
  onLayoutActive: (message: LayoutActiveMessage) => void;
  onSettingsCurrent: (openBehavior: OpenBehavior) => void;
  onMatrixColumnPrefs: (scope: MatrixScope, columns: StoredMatrixColumnPref[]) => void;
  /** Model names that have a `.sql` file in the workspace (spec 38). */
  onSqlFiles: (models: string[]) => void;
  onAiPromptAvailability: (models: string[]) => void;
  onAppVersion: (version: string) => void;
  onAppUpdateStatus: (status: 'unknown' | 'upToDate' | 'updateAvailable') => void;
  onSourceImportResult: (report: SourceImportReport) => void;
  onModelRenameImpact: (impact: ModelRenameImpact) => void;
  onGroupCreateResult: (result: { name: string; models: string[] } | null) => void;
  onGroupEditTablesResult: (groupId: string, models: string[] | null) => void;
  onGroupRenameResult: (groupId: string, name: string | null) => void;
  onHistoryState: (state: HistoryState) => void;
  onHistoryApplyLayout: (layout: DiagramLayout) => void;
  onLineageState: (nodes: TableNode[], edges: LineageEdge[]) => void;
  onLineageProgress: (requestId: string, scanned: number, total: number) => void;
  onLineageResult: (result: LineageExpansionResult | null) => void;
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
          current.onFilterScope(message.domain, message.uri);
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
        case 'aiPrompt:availability':
          current.onAiPromptAvailability(message.models);
          break;
        case 'app:version':
          current.onAppVersion(message.version);
          break;
        case 'app:updateStatus':
          current.onAppUpdateStatus(message.status);
          break;
        case 'sourceImport:result':
          current.onSourceImportResult(message.report);
          break;
        case 'modelRename:impact':
          current.onModelRenameImpact(message.impact);
          break;
        case 'group:createResult':
          current.onGroupCreateResult(message.result);
          break;
        case 'group:editTablesResult':
          current.onGroupEditTablesResult(message.groupId, message.models);
          break;
        case 'group:renameResult':
          current.onGroupRenameResult(message.groupId, message.name);
          break;
        case 'history:state':
          current.onHistoryState(message.state);
          break;
        case 'history:applyLayout':
          current.onHistoryApplyLayout(message.layout);
          break;
        case 'lineage:state':
          current.onLineageState(message.nodes, message.edges);
          break;
        case 'lineage:progress':
          current.onLineageProgress(message.requestId, message.scanned, message.total);
          break;
        case 'lineage:result':
          current.onLineageResult(message.result);
          break;
      }
    };
    window.addEventListener('message', listener);
    postToHost({ type: 'webview:ready' });
    return () => window.removeEventListener('message', listener);
  }, []);
}
