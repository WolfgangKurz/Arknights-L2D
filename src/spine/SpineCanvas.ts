import { spine } from "@/spine-runtime/spine-webgl";
// import { ManagedWebGLRenderingContext, SceneRenderer, AssetManager, Input, SpineCanvasConfig } from "@/spine-runtime/spine-webgl";

/** Configuration passed to the {@link SpineCanvas} constructor */
export interface SpineCanvasConfig {
	app: any;
	pathPrefix?: string;
	webglConfig?: any;
}

export default class SpineCanvas {
	readonly context: spine.webgl.ManagedWebGLRenderingContext;

	/** Tracks the current time, delta, and other time related statistics. */
	readonly time = new spine.TimeKeeper();
	/** The HTML canvas to render to. */
	readonly htmlCanvas: HTMLCanvasElement;
	/** The WebGL rendering context. */
	readonly gl: WebGLRenderingContext;
	/** The scene renderer for easy drawing of skeletons, shapes, and images. */
	readonly renderer: spine.webgl.SceneRenderer;
	/** The asset manager to load assets with. */
	readonly assetManager: spine.webgl.AssetManager;
	/** The input processor used to listen to mouse, touch, and keyboard events. */
	readonly input: spine.webgl.Input;

	private disposed = false;

	/** Constructs a new spine canvas, rendering to the provided HTML canvas. */
	constructor (canvas: HTMLCanvasElement, config: SpineCanvasConfig) {
		if (!config.pathPrefix) config.pathPrefix = "";
		if (!config.app) config.app = {
			loadAssets: () => { },
			initialize: () => { },
			update: () => { },
			render: () => { },
			error: () => { },
		};
		if (!config.webglConfig) config.webglConfig = { alpha: true };

		this.htmlCanvas = canvas;
		this.context = new spine.webgl.ManagedWebGLRenderingContext(canvas, config.webglConfig);
		this.renderer = new spine.webgl.SceneRenderer(canvas, this.context);
		this.gl = this.context.gl;
		this.assetManager = new spine.webgl.AssetManager(this.context, config.pathPrefix);
		this.input = new spine.webgl.Input(canvas);

		if (config.app.loadAssets) config.app.loadAssets(this);

		const loop = () => {
			this.time.update();
			if (config.app.update) config.app.update(this, this.time.delta);
			if (config.app.render) config.app.render(this);

			if (!this.disposed) requestAnimationFrame(loop);
		};

		const waitForAssets = () => {
			if (this.assetManager.isLoadingComplete()) {
				if (this.assetManager.hasErrors()) {
					if (config.app.error) config.app.error(this, this.assetManager.getErrors());
				} else {
					if (config.app.initialize) config.app.initialize(this);
					loop();
				}
				return;
			}

			if (!this.disposed) requestAnimationFrame(waitForAssets);
		};
		requestAnimationFrame(waitForAssets);
	}

	/** Clears the canvas with the given color. The color values are given in the range [0,1]. */
	clear (r: number, g: number, b: number, a: number) {
		this.gl.clearColor(r, g, b, a);
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);
	}

	destroy () {
		this.disposed = true;
	}
}
