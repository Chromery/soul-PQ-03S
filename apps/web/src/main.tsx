import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Authentication } from "./Auth";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Authentication><App /></Authentication>
  </React.StrictMode>,
);
