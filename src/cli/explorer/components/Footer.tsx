import React from "react";
import { Box, Text } from "ink";
import { useAppContext } from "../context/AppContext.js";

interface ShortcutItem {
  key: string;
  label: string;
}

const listShortcuts: ShortcutItem[] = [
  { key: "↑↓", label: "navigate" },
  { key: "←→", label: "pages" },
  { key: "⏎", label: "view" },
  { key: "s", label: "stance" },
  { key: "f", label: "filter" },
  { key: "q", label: "quit" },
];

const detailShortcuts: ShortcutItem[] = [
  { key: "⌫", label: "back" },
  { key: "a/d/n/u", label: "stance" },
  { key: "e", label: "edit note" },
  { key: "?", label: "help" },
];

const filterShortcuts: ShortcutItem[] = [
  { key: "Tab", label: "next field" },
  { key: "⏎", label: "apply" },
  { key: "Esc", label: "cancel" },
  { key: "r", label: "reset" },
];

export const Footer: React.FC = () => {
  const { state } = useAppContext();

  const getShortcuts = (): ShortcutItem[] => {
    if (state.showFilter) return filterShortcuts;
    if (state.currentScreen === "detail") return detailShortcuts;
    return listShortcuts;
  };

  const shortcuts = getShortcuts();

  return (
    <Box
      borderStyle="single"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      {shortcuts.map((shortcut, index) => (
        <React.Fragment key={shortcut.key}>
          {index > 0 && <Text>  </Text>}
          <Text dimColor>{shortcut.key}</Text>
          <Text> {shortcut.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
};
