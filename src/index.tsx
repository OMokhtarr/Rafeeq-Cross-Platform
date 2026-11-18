import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  setActivePageLayout,
} from "./app/core/services/data/metadata.service";
import {
  readSelectedMushaf,
  syncNativePageLayout,
} from "./app/core/services/data/quran.service";
import { layoutFor } from "./app/core/services/api/mushaf.config";
import "./index.css";

// Before the first render: every page lookup must already use the selected
// mushaf's layout.
const bootLayout = layoutFor(readSelectedMushaf());
setActivePageLayout(bootLayout);
syncNativePageLayout(bootLayout);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
