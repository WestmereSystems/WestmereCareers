import { z } from "zod";

/** Australian dollar amounts, preserving cents for hourly or annual pay. */
export const moneyAmount = z
  .number()
  .finite()
  .nonnegative()
  .max(100_000_000)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000_001,
    "Use no more than two decimal places for pay.",
  );
