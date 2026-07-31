/**
 * Left sidebar of the diagram webview (spec 05): a Filter section with two
 * checkbox lists — model yml files (with file precedence) and models. Both
 * lists have a search box that narrows the visible rows without changing the
 * diagram. The sidebar is deliberately generic so future features can add
 * their own sections here.
 */
import { matchesSearch } from '../src/shared/filter';
import type { DiagramModelFile } from '../src/shared/protocol';

interface FilterSidebarProps {
  files: DiagramModelFile[];
  selectedFiles: ReadonlySet<string>;
  selectedModels: ReadonlySet<string>;
  fileSearch: string;
  modelSearch: string;
  onFileSearchChange: (value: string) => void;
  onModelSearchChange: (value: string) => void;
  onToggleFile: (uri: string, checked: boolean) => void;
  onToggleModel: (name: string, checked: boolean) => void;
}

export function FilterSidebar({
  files,
  selectedFiles,
  selectedModels,
  fileSearch,
  modelSearch,
  onFileSearchChange,
  onModelSearchChange,
  onToggleFile,
  onToggleModel,
}: FilterSidebarProps): JSX.Element {
  // Model names are unique in dbt; dedupe in case a name ever spans files.
  const allModelNames = [...new Set(files.flatMap((file) => file.models))];
  const visibleFiles = files.filter((file) => matchesSearch(file.label, fileSearch));
  const visibleModels = allModelNames.filter((name) => matchesSearch(name, modelSearch));
  const checkedFileCount = files.filter((file) => selectedFiles.has(file.uri)).length;
  const checkedModelCount = allModelNames.filter((name) => selectedModels.has(name)).length;

  return (
    <aside className="sidebar">
      <h2 className="sidebar__title">Filter</h2>

      <section className="sidebar__section">
        <header className="sidebar__section-header">
          <h3>Model yml files</h3>
          <span className="sidebar__count">
            {checkedFileCount}/{files.length}
          </span>
        </header>
        <input
          className="sidebar__search"
          aria-label="Search model yml files"
          placeholder="Search files…"
          value={fileSearch}
          onChange={(e) => onFileSearchChange(e.target.value)}
        />
        <ul className="sidebar__list">
          {visibleFiles.map((file) => (
            <li key={file.uri}>
              <label className="sidebar__item">
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.uri)}
                  onChange={(e) => onToggleFile(file.uri, e.target.checked)}
                />
                <span className="sidebar__item-label" title={file.uri}>
                  {file.label}
                </span>
              </label>
            </li>
          ))}
          {visibleFiles.length === 0 && <li className="sidebar__empty">No matches</li>}
        </ul>
      </section>

      <section className="sidebar__section">
        <header className="sidebar__section-header">
          <h3>Models</h3>
          <span className="sidebar__count">
            {checkedModelCount}/{allModelNames.length}
          </span>
        </header>
        <input
          className="sidebar__search"
          aria-label="Search models"
          placeholder="Search models…"
          value={modelSearch}
          onChange={(e) => onModelSearchChange(e.target.value)}
        />
        <ul className="sidebar__list">
          {visibleModels.map((name) => (
            <li key={name}>
              <label className="sidebar__item">
                <input
                  type="checkbox"
                  checked={selectedModels.has(name)}
                  onChange={(e) => onToggleModel(name, e.target.checked)}
                />
                <span className="sidebar__item-label">{name}</span>
              </label>
            </li>
          ))}
          {visibleModels.length === 0 && <li className="sidebar__empty">No matches</li>}
        </ul>
      </section>
    </aside>
  );
}
