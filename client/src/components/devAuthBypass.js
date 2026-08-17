// Dev-only auth bypass shared by ProtectedRoute and PublicRoute.
//
// import.meta.env.DEV is true only under `vite dev` and is statically
// replaced with `false` in production builds, so anything gated on this
// flag is dead code (and stripped by the bundler) in prod.
//
// To remove the bypass entirely: delete this file, then in
// ProtectedRoute.jsx and PublicRoute.jsx remove the DEV_BYPASS_AUTH import
// and every `if (DEV_BYPASS_AUTH)` block.
export const DEV_BYPASS_AUTH = import.meta.env.DEV;
