import { AtlasAttachmentLoader, Skin, TextureAtlas, Skeleton, AnimationState, AnimationStateData, Shader, Matrix4, Vector2, Vector3 } from "@esotericsoftware/spine-webgl";
import { SkeletonBinary } from "./Migration/SkeletonBinary"; // 3.8 skeleton loader for 4.x system

// import * as PIXI from "pixi.js";

import IllustCanvas from "./IllustCanvas";

export interface NumberArrayLike {
	readonly length: number;
	[n: number]: number;
}

export default class IllustModel {
	private canvas: IllustCanvas;
	private initialized = false;

	private model: Skeleton | null = null;
	private state: AnimationState | null = null;

	readonly shader: Shader;

	constructor (private assetName: string, canvas: HTMLCanvasElement, pathPrefix?: string) {
		this.canvas = new IllustCanvas(canvas, { pathPrefix }, (delta) => this.render(delta));

		this.shader = Shader.newTwoColoredTextured(this.canvas.context);
	}

	render (delta: number) {
		if (!this.model || !this.state) return;

		this.state.update(delta);
		this.state.apply(this.model);
		this.model.updateWorldTransform();

		// set shader parameters
		const shader = this.shader;
		shader.bind();
		shader.setUniformi(Shader.SAMPLER, 0);
		shader.setUniform4x4f(Shader.MVP_MATRIX, this.canvas.camera.camera.projectionView.values);

		const batcher = this.canvas.batcher;
		batcher.begin(shader);

		// render
		this.canvas.renderer.premultipliedAlpha = true;
		this.canvas.renderer.draw(batcher, this.model);

		batcher.end();
		shader.unbind();
	}

	destroy () {
		this.canvas.dispose();
	}

	async initialize () {
		if (this.initialized) return;
		this.initialized = true;

		this.canvas.resetAsset();

		await Promise.all([
			this.canvas.loadAsset(`${this.assetName}.skel`),
			this.canvas.loadAsset(`${this.assetName}.atlas`),
		]);
	}

	load () {
		const atlas = this.canvas.getAsset<TextureAtlas>(`${this.assetName}.atlas`);
		const loader = new AtlasAttachmentLoader(atlas);
		const skeletonLoader = new SkeletonBinary(loader);
		skeletonLoader.scale = 0.5;

		const skeletonData = skeletonLoader.readSkeletonData(this.canvas.getAsset<Uint8Array>(`${this.assetName}.skel`));
		this.model = new Skeleton(skeletonData);

		this.state = new AnimationState(new AnimationStateData(skeletonData));
		this.state.data.defaultMix = 0.2;
		this.state.addListener({
			complete: (entry) => {
				if (entry.animation?.name === "Idle") return;

				this.play("Idle", true);
			},
		});
	}

	/** Move model to center */
	center () {
		if (!this.model) return;

		let offset = new Vector2();
		let size = new Vector2();
		this.model.getBounds(offset, size, []);

		this.canvas.camera.camera.position.set(
			offset.x + size.x / 2,
			offset.y + size.y / 2,
			0,
		);
		this.canvas.camera.camera.update();

		// this.x = this.canvas.htmlCanvas.clientWidth / 2;
		// this.y = this.canvas.htmlCanvas.clientHeight / 2 + this.model.getBounds().height / 2;
	}

	setSkin (name: string | string[]) {
		if (!this.model || !this.state) return;

		const _name = Array.isArray(name) ? name : [name];

		const skin = new Skin("mixedSkin");
		_name.forEach(n => {
			const found = this.model!.data.findSkin(n);
			if (found)
				skin.addSkin(found);
		});

		this.model.setSkin(skin);
	}

	play (anim: string, force: boolean = false) {
		if (!this.model || !this.state) return;

		const current = this.state.getCurrent(0);
		if (!force && current && current.animation?.name !== "Idle") return;

		this.state.setAnimation(0, anim, anim === "Idle");
	}
}
