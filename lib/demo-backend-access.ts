export function isDemoBackendEnabled() {
  return process.env.NODE_ENV !== "production";
}
