export type BusinessRegistrationCapacity = {
  tier: string | null;
  limit: number;
  owned: number;
  pending: number;
  used: number;
  remaining: number;
  canSubmit: boolean;
};
