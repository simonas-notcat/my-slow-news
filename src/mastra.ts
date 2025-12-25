import { Mastra } from "@mastra/core/mastra";
import { Agent } from "@mastra/core/agent";
import {
  summarizerAgent,
  extractorAgent,
  createSummarizerAgent,
  createExtractorAgent,
} from "./agents";
import { loadConfig } from "./config";
import type { Config } from "./types";

// Default Mastra instance with default agents (for backward compatibility)
export const mastra = new Mastra({
  agents: {
    summarizer: summarizerAgent,
    extractor: extractorAgent,
  },
});

// Cached config-based agents
let configuredSummarizer: Agent | null = null;
let configuredExtractor: Agent | null = null;
let lastModel: string | null = null;

/**
 * Gets the summarizer agent configured with the model from config
 */
export function getSummarizerAgent(): Agent {
  try {
    const config = loadConfig();
    const model = config.llm.model;

    // Return cached agent if model hasn't changed
    if (configuredSummarizer && lastModel === model) {
      return configuredSummarizer;
    }

    // Create new agent with config model
    configuredSummarizer = createSummarizerAgent(model);
    lastModel = model;
    return configuredSummarizer;
  } catch {
    // Fallback to default agent if config loading fails
    return mastra.getAgent("summarizer");
  }
}

/**
 * Gets the extractor agent configured with the model from config
 */
export function getExtractorAgent(): Agent {
  try {
    const config = loadConfig();
    const model = config.llm.model;

    // Return cached agent if model hasn't changed
    if (configuredExtractor && lastModel === model) {
      return configuredExtractor;
    }

    // Create new agent with config model
    configuredExtractor = createExtractorAgent(model);
    lastModel = model;
    return configuredExtractor;
  } catch {
    // Fallback to default agent if config loading fails
    return mastra.getAgent("extractor");
  }
}
