import { Mastra } from "@mastra/core/mastra";
import { summarizerAgent, extractorAgent } from "./agents";

export const mastra = new Mastra({
  agents: {
    summarizer: summarizerAgent,
    extractor: extractorAgent,
  },
});

export function getSummarizerAgent() {
  return mastra.getAgent("summarizer");
}

export function getExtractorAgent() {
  return mastra.getAgent("extractor");
}
