import { createRoot } from 'react-dom/client';
import { StaticApp } from './StaticApp';
import { readStaticSiteData } from './static-data';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Root element is missing');
createRoot(root).render(<StaticApp data={readStaticSiteData(document)} />);
