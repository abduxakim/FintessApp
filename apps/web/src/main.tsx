import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
