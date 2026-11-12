import type { Metadata } from "next";
import { CareersPlus } from "@/components/premium-pages";

export const metadata: Metadata = {
  title: "Careers+ — Your application studio",
  description:
    "Personal CV guidance, thoughtful application tailoring and a clearer view of your strengths. Careers+ costs A$25 per month.",
};

export default async function CareersPlusPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  return (
    <CareersPlus
      checkoutStatus={
        checkout === "complete"
          ? "complete"
          : checkout === "canceled"
            ? "canceled"
            : undefined
      }
    />
  );
}
