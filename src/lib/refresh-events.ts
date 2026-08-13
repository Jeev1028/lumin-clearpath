/**
 * Fired by PullToRefresh when the user completes a pull-down-to-refresh
 * gesture. The root layout listens for this to remount the current route's
 * component tree (see __root.tsx), which is what actually re-runs the
 * plain `useEffect`-based data fetching most pages use -- router/query
 * cache invalidation alone doesn't touch that.
 */
export const REFRESH_EVENT = "clearpath:refresh";
