import { useEffect, useState } from 'react';
import { DiagramPresentationProvider } from '../webview-ui/presentation-mode';
import { DiagramMenu } from './DiagramMenu';
import { StaticDiagram } from './StaticDiagram';
import { parseStaticDiagramHash, type StaticDiagramRoute, type StaticSiteData } from '../src/shared/staticSite';

export interface StaticAppProps { data: StaticSiteData }
export function StaticApp({ data }: StaticAppProps): JSX.Element {
  const [route, setRoute] = useState<StaticDiagramRoute | null>(() => parseStaticDiagramHash(location.hash));
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const handler = (): void => setRoute(parseStaticDiagramHash(location.hash)); addEventListener('hashchange', handler); return () => removeEventListener('hashchange', handler); }, []);
  const open = (next: StaticDiagramRoute): void => { location.hash = `#/${next}`; };
  return <DiagramPresentationProvider mode="readonly"><div className={dark ? 'static-app static-app--dark' : 'static-app static-app--light'}><button className="theme-toggle" type="button" onClick={() => setDark((value) => !value)}>{dark ? 'Use light theme' : 'Use dark theme'}</button>{route === null ? <DiagramMenu data={data} onOpen={open} /> : <StaticDiagram key={route} data={data} route={route} onBack={() => { location.hash = '#/'; }} />}</div></DiagramPresentationProvider>;
}
