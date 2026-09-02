import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

if (window.location.pathname.startsWith("/render-lab")) {
  void import("./PdfRenderingLab").then(({ default: PdfRenderingLab }) => {
    root.render(
      <React.StrictMode>
        <PdfRenderingLab />
      </React.StrictMode>,
    );
  });
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
