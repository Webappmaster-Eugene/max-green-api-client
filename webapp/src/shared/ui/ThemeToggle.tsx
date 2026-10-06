import {
  ActionIcon,
  Tooltip,
  useMantineColorScheme,
  useComputedColorScheme,
} from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";
export function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");
  return (
    <Tooltip label="Сменить тему">
      <ActionIcon
        variant="subtle"
        aria-label="Сменить тему"
        onClick={() => setColorScheme(scheme === "light" ? "dark" : "light")}
      >
        {scheme === "light" ? <IconMoon size={20} /> : <IconSun size={20} />}
      </ActionIcon>
    </Tooltip>
  );
}
