import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppProvider } from "./app/providers/AppProvider";
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>,
  );
