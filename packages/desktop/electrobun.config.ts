import type { ElectrobunConfig } from "electrobun";

const hasDeveloperId = !!process.env.ELECTROBUN_DEVELOPER_ID;
const hasNotarizeCreds =
  !!(process.env.ELECTROBUN_APPLEID && process.env.ELECTROBUN_APPLEIDPASS && process.env.ELECTROBUN_TEAMID) ||
  !!(process.env.ELECTROBUN_APPLEAPIISSUER && process.env.ELECTROBUN_APPLEAPIKEY && process.env.ELECTROBUN_APPLEAPIKEYPATH);

export default {
  app: {
    name: "Hance",
    identifier: "studio.orva.hance",
    version: "0.9.1",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    // Bundles the built web app into the packaged .app so it works on a
    // machine that never had this repo cloned. Without this, the shipped
    // app's local server has nothing to serve and 404s on every request.
    copy: {
      "../ui/dist": "ui-dist",
    },
    mac: {
      icons: "icon.iconset",
      bundleCEF: false,
      codesign: hasDeveloperId,
      notarize: hasDeveloperId && hasNotarizeCreds,
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
