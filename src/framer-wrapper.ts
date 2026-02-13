// Dynamic wrapper for framer-api to avoid top-level await issues
let framerApiModule: any = null;

export async function getFramerApi() {
  if (!framerApiModule) {
    framerApiModule = await import("framer-api");
  }
  return framerApiModule;
}

export type { ManagedCollectionFieldInput } from "framer-api";
