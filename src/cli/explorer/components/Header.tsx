import React from "react";
import { Box, Text } from "ink";
import { useDatabase } from "../context/DatabaseContext.js";
import { useAppContext } from "../context/AppContext.js";

export const Header: React.FC = () => {
  const { isConnected, error } = useDatabase();
  const { state } = useAppContext();

  const getTitle = () => {
    switch (state.currentScreen) {
      case "detail":
        return "Claim Detail";
      case "filter":
        return "Filter Claims";
      default:
        return "Claims Browser";
    }
  };

  const getConnectionStatus = () => {
    if (error) {
      return { symbol: "✗", color: "red" as const, text: "Disconnected" };
    }
    if (isConnected) {
      return { symbol: "●", color: "green" as const, text: "Connected" };
    }
    return { symbol: "○", color: "yellow" as const, text: "Connecting..." };
  };

  const status = getConnectionStatus();

  return (
    <Box
      borderStyle="single"
      borderBottom={true}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold>My Slow News - {getTitle()}</Text>
      <Box>
        <Text color={status.color}>{status.symbol}</Text>
        <Text> {status.text} </Text>
        <Text dimColor>[?] Help</Text>
      </Box>
    </Box>
  );
};
