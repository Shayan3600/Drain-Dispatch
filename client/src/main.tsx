import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CityReview from "./CityReview";
import "leaflet/dist/leaflet.css";
import "./styles.css";
// Keep the resident app (including private report-draft URLs) unchanged.
const isCityReview = /^\/city\/?$/.test(window.location.pathname);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isCityReview ? <CityReview /> : <App />}
  </React.StrictMode>,
);
