import type { Metadata } from "next";
import StoryExperience from "./StoryExperience";

export const metadata: Metadata = {
  title: "NutriSync | Your thali, measured",
  description: "A scroll through NutriSync: an AI nutrition coach and tracker built for Indian food.",
};

export default function StoryPage() {
  return <StoryExperience />;
}
