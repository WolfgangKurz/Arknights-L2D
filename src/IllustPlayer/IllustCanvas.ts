import { TimeKeeper, ManagedWebGLRenderingContext, PolygonBatcher, SkeletonRenderer, AssetManager, OrthoCamera } from "@esotericsoftware/spine-webgl";
import { CameraController } from "./CameraController";

export interface SpineCanvasConfig {
	pathPrefix?: string;
}

export default class IllustCanvas {
	private disposed = false;

	readonly time = new TimeKeeper();
	readonly htmlCanvas: HTMLCanvasElement;

	readonly context: ManagedWebGLRenderingContext;
	readonly batcher: PolygonBatcher;
	readonly renderer: SkeletonRenderer;

	readonly assetManager: AssetManager;
	readonly camera: CameraController;

	readonly pathPrefix: string;

	constructor (canvas: HTMLCanvasElement, config: SpineCanvasConfig, onRender: (delta: number) => void) {
		this.htmlCanvas = canvas;
		this.pathPrefix = config.pathPrefix || "";

		const parent = canvas.parentElement!;

		const ctx = this.context = new ManagedWebGLRenderingContext(canvas, {
			alpha: true,
			premultipliedAlpha: true,
		});
		this.batcher = new PolygonBatcher(ctx);
		this.renderer = new SkeletonRenderer(ctx);

		this.assetManager = new AssetManager(ctx, this.pathPrefix);
		this.camera = new CameraController(canvas, new OrthoCamera(1, 1));

		{ // initial viewport
			const [w, h] = [parent.clientWidth, parent.clientHeight];

			canvas.width = w;
			canvas.height = h;
			this.context.gl.viewport(0, 0, w, h);

			const cam = this.camera.camera;
			cam.setViewport(w, h);
		}

		const frame = () => {
			this.time.update();

			{ // update camera
				const [w, h] = [parent.clientWidth, parent.clientHeight];

				const cam = this.camera.camera;
				if (parent.clientWidth !== canvas.clientWidth || parent.clientHeight !== canvas.clientHeight) {
					canvas.width = w;
					canvas.height = h;

					cam.setViewport(w, h);
					this.context.gl.viewport(0, 0, w, h);
				}

				cam.update();
			}

			this.context.gl.clearColor(0, 0, 0, 0);
			this.context.gl.clear(this.context.gl.COLOR_BUFFER_BIT);

			onRender(this.time.delta);

			if (!this.disposed)
				requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	}

	dispose () {
		this.disposed = true;
	}

	resetAsset () {
		this.assetManager.removeAll();
	}
	loadAsset (name: string) {
		return new Promise<void>((resolve, reject) => {
			if (name.endsWith(".atlas"))
				this.assetManager.loadTextureAtlas(name, () => resolve(), (p, m) => reject(m));
			else if (name.endsWith(".json"))
				this.assetManager.loadJson(name, () => resolve(), (p, m) => reject(m));
			else if (name.endsWith(".skel"))
				this.assetManager.loadBinary(name, () => resolve(), (p, m) => reject(m));
			else {
				console.warn("Unknown asset type");
				resolve();
			}
		});
	}
	getAsset<T> (name: string): T {
		return this.assetManager.require(name);
	}
}
