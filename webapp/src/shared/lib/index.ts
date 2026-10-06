export const formatTime = (value: number): string =>
  new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
export const formatDate = (value: number): string =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year:
      new Date(value).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
export const chatKind = (type?: string): string =>
  type === "group"
    ? "Группа"
    : type === "channel"
      ? "Канал"
      : type === "bot"
        ? "Бот"
        : "Личный чат";
