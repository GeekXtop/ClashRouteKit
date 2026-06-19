import { createRoot } from "react-dom/client";
import App from "./App.js";
import { AppProviders } from "./components/AppProviders.js";
import "antd/dist/reset.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <AppProviders>
    <App />
  </AppProviders>,
);
