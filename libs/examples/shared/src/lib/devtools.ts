/**
 * `?devtools` switches the agent's debugger events on, also in a production build. The
 * playground on the docs site uses it for its "Devtools" switch.
 */
export function devtoolsFromUrl(): boolean {
  return new URLSearchParams(location.search).has('devtools');
}
