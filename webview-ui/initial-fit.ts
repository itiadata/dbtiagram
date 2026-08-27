/**
 * Pure policy for the one-off post-measurement viewport fit (spec 21).
 *
 * `DiagramCanvas` fits the view once React Flow has actually measured the table
 * cards. That corrective fit used to run in a passive effect — i.e. after the
 * browser had already painted the un-fitted layout — so it could land between a
 * user's pointerdown and pointerup, slide the card out from under the cursor and
 * swallow the click. It now runs pre-paint and is abandoned entirely as soon as
 * the user touches the canvas.
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
