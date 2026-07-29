/**
 * Metro resolves an image import to a numeric asset handle. Declared here
 * rather than inherited from `expo/tsconfig.base` so the app's typecheck does
 * not depend on which base config is in play.
 */
declare module "*.png" {
  const asset: number;
  export default asset;
}
