export function isRouteWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(root + "/");
}
