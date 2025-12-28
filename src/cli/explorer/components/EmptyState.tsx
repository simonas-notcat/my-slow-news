import React from "react";
import { Box, Text, useInput } from "ink";

interface EmptyStateAction {
  key: string;
  label: string;
  onSelect: () => void;
}

interface EmptyStateProps {
  type:
    | "no-data"
    | "no-results"
    | "no-stances"
    | "all-rated"
    | "connection-error";
  title: string;
  description: string;
  actions: EmptyStateAction[];
  tips?: string[];
  errorDetails?: string;
}

function getIcon(
  type: EmptyStateProps["type"]
): string {
  switch (type) {
    case "no-data":
      return "📭";
    case "no-results":
      return "🔍";
    case "no-stances":
      return "📝";
    case "all-rated":
      return "✨";
    case "connection-error":
      return "⚠";
  }
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  title,
  description,
  actions,
  tips,
  errorDetails,
}) => {
  useInput((input) => {
    for (const action of actions) {
      if (input === action.key) {
        action.onSelect();
        return;
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      paddingY={2}
      paddingX={4}
    >
      <Text bold>
        {getIcon(type)} {title}
      </Text>

      <Box marginY={1}>
        <Text>{description}</Text>
      </Box>

      {tips && tips.length > 0 && (
        <Box flexDirection="column" marginY={1}>
          {tips.map((tip, i) => (
            <Text key={i} dimColor>
              • {tip}
            </Text>
          ))}
        </Box>
      )}

      {errorDetails && (
        <Box borderStyle="single" paddingX={2} marginY={1}>
          <Text color="red">{errorDetails}</Text>
        </Box>
      )}

      <Box
        flexDirection="column"
        borderStyle="round"
        paddingX={2}
        paddingY={1}
        marginTop={1}
      >
        {actions.map((action) => (
          <Text key={action.key}>
            <Text color="cyan">[{action.key}]</Text> {action.label}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
