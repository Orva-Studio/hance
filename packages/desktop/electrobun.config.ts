import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Hance",
    identifier: "studio.orva.hance",
    version: "0.8.3",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    mac: {
      icons: "icon.iconset",
      bundleCEF: false,
    },
    win: {
      icon: "icon.iconset/icon_256x256.png",
      bundleCEF: false,
    },
    linux: {
      icon: "icon.iconset/icon_256x256.png",
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig;
