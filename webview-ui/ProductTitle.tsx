export interface ProductTitleProps {
  version: string | null;
  updateStatus: 'unknown' | 'upToDate' | 'updateAvailable';
  onCheckForUpdates: () => void;
}

export function ProductTitle(props: ProductTitleProps): JSX.Element {
  return (
    <div className="app__product">
      <h1>dbt Diagram</h1>
      {props.version !== null && (
        <span className="app__version">
          <span>v{props.version}</span>
          {props.updateStatus === 'upToDate' ? <span> (Up to date)</span> : (
            <button
              type="button"
              className={props.updateStatus === 'updateAvailable'
                ? 'app__update-check app__update-check--available'
                : 'app__update-check'}
              onClick={props.onCheckForUpdates}
            >
              {props.updateStatus === 'updateAvailable' ? 'Update available' : 'Check for updates'}
            </button>
          )}
        </span>
      )}
    </div>
  );
}
