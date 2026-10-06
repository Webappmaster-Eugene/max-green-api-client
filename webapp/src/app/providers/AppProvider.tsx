import { createTheme, MantineProvider } from "@mantine/core";
import type { AppProviderProps } from "./types";
import "@mantine/core/styles.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "../styles/global.css";

const theme = createTheme({
  primaryColor: "violet",
  fontFamily: "Manrope, system-ui, sans-serif",
  headings: { fontFamily: "Manrope, system-ui, sans-serif", fontWeight: "700" },
  defaultRadius: "md",
  cursorType: "pointer",
});
export function AppProvider({ children }: AppProviderProps) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      {children}
    </MantineProvider>
  );
}
