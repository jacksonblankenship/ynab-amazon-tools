// Runs before every test file (see vitest.config.ts). Each test starts with empty GM
// storage and an empty page.
import { beforeEach } from "vitest";
import { gm } from "./gm.ts";

beforeEach(() => {
  gm.reset();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});
