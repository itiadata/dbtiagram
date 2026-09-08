export interface ProductTitleProps {
  version: string | null;
  upToDate: boolean;
}

export function ProductTitle(props: ProductTitleProps): JSX.Element {
  return (
    <div className="app__product">
      <h1>dbt Diagram</h1>
      {props.version !== null && (
        <span className="app__version">
          <span>v{props.version}</span>
          {props.upToDate && <span> (Up to date)</span>}
        </span>
      )}
    </div>
  );
}
