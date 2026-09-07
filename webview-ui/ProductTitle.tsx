export interface ProductTitleProps {
  version: string | null;
}

export function ProductTitle(props: ProductTitleProps): JSX.Element {
  return (
    <div className="app__product">
      <h1>dbt Diagram</h1>
      {props.version !== null && <span className="app__version">v{props.version}</span>}
    </div>
  );
}
