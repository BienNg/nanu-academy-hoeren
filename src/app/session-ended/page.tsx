import type { Metadata } from "next";
import { SessionEndedScreen } from "@/components/SessionEndedScreen";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SessionEndedPage() {
  return <SessionEndedScreen />;
}
