import { loadConfig, findLocalConfig, GLOBAL_CONFIG_PATH, type HanceConfig } from "../config";

const CONFIG_HELP = `\
hance config           show the active config file path and its values
hance config path      print only the active config file path

One config file is applied (a local file shadows the global one; CLI flags override it):
  ./.hancerc.json               project config, searched upward from cwd
  ~/.config/hance/config.json   global config (used only if no local file)
`;

export function formatConfig(config: HanceConfig, source: string | null, searchedLocal: string | null): string {
  if (!source) {
    return [
      "No config file found. Searched:",
      `  ${searchedLocal ?? "./.hancerc.json (not found)"}`,
      `  ${GLOBAL_CONFIG_PATH}`,
    ].join("\n");
  }
  return `Active config: ${source}\n${JSON.stringify(config, null, 2)}`;
}

export async function runConfig(argv: string[]): Promise<void> {
  if (argv[0] === "--help" || argv[0] === "-h") {
    console.log(CONFIG_HELP);
    return;
  }

  const { config, source } = await loadConfig();

  if (argv[0] === "path") {
    if (source) {
      console.log(source);
    } else {
      console.error("No config file found.");
      process.exit(1);
    }
    return;
  }

  console.log(formatConfig(config, source, findLocalConfig(process.cwd())));
}
