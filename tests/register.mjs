import { register } from "node:module";

register("./ts-resolver.mjs", { parentURL: import.meta.url });
