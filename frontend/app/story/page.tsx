import type { Metadata } from "next";
import StoryPage from "./StoryPage";

export const metadata: Metadata = {
  title: "NutriSync | Your thali, understood",
  description: "Snap your plate, say what you ate, or type it. NutriSync is an AI nutrition coach built for Indian food.",
};

export default function Page() {
  return <StoryPage />;
}
