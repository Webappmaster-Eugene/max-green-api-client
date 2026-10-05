import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MaxPage } from "./pages/MaxPage";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<StrictMode><MaxPage standalone /></StrictMode>);
