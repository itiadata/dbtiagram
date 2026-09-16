import { createContext, useContext, type ReactNode } from 'react';

export type DiagramPresentationMode = 'edit' | 'readonly';
export interface DiagramPresentationProviderProps { mode: DiagramPresentationMode; children: ReactNode }

const DiagramPresentationContext = createContext<DiagramPresentationMode>('edit');

export function DiagramPresentationProvider({ mode, children }: DiagramPresentationProviderProps): JSX.Element {
  return <DiagramPresentationContext.Provider value={mode}>{children}</DiagramPresentationContext.Provider>;
}

export function useDiagramPresentationMode(): DiagramPresentationMode {
  return useContext(DiagramPresentationContext);
}
