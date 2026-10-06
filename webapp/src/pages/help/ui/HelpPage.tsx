import { Anchor, Container, Group, Typography } from "@mantine/core";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { userGuide } from "../../../shared/content";
import { ThemeToggle } from "../../../shared/ui";
export function HelpPage() {
  return (
    <Container size="md" py="xl" className="help-page">
      <Group justify="space-between" mb="xl">
        <Anchor href="/">Вернуться в Max</Anchor>
        <ThemeToggle />
      </Group>
      <Typography>
        <Markdown remarkPlugins={[remarkGfm]} skipHtml>
          {userGuide}
        </Markdown>
      </Typography>
    </Container>
  );
}
