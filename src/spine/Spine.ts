import { spine } from "@/spine-runtime/spine-webgl";

import { CameraController } from "./CameraController";
import SpineCanvas from "./SpineCanvas";

const GLTexture = spine.webgl.GLTexture;

class Spine {
	private canvas!: SpineCanvas;
	private atlas!: spine.TextureAtlas;
	private skeletonData!: spine.SkeletonData;
	private skeleton!: spine.Skeleton;
	private state!: spine.AnimationState;
	private selectedSkins: string[];
	private lastBounds: {
		offset: spine.Vector2;
		size: spine.Vector2;
	};

	private assetName: string;
	private InitializedCallback: (app: Spine, skinNames: string[]) => void;

	constructor (assetName: string, cb: (app: Spine, skinNames: string[]) => void) {
		this.assetName = assetName;
		this.InitializedCallback = cb;

		this.selectedSkins = [];
		this.lastBounds = {
			offset: new spine.Vector2(),
			size: new spine.Vector2(),
		};
	}

	loadAssets (canvas: SpineCanvas) {
		const assetManager = canvas.assetManager;

		// load skeleton
		assetManager.loadBinary(`${this.assetName}.skel`);
		assetManager.loadTextureAtlas(`${this.assetName}.atlas`);
	}

	initialize (canvas: SpineCanvas) {
		this.canvas = canvas;

		const assetManager = canvas.assetManager;
		this.atlas = assetManager.get(`${this.assetName}.atlas`);
		const atlasLoader = new spine.AtlasAttachmentLoader(this.atlas);

		const skeletonBinary = new spine.SkeletonBinary(atlasLoader);
		this.skeletonData = skeletonBinary.readSkeletonData(assetManager.get(`${this.assetName}.skel`));
		this.skeleton = new spine.Skeleton(this.skeletonData);

		const stateData = new spine.AnimationStateData(this.skeletonData);
		this.state = new spine.AnimationState(stateData);

		this.state.addListener({
			complete: (entry) => this.play(undefined, true),
			dispose (entry) { },
			end (entry) { },
			event (entry, event) { },
			interrupt (entry) { },
			start (entry) { },
		});

		new CameraController(this.canvas.htmlCanvas, this.canvas.renderer.camera);

		this.InitializedCallback(this, this.skeletonData.skins.map(s => s.name));
	}

	addSkin (skinName: string) {
		if (this.selectedSkins.indexOf(skinName) != -1) return;
		this.selectedSkins.push(skinName);
		this.updateSkin();
	}

	removeSkin (skinName: string) {
		const index = this.selectedSkins.indexOf(skinName);
		if (index === -1) return;
		this.selectedSkins.splice(index, 1);
		this.updateSkin();
	}

	updateSkin () {
		const newSkin = new spine.Skin("result-skin");
		for (const skinName of this.selectedSkins) {
			const skin = this.skeletonData.findSkin(skinName);
			if (skin) newSkin.addSkin(skin);
		}

		this.skeleton.setSkin(newSkin);
		this.skeleton.setToSetupPose();
		this.skeleton.updateWorldTransform();

		let offset = new spine.Vector2(), size = new spine.Vector2();
		this.skeleton.getBounds(offset, size);
		this.lastBounds = { offset, size };
	}

	updateCamera () {
		const camera = this.canvas.renderer.camera;
		if (camera) {
			const offset = this.lastBounds.offset, size = this.lastBounds.size;
			camera.position.x = offset.x + size.x / 2;
			camera.position.y = offset.y + size.y / 2;
			camera.zoom = size.x > size.y ? size.x / this.canvas.htmlCanvas.width * 1.5 : size.y / this.canvas.htmlCanvas.height * 1.5;
			camera.update();
		}
	}

	update (_: SpineCanvas, delta: number) {
		this.skeleton.setToSetupPose();
		this.state.update(delta);
		this.state.apply(this.skeleton);
		this.skeleton.updateWorldTransform();

		let offset = new spine.Vector2(), size = new spine.Vector2();
		this.skeleton.getBounds(offset, size);
		this.lastBounds = { offset, size };
	}

	render (canvas: SpineCanvas) {
		const renderer = canvas.renderer;
		renderer.resize(spine.webgl.ResizeMode.Expand);

		canvas.clear(0, 0, 0, 0);
		renderer.begin();
		renderer.drawSkeleton(this.skeleton, true);
		renderer.end();
	}

	play (id?: string, force: boolean = false) {
		const state = this.state;
		const current = state.getCurrent(0)!;
		if (!force && current && current.animation.name !== "Idle") return; // playing non-idle

		const anim = this.state.data.skeletonData.animations.find(r => r.name === (id || "Idle"));

		const entry = state.setAnimationWith(0, anim!, false);
		entry.mixDuration = 0.5;
		return anim;
	}
}
export default Spine;
