const { build } = require("esbuild");

const sharedConfig = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  minify: true,
  // only needed if you have dependencies
  // external: Object.keys(dependencies).concat(Object.keys(peerDependencies)),
};

build({
  ...sharedConfig,
  platform: "browser",
  format: "esm",
  outfile: "dist/main.js",
});
