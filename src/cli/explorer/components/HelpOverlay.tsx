import React from "react";
import { Box, Text, useInput } from "ink";
import { useAppContext } from "../context/AppContext.js";

export const HelpOverlay: React.FC = () => {
  const { dispatch } = useAppContext();

  useInput((input, key) => {
    if (input === "?" || key.escape) {
      dispatch({ type: "TOGGLE_HELP" });
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={2}
      paddingY={1}
      marginX={2}
      marginY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold>Keyboard Shortcuts</Text>
        <Text dimColor>[?] Close</Text>
      </Box>

      <Box>
        {/* Left column - Navigation */}
        <Box flexDirection="column" width={30}>
          <Text bold underline>Navigation</Text>
          <Text>
            <Text dimColor>↑/k     </Text>Move up
          </Text>
          <Text>
            <Text dimColor>↓/j     </Text>Move down
          </Text>
          <Text>
            <Text dimColor>←/h     </Text>Previous page
          </Text>
          <Text>
            <Text dimColor>→/l     </Text>Next page
          </Text>
          <Text>
            <Text dimColor>g       </Text>Go to first
          </Text>
          <Text>
            <Text dimColor>G       </Text>Go to last
          </Text>
        </Box>

        {/* Right column - Actions */}
        <Box flexDirection="column" width={30}>
          <Text bold underline>Actions</Text>
          <Text>
            <Text dimColor>Enter   </Text>View details
          </Text>
          <Text>
            <Text dimColor>s       </Text>Quick stance
          </Text>
          <Text>
            <Text dimColor>f       </Text>Open filters
          </Text>
          <Text>
            <Text dimColor>r       </Text>Reset filters
          </Text>
          <Text>
            <Text dimColor>q       </Text>Quit
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        {/* Left column - Stance */}
        <Box flexDirection="column" width={30}>
          <Text bold underline>Stance Recording</Text>
          <Text>
            <Text dimColor>a       </Text>Agree
          </Text>
          <Text>
            <Text dimColor>d       </Text>Disagree
          </Text>
          <Text>
            <Text dimColor>n       </Text>Neutral
          </Text>
          <Text>
            <Text dimColor>u       </Text>Uncertain
          </Text>
        </Box>

        {/* Right column - Detail view */}
        <Box flexDirection="column" width={30}>
          <Text bold underline>In Detail View</Text>
          <Text>
            <Text dimColor>Esc/⌫   </Text>Go back
          </Text>
          <Text>
            <Text dimColor>e       </Text>Edit note
          </Text>
          <Text>
            <Text dimColor>x       </Text>Remove stance
          </Text>
        </Box>
      </Box>

      <Box marginTop={1} justifyContent="center">
        <Text dimColor>Press ? or Esc to close</Text>
      </Box>
    </Box>
  );
};
