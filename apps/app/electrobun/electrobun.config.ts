import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Milady",
    identifier: "com.miladyai.milady",
    version: "2.0.0-alpha.76",
    urlSchemes: ["milady"],
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
  build: {
    bun: {
      entrypoint: "src/index.ts",
    },
    views: {},
    copy: {
      renderer: "renderer",
      "staged/md": "md",
      "staged/assets": "assets",
    },
    mac: {
      codesign: true,
      notarize: true,
      defaultRenderer: "native",
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
  release: {
    baseUrl: "https://milady.ai/releases/",
    generatePatch: false,
  },
} satisfies ElectrobunConfig;





