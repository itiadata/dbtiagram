/**
 * Pure policy for viewport-fit timing (spec 21 corrective fit + spec 32
 * deferred pending fit).
 *
 * `DiagramCanvas` fits the view once React Flow has actually measured the table
 * cards. The corrective fit (spec 21) runs pre-paint and is abandoned if the
 * user has touched the canvas. The deferred pending fit (spec 32) runs after
 * the new node positions are committed, so `fitView` measures the arrangement
 * the user just asked for.
 */

/**
 * Whether the one-off post-measurement corrective fit should run now.
 * True only when the cards have been measured, the fit has not already run,
 * and the user has not yet touched the canvas.
 */
export function shouldRunInitialFit(
  nodesInitialized: boolean,
  alreadyFitted: boolean,
  userInteracted: boolean,
): boolean {
  return nodesInitialized && !alreadyFitted && !userInteracted;
}

/**
 * Whether an owed viewport fit (spec 32) should run now: a fit was requested by
 * the adopt effect and React Flow has measured the nodes. Unlike
 * `shouldRunInitialFit`, this ignores whether the user has touched the canvas —
 * the fit is the direct result of an action the user just took (Auto-layout,
 * a filter toggle, opening a layout, a new table appearing).
 */
export function shouldRunPendingFit(nodesInitialized: boolean, fitPending: boolean): boolean {
  return nodesInitialized && fitPending;
}
