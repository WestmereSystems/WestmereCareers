export const marketplaceOpen = async () => true;
export const assertStudioLaunchAccess = async () => {};
export const assertPurchasesOpen = async () => {};
export const assertLaunchSignIn = async (_email: string) => true;
export const assertLaunchAccount = async (_db: unknown) => ({
  allowed: true,
  kind: "existing",
  expiresAt: null,
  marketplaceOpen: true,
});
