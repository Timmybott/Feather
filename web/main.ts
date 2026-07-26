import { mount } from "svelte";
// Reuse the exact desktop theme so the web app looks identical.
import "../src/app.css";
import "./web.css";
import App from "./App.svelte";

const app = mount(App, { target: document.getElementById("app")! });

export default app;
