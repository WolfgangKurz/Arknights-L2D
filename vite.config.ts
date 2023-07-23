import path from "node:path";

import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default ({ mode }) => {
	const isProd = mode === "production";
	const isDev = !isProd;

	return defineConfig({
		esbuild: {
			jsxFactory: "h",
			jsxFragment: "Fragment",
			// jsxInject: `import { h, Fragment } from "preact";`,
			logOverride: {
				"this-is-undefined-in-esm": "silent",
			},
		},
		build: {
			assetsDir: "build",
			reportCompressedSize: false,
			modulePreload: { polyfill: false },

			minify: isProd,
			sourcemap: isDev,

			rollupOptions: {
				output: {
					inlineDynamicImports: false,
					manualChunks (id) {
						// entry
						if (
							id.includes("/src/index.") ||
							id.includes("/src/app.")
						) return undefined;

						// spine vendor
						if (id.includes("/spine-runtime/")) return "vendor.spine";
					},
				},
			},
		},
		plugins: [preact()],
		resolve: {
			alias: {
				"@/": `${path.resolve(__dirname, "src")}/`,
				react: "preact/compat",
				"react-dom": "preact/compat",
			},
		},
	});
};
