/**
 * Left sidebar of the diagram webview (spec 05): a Filter section with two
 * checkbox lists — model yml files (with file precedence) and models. Both
 * lists have a search box that narrows the visible rows without changing the
 * diagram, and All / None buttons that select or clear the whole level at once.
 * Every section (Filter and each sub-section) collapses/expands via a chevron
 * toggle in its header; the sidebar is deliberately generic so future features
 * can add their own collapsible sections to the column.
 */
import { useState, type ReactNode } from 'react';
import { matchesSearch } from '../src/shared/filter';
import type { DiagramModelFile } from '../src/shared/protocol';

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Optional `checked/total` label shown in the header, kept visible while collapsed. */
  count?: string;
  /** Optional extra header controls (e.g. the All / None bulk buttons). */
  actions?: ReactNode;
  /** Larger title styling for the top-level sections in the sidebar column. */
  large?: boolean;
  children: ReactNode;
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  count,
  actions,
  large,
  children,
}: CollapsibleSectionProps): JSX.Element {
  return (
    <section className={`sidebar__section${large ? ' sidebar__section--filter' : ''}`}>
      <div className="sidebar__section-header">
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span
            className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`}
            aria-hidden="true"
          />
          <span className="sidebar__section-title">{title}</span>
        </button>
        {actions !== undefined && <span className="sidebar__bulk">{actions}</span>}
        {count !== undefined && <span className="sidebar__count">{count}</span>}
      </div>
      {open && <div className="sidebar__section-body">{children}</div>}
    </section>
  );
}

interface FilterSidebarProps {
  files: DiagramModelFile[];
  /** Models of currently checked files — the reactive universe of the Models list. */
  availableModelNames: string[];
  selectedFiles: ReadonlySet<string>;
  selectedModels: ReadonlySet<string>;
  fileSearch: string;
  modelSearch: string;
  onFileSearchChange: (value: string) => void;
  onModelSearchChange: (value: string) => void;
  onToggleFile: (uri: string, checked: boolean) => void;
  onToggleModel: (name: string, checked: boolean) => void;
  onSelectAllFiles: () => void;
  onClearFiles: () => void;
  onSelectAllModels: () => void;
  onClearModels: () => void;
}

export function FilterSidebar({
  files,
  availableModelNames,
  selectedFiles,
  selectedModels,
  fileSearch,
  modelSearch,
  onFileSearchChange,
  onModelSearchChange,
  onToggleFile,
  onToggleModel,
  onSelectAllFiles,
  onClearFiles,
  onSelectAllModels,
  onClearModels,
}: FilterSidebarProps): JSX.Element {
  // Collapse toggles are plain webview state: they survive panel hide/reveal
  // (retainContextWhenHidden) and reset on reopen. All filter data still flows
  // through props.
  const [filterOpen, setFilterOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const [modelsOpen, setModelsOpen] = useState(true);

  const visibleFiles = files.filter((file) => matchesSearch(file.label, fileSearch));
  const visibleModels = availableModelNames.filter((name) => matchesSearch(name, modelSearch));
  const checkedFileCount = files.filter((file) => selectedFiles.has(file.uri)).length;
  const checkedModelCount = availableModelNames.filter((name) => selectedModels.has(name)).length;

  return (
    <aside className="sidebar">
      <CollapsibleSection
        title="Filter"
        open={filterOpen}
        onToggle={() => setFilterOpen((open) => !open)}
        large
      >
        <CollapsibleSection
          title="Model yml files"
          count={`${checkedFileCount}/${files.length}`}
          open={filesOpen}
          onToggle={() => setFilesOpen((open) => !open)}
          actions={
            <>
              <button
                type="button"
                className="sidebar__bulk-button"
                aria-label="Select all model yml files"
                disabled={checkedFileCount === files.length}
                onClick={onSelectAllFiles}
              >
                All
              </button>
              <button
                type="button"
                className="sidebar__bulk-button"
                aria-label="Clear model yml files selection"
                disabled={checkedFileCount === 0}
                onClick={onClearFiles}
              >
                None
              </button>
            </>
          }
        >
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
        </CollapsibleSection>

        <CollapsibleSection
          title="Models"
          count={`${checkedModelCount}/${availableModelNames.length}`}
          open={modelsOpen}
          onToggle={() => setModelsOpen((open) => !open)}
          actions={
            <>
              <button
                type="button"
                className="sidebar__bulk-button"
                aria-label="Select all models"
                disabled={checkedModelCount === availableModelNames.length}
                onClick={onSelectAllModels}
              >
                All
              </button>
              <button
                type="button"
                className="sidebar__bulk-button"
                aria-label="Clear models selection"
                disabled={checkedModelCount === 0}
                onClick={onClearModels}
              >
                None
              </button>
            </>
          }
        >
          <input
            className="sidebar__search"
            aria-label="Search models"
            placeholder="Search models…"
            value={modelSearch}
            onChange={(e) => onModelSearchChange(e.target.value)}
          />
          <ul className="sidebar__list">
            {availableModelNames.length === 0 && (
              <li className="sidebar__empty">No files selected</li>
            )}
            {availableModelNames.length > 0 && visibleModels.length === 0 && (
              <li className="sidebar__empty">No matches</li>
            )}
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
        </CollapsibleSection>
      </CollapsibleSection>
    </aside>
  );
}
