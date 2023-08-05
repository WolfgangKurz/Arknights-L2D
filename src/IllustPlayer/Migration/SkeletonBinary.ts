/******************************************************************************
 * Spine Runtimes License Agreement
 * Last updated September 24, 2021. Replaces all prior versions.
 *
 * Copyright (c) 2013-2021, Esoteric Software LLC
 *
 * Integration of the Spine Runtimes into software or otherwise creating
 * derivative works of the Spine Runtimes is permitted under the terms and
 * conditions of Section 2 of the Spine Editor License Agreement:
 * http://esotericsoftware.com/spine-editor-license
 *
 * Otherwise, it is permitted to integrate the Spine Runtimes into software
 * or otherwise create derivative works of the Spine Runtimes (collectively,
 * "Products"), provided that each user of the Products must obtain their own
 * Spine Editor license and redistribution of the Products in any form must
 * include this license and copyright notice.
 *
 * THE SPINE RUNTIMES ARE PROVIDED BY ESOTERIC SOFTWARE LLC "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL ESOTERIC SOFTWARE LLC BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES,
 * BUSINESS INTERRUPTION, OR LOSS OF USE, DATA, OR PROFITS) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THE SPINE RUNTIMES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *****************************************************************************/

// Modified to use 3.8 skeleton binary on 4.x system

import { Animation, Timeline, AttachmentTimeline, DrawOrderTimeline, EventTimeline, CurveTimeline1 } from "@esotericsoftware/spine-core/dist/Animation";
import { VertexAttachment, Attachment } from "@esotericsoftware/spine-core/dist/attachments/Attachment";
import { AttachmentLoader } from "@esotericsoftware/spine-core/dist/attachments/AttachmentLoader";
import { MeshAttachment } from "@esotericsoftware/spine-core/dist/attachments/MeshAttachment";
import { BoneData } from "@esotericsoftware/spine-core/dist/BoneData";
import { Event } from "@esotericsoftware/spine-core/dist/Event";
import { EventData } from "@esotericsoftware/spine-core/dist/EventData";
import { IkConstraintData } from "@esotericsoftware/spine-core/dist/IkConstraintData";
import { PathConstraintData, PositionMode, SpacingMode } from "@esotericsoftware/spine-core/dist/PathConstraintData";
import { SkeletonData } from "@esotericsoftware/spine-core/dist/SkeletonData";
import { Skin } from "@esotericsoftware/spine-core/dist/Skin";
import { SlotData } from "@esotericsoftware/spine-core/dist/SlotData";
import { TransformConstraintData } from "@esotericsoftware/spine-core/dist/TransformConstraintData";
import { Color, Utils } from "@esotericsoftware/spine-core/dist/Utils";

import { RotateTimeline, TranslateTimeline, ScaleTimeline, ShearTimeline, ColorTimeline, TwoColorTimeline, DeformTimeline, TransformConstraintTimeline, PathConstraintPositionTimeline, PathConstraintSpacingTimeline, PathConstraintMixTimeline, IkConstraintTimeline } from "./Animation";

/** Loads skeleton data in the Spine binary format.
 *
 * See [Spine binary format](http://esotericsoftware.com/spine-binary-format) and
 * [JSON and binary data](http://esotericsoftware.com/spine-loading-skeleton-data#JSON-and-binary-data) in the Spine
 * Runtimes Guide. */
export class SkeletonBinary {
	/** Scales bone positions, image sizes, and translations as they are loaded. This allows different size images to be used at
	 * runtime than were used in Spine.
	 *
	 * See [Scaling](http://esotericsoftware.com/spine-loading-skeleton-data#Scaling) in the Spine Runtimes Guide. */
	scale = 1;

	attachmentLoader: AttachmentLoader;
	private linkedMeshes = new Array<LinkedMesh>();

	constructor (attachmentLoader: AttachmentLoader) {
		this.attachmentLoader = attachmentLoader;
	}

	readSkeletonData (binary: Uint8Array): SkeletonData {
		let scale = this.scale;

		let skeletonData = new SkeletonData();
		skeletonData.name = ""; // BOZO

		let input = new BinaryInput(binary);

		// let lowHash = input.readInt32();
		// let highHash = input.readInt32();
		// skeletonData.hash = highHash == 0 && lowHash == 0 ? null : highHash.toString(16) + lowHash.toString(16);
		skeletonData.hash = input.readString();
		skeletonData.version = input.readString();
		skeletonData.x = input.readFloat();
		skeletonData.y = input.readFloat();
		skeletonData.width = input.readFloat();
		skeletonData.height = input.readFloat();

		let nonessential = input.readBoolean();
		if (nonessential) {
			skeletonData.fps = input.readFloat();

			skeletonData.imagesPath = input.readString();
			skeletonData.audioPath = input.readString();
		}

		let n = 0;
		// Strings.
		n = input.readInt(true);
		for (let i = 0; i < n; i++) {
			let str = input.readString();
			if (!str) throw new Error("String in string table must not be null.");
			input.strings.push(str);
		}

		// Bones.
		n = input.readInt(true);
		for (let i = 0; i < n; i++) {
			let name = input.readString();
			if (!name) throw new Error("Bone name must not be null.");
			let parent = i == 0 ? null : skeletonData.bones[input.readInt(true)];
			let data = new BoneData(i, name, parent);
			data.rotation = input.readFloat();
			data.x = input.readFloat() * scale;
			data.y = input.readFloat() * scale;
			data.scaleX = input.readFloat();
			data.scaleY = input.readFloat();
			data.shearX = input.readFloat();
			data.shearY = input.readFloat();
			data.length = input.readFloat() * scale;
			data.transformMode = input.readInt(true);
			data.skinRequired = input.readBoolean();
			if (nonessential) Color.rgba8888ToColor(data.color, input.readInt32());
			skeletonData.bones.push(data);
		}

		// Slots.
		n = input.readInt(true);
		for (let i = 0; i < n; i++) {
			let slotName = input.readString();
			if (!slotName) throw new Error("Slot name must not be null.");
			let boneData = skeletonData.bones[input.readInt(true)];
			let data = new SlotData(i, slotName, boneData);
			Color.rgba8888ToColor(data.color, input.readInt32());

			let darkColor = input.readInt32();
			if (darkColor != -1) Color.rgb888ToColor(data.darkColor = new Color(), darkColor);

			data.attachmentName = input.readStringRef();
			data.blendMode = input.readInt(true);
			skeletonData.slots.push(data);
		}

		// IK constraints.
		n = input.readInt(true);
		for (let i = 0, nn; i < n; i++) {
			let name = input.readString();
			if (!name) throw new Error("IK constraint data name must not be null.");
			let data = new IkConstraintData(name);
			data.order = input.readInt(true);
			data.skinRequired = input.readBoolean();
			nn = input.readInt(true);
			for (let ii = 0; ii < nn; ii++)
				data.bones.push(skeletonData.bones[input.readInt(true)]);
			data.target = skeletonData.bones[input.readInt(true)];
			data.mix = input.readFloat();
			data.softness = input.readFloat() * scale;
			data.bendDirection = input.readByte();
			data.compress = input.readBoolean();
			data.stretch = input.readBoolean();
			data.uniform = input.readBoolean();
			skeletonData.ikConstraints.push(data);
		}

		// Transform constraints.
		n = input.readInt(true);
		for (let i = 0, nn; i < n; i++) {
			let name = input.readString();
			if (!name) throw new Error("Transform constraint data name must not be null.");
			let data = new TransformConstraintData(name);
			data.order = input.readInt(true);
			data.skinRequired = input.readBoolean();
			nn = input.readInt(true);
			for (let ii = 0; ii < nn; ii++)
				data.bones.push(skeletonData.bones[input.readInt(true)]);
			data.target = skeletonData.bones[input.readInt(true)];
			data.local = input.readBoolean();
			data.relative = input.readBoolean();
			data.offsetRotation = input.readFloat();
			data.offsetX = input.readFloat() * scale;
			data.offsetY = input.readFloat() * scale;
			data.offsetScaleX = input.readFloat();
			data.offsetScaleY = input.readFloat();
			data.offsetShearY = input.readFloat();
			data.mixRotate = input.readFloat(); // data.rotateMix = input.readFloat();
			data.mixX = input.readFloat(); // data.translateMix = input.readFloat();
			data.mixY = data.mixX;
			data.mixScaleX = input.readFloat(); // data.scaleMix = input.readFloat();
			data.mixScaleY = data.mixScaleX;
			data.mixShearY = input.readFloat(); // data.shearMix = input.readFloat();
			skeletonData.transformConstraints.push(data);
		}

		// Path constraints.
		n = input.readInt(true);
		for (let i = 0, nn; i < n; i++) {
			let name = input.readString();
			if (!name) throw new Error("Path constraint data name must not be null.");
			let data = new PathConstraintData(name);
			data.order = input.readInt(true);
			data.skinRequired = input.readBoolean();
			nn = input.readInt(true);
			for (let ii = 0; ii < nn; ii++)
				data.bones.push(skeletonData.bones[input.readInt(true)]);
			data.target = skeletonData.slots[input.readInt(true)];
			data.positionMode = input.readInt(true);
			data.spacingMode = input.readInt(true);
			data.rotateMode = input.readInt(true);
			data.offsetRotation = input.readFloat();
			data.position = input.readFloat();
			if (data.positionMode == PositionMode.Fixed) data.position *= scale;
			data.spacing = input.readFloat();
			if (data.spacingMode == SpacingMode.Length || data.spacingMode == SpacingMode.Fixed) data.spacing *= scale;
			data.mixRotate = input.readFloat();
			data.mixX = input.readFloat(); // data.translateMix = input.readFloat();
			data.mixY = data.mixX;
			skeletonData.pathConstraints.push(data);
		}

		// Default skin.
		let defaultSkin = this.readSkin(input, skeletonData, true, nonessential);
		if (defaultSkin) {
			skeletonData.defaultSkin = defaultSkin;
			skeletonData.skins.push(defaultSkin);
		}

		// Skins.
		{
			let i = skeletonData.skins.length;
			Utils.setArraySize(skeletonData.skins, n = i + input.readInt(true));
			for (; i < n; i++) {
				let skin = this.readSkin(input, skeletonData, false, nonessential);
				if (!skin) throw new Error("readSkin() should not have returned null.");
				skeletonData.skins[i] = skin;
			}
		}

		// Linked meshes.
		n = this.linkedMeshes.length;
		for (let i = 0; i < n; i++) {
			let linkedMesh = this.linkedMeshes[i];
			let skin = !linkedMesh.skin ? skeletonData.defaultSkin : skeletonData.findSkin(linkedMesh.skin);
			if (!skin) throw new Error("Not skin found for linked mesh.");
			if (!linkedMesh.parent) throw new Error("Linked mesh parent must not be null");
			let parent = skin.getAttachment(linkedMesh.slotIndex, linkedMesh.parent);
			if (!parent) throw new Error(`Parent mesh not found: ${linkedMesh.parent}`);
			linkedMesh.mesh.timelineAttachment = linkedMesh.inheritTimeline ? parent as VertexAttachment : linkedMesh.mesh;
			linkedMesh.mesh.setParentMesh(parent as MeshAttachment);
			if (linkedMesh.mesh.region != null) linkedMesh.mesh.updateRegion();
		}
		this.linkedMeshes.length = 0;

		// Events.
		n = input.readInt(true);
		for (let i = 0; i < n; i++) {
			let eventName = input.readStringRef();
			if (!eventName) throw new Error;
			let data = new EventData(eventName);
			data.intValue = input.readInt(false);
			data.floatValue = input.readFloat();
			data.stringValue = input.readString();
			data.audioPath = input.readString();
			if (data.audioPath) {
				data.volume = input.readFloat();
				data.balance = input.readFloat();
			}
			skeletonData.events.push(data);
		}

		// Animations.
		n = input.readInt(true);
		for (let i = 0; i < n; i++) {
			let animationName = input.readString();
			if (!animationName) throw new Error("Animatio name must not be null.");
			skeletonData.animations.push(this.readAnimation(input, animationName, skeletonData));
		}
		return skeletonData;
	}

	private readSkin (input: BinaryInput, skeletonData: SkeletonData, defaultSkin: boolean, nonessential: boolean): Skin | null {
		let skin: Skin | null = null;
		let slotCount = 0;

		if (defaultSkin) {
			slotCount = input.readInt(true);
			if (slotCount == 0) return null;
			skin = new Skin("default");
		} else {
			let skinName = input.readStringRef();
			if (!skinName) throw new Error("Skin name must not be null.");
			skin = new Skin(skinName);
			skin.bones.length = input.readInt(true);
			for (let i = 0, n = skin.bones.length; i < n; i++)
				skin.bones[i] = skeletonData.bones[input.readInt(true)];

			for (let i = 0, n = input.readInt(true); i < n; i++)
				skin.constraints.push(skeletonData.ikConstraints[input.readInt(true)]);
			for (let i = 0, n = input.readInt(true); i < n; i++)
				skin.constraints.push(skeletonData.transformConstraints[input.readInt(true)]);
			for (let i = 0, n = input.readInt(true); i < n; i++)
				skin.constraints.push(skeletonData.pathConstraints[input.readInt(true)]);

			slotCount = input.readInt(true);
		}

		for (let i = 0; i < slotCount; i++) {
			let slotIndex = input.readInt(true);
			for (let ii = 0, nn = input.readInt(true); ii < nn; ii++) {
				let name = input.readStringRef();
				if (!name) throw new Error("Attachment name must not be null");
				let attachment = this.readAttachment(input, skeletonData, skin, slotIndex, name, nonessential);
				if (attachment) skin.setAttachment(slotIndex, name, attachment);
			}
		}
		return skin;
	}

	private readAttachment (input: BinaryInput, skeletonData: SkeletonData, skin: Skin, slotIndex: number, attachmentName: string, nonessential: boolean): Attachment | null {
		let scale = this.scale;

		let name = input.readStringRef();
		if (!name) name = attachmentName;

		switch (input.readByte()) {
			case AttachmentType.Region: {
				let path = input.readStringRef();
				let rotation = input.readFloat();
				let x = input.readFloat();
				let y = input.readFloat();
				let scaleX = input.readFloat();
				let scaleY = input.readFloat();
				let width = input.readFloat();
				let height = input.readFloat();
				let color = input.readInt32();
				// let sequence = this.readSequence(input);

				if (!path) path = name;
				let region = this.attachmentLoader.newRegionAttachment(skin, name, path, null/*sequence*/);
				if (!region) return null;
				region.path = path;
				region.x = x * scale;
				region.y = y * scale;
				region.scaleX = scaleX;
				region.scaleY = scaleY;
				region.rotation = rotation;
				region.width = width * scale;
				region.height = height * scale;
				Color.rgba8888ToColor(region.color, color);

				// region.sequence = sequence;
				// if (sequence == null) region.updateRegion();
				region.updateRegion();

				return region;
			}
			case AttachmentType.BoundingBox: {
				let vertexCount = input.readInt(true);
				let vertices = this.readVertices(input, vertexCount);
				let color = nonessential ? input.readInt32() : 0;

				let box = this.attachmentLoader.newBoundingBoxAttachment(skin, name);
				if (!box) return null;
				box.worldVerticesLength = vertexCount << 1;
				box.vertices = vertices.vertices!;
				box.bones = vertices.bones;
				if (nonessential) Color.rgba8888ToColor(box.color, color);
				return box;
			}
			case AttachmentType.Mesh: {
				let path = input.readStringRef();
				let color = input.readInt32();
				let vertexCount = input.readInt(true);
				let uvs = this.readFloatArray(input, vertexCount << 1, 1);
				let triangles = this.readShortArray(input);
				let vertices = this.readVertices(input, vertexCount);
				let hullLength = input.readInt(true);
				// let sequence = this.readSequence(input);
				let edges: number[] = [];
				let width = 0, height = 0;
				if (nonessential) {
					edges = this.readShortArray(input);
					width = input.readFloat();
					height = input.readFloat();
				}

				if (!path) path = name;
				let mesh = this.attachmentLoader.newMeshAttachment(skin, name, path, null/*sequence*/);
				if (!mesh) return null;
				mesh.path = path;
				Color.rgba8888ToColor(mesh.color, color);
				mesh.bones = vertices.bones;
				mesh.vertices = vertices.vertices!;
				mesh.worldVerticesLength = vertexCount << 1;
				mesh.triangles = triangles;
				mesh.regionUVs = uvs;

				// if (sequence == null) mesh.updateRegion();
				mesh.updateRegion();

				mesh.hullLength = hullLength << 1;
				// mesh.sequence = sequence;
				if (nonessential) {
					mesh.edges = edges;
					mesh.width = width * scale;
					mesh.height = height * scale;
				}
				return mesh;
			}
			case AttachmentType.LinkedMesh: {
				let path = input.readStringRef();
				let color = input.readInt32();
				let skinName = input.readStringRef();
				let parent = input.readStringRef();
				let inheritTimelines = input.readBoolean();
				// let sequence = this.readSequence(input);
				let width = 0, height = 0;
				if (nonessential) {
					width = input.readFloat();
					height = input.readFloat();
				}

				if (!path) path = name;
				let mesh = this.attachmentLoader.newMeshAttachment(skin, name, path, null/*sequence*/);
				if (!mesh) return null;
				mesh.path = path;
				Color.rgba8888ToColor(mesh.color, color);
				// mesh.sequence = sequence;
				if (nonessential) {
					mesh.width = width * scale;
					mesh.height = height * scale;
				}
				this.linkedMeshes.push(new LinkedMesh(mesh, skinName, slotIndex, parent, inheritTimelines));
				return mesh;
			}
			case AttachmentType.Path: {
				let closed = input.readBoolean();
				let constantSpeed = input.readBoolean();
				let vertexCount = input.readInt(true);
				let vertices = this.readVertices(input, vertexCount);
				let lengths = Utils.newArray(vertexCount / 3, 0);
				for (let i = 0, n = lengths.length; i < n; i++)
					lengths[i] = input.readFloat() * scale;
				let color = nonessential ? input.readInt32() : 0;

				let path = this.attachmentLoader.newPathAttachment(skin, name);
				if (!path) return null;
				path.closed = closed;
				path.constantSpeed = constantSpeed;
				path.worldVerticesLength = vertexCount << 1;
				path.vertices = vertices.vertices!;
				path.bones = vertices.bones;
				path.lengths = lengths;
				if (nonessential) Color.rgba8888ToColor(path.color, color);
				return path;
			}
			case AttachmentType.Point: {
				let rotation = input.readFloat();
				let x = input.readFloat();
				let y = input.readFloat();
				let color = nonessential ? input.readInt32() : 0;

				let point = this.attachmentLoader.newPointAttachment(skin, name);
				if (!point) return null;
				point.x = x * scale;
				point.y = y * scale;
				point.rotation = rotation;
				if (nonessential) Color.rgba8888ToColor(point.color, color);
				return point;
			}
			case AttachmentType.Clipping: {
				let endSlotIndex = input.readInt(true);
				let vertexCount = input.readInt(true);
				let vertices = this.readVertices(input, vertexCount);
				let color = nonessential ? input.readInt32() : 0;

				let clip = this.attachmentLoader.newClippingAttachment(skin, name);
				if (!clip) return null;
				clip.endSlot = skeletonData.slots[endSlotIndex];
				clip.worldVerticesLength = vertexCount << 1;
				clip.vertices = vertices.vertices!;
				clip.bones = vertices.bones;
				if (nonessential) Color.rgba8888ToColor(clip.color, color);
				return clip;
			}
		}
		return null;
	}

	private readVertices (input: BinaryInput, vertexCount: number): Vertices {
		let scale = this.scale;
		let verticesLength = vertexCount << 1;
		let vertices = new Vertices();
		if (!input.readBoolean()) {
			vertices.vertices = this.readFloatArray(input, verticesLength, scale);
			return vertices;
		}
		let weights = new Array<number>();
		let bonesArray = new Array<number>();
		for (let i = 0; i < vertexCount; i++) {
			let boneCount = input.readInt(true);
			bonesArray.push(boneCount);
			for (let ii = 0; ii < boneCount; ii++) {
				bonesArray.push(input.readInt(true));
				weights.push(input.readFloat() * scale);
				weights.push(input.readFloat() * scale);
				weights.push(input.readFloat());
			}
		}
		vertices.vertices = Utils.toFloatArray(weights);
		vertices.bones = bonesArray;
		return vertices;
	}

	private readFloatArray (input: BinaryInput, n: number, scale: number): number[] {
		let array = new Array<number>(n);
		if (scale == 1) {
			for (let i = 0; i < n; i++)
				array[i] = input.readFloat();
		} else {
			for (let i = 0; i < n; i++)
				array[i] = input.readFloat() * scale;
		}
		return array;
	}

	private readShortArray (input: BinaryInput): number[] {
		let n = input.readInt(true);
		let array = new Array<number>(n);
		for (let i = 0; i < n; i++)
			array[i] = input.readShort();
		return array;
	}

	private readAnimation (input: BinaryInput, name: string, skeletonData: SkeletonData): Animation {
		// input.readInt(true); // Number of timelines.
		let timelines = new Array<Timeline>();
		let scale = this.scale;
		let duration = 0;

		// Slot timelines.
		for (let i = 0, n = input.readInt(true); i < n; i++) {
			let slotIndex = input.readInt(true);
			for (let ii = 0, nn = input.readInt(true); ii < nn; ii++) {
				let timelineType = input.readByte();
				let frameCount = input.readInt(true);
				let frameLast = frameCount - 1;
				switch (timelineType) {
					case SLOT_ATTACHMENT: {
						let timeline = new AttachmentTimeline(frameCount, slotIndex);
						for (let frame = 0; frame < frameCount; frame++)
							timeline.setFrame(frame, input.readFloat(), input.readStringRef());
						timelines.push(timeline);
						break;
					}
					case SLOT_COLOR: {
						let timeline = new ColorTimeline(frameCount, slotIndex);
						for (let frame = 0; frame < frameCount; frame++) {
							timeline.setFrame(
								frame,
								input.readFloat(),
								input.readUnsignedByte() / 255.0,
								input.readUnsignedByte() / 255.0,
								input.readUnsignedByte() / 255.0,
								input.readUnsignedByte() / 255.0,
							);
							if (frame < frameLast) {
								// readCurve
								switch (input.readByte()) {
									case CURVE_STEPPED:
										timeline.setStepped(frame);
										break;
									case CURVE_BEZIER:
										timeline.setCurve(frame, input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat());
								}
							}
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(frameCount - 1) * ColorTimeline.ENTRIES]);
						break;
					}
					case SLOT_TWO_COLOR: {
						let timeline = new TwoColorTimeline(frameCount, slotIndex);
						for (let frame = 0; frame < frameCount; frame++) {
							timeline.setFrame(
								frame,
								input.readFloat(),
								input.readUnsignedByte() / 255.0,
								input.readUnsignedByte() / 255.0,
								input.readUnsignedByte() / 255.0,
								input.readUnsignedByte() / 255.0,
								input.readUnsignedByte() / 255.0,
								input.readUnsignedByte() / 255.0,
								input.readUnsignedByte() / 255.0,
							);
							if (frame < frameLast) {
								// readCurve
								switch (input.readByte()) {
									case CURVE_STEPPED:
										timeline.setStepped(frame);
										break;
									case CURVE_BEZIER:
										timeline.setCurve(frame, input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat());
								}
							}
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(frameCount - 1) * TwoColorTimeline.ENTRIES]);
						break;
					}
				}
			}
		}

		// Bone timelines.
		for (let i = 0, n = input.readInt(true); i < n; i++) {
			let boneIndex = input.readInt(true);
			for (let ii = 0, nn = input.readInt(true); ii < nn; ii++) {
				let type = input.readByte(), frameCount = input.readInt(true);//, bezierCount = input.readInt(true);
				switch (type) {
					case BONE_ROTATE: {
						const timeline = new RotateTimeline(frameCount, boneIndex);
						for (let frame = 0; frame < frameCount; frame++) {
							timeline.setFrame(frame, input.readFloat(), input.readFloat());
							if (frame < frameCount - 1) {
								switch (input.readByte()) {
									case CURVE_STEPPED:
										timeline.setStepped(frame);
										break;
									case CURVE_BEZIER:
										timeline.setCurve(frame, input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat());
								}
							}
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(frameCount - 1) * RotateTimeline.ENTRIES]);
						break;
					}
					case BONE_TRANSLATE:
					case BONE_SCALE:
					case BONE_SHEAR: {
						const timeline = type === BONE_TRANSLATE
							? new TranslateTimeline(frameCount, boneIndex)
							: type === BONE_SCALE
								? new ScaleTimeline(frameCount, boneIndex)
								: new ShearTimeline(frameCount, boneIndex);
						const timelineScale = type === BONE_TRANSLATE ? scale : 1;
						for (let frame = 0; frame < frameCount; frame++) {
							timeline.setFrame(
								frame,
								input.readFloat(),
								input.readFloat() * timelineScale,
								input.readFloat() * timelineScale,
							);
							if (frame < frameCount - 1) {
								switch (input.readByte()) {
									case CURVE_STEPPED:
										timeline.setStepped(frame);
										break;
									case CURVE_BEZIER:
										timeline.setCurve(frame, input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat());
								}
							}
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(frameCount - 1) * TranslateTimeline.ENTRIES]);
						break;
					}
				}
			}
		}

		// IK constraint timelines.
		for (let i = 0, n = input.readInt(true); i < n; i++) {
			let index = input.readInt(true), frameCount = input.readInt(true), frameLast = frameCount - 1;
			let timeline = new IkConstraintTimeline(frameCount, index);

			for (let frame = 0; frame < frameCount; frame++) {
				timeline.setFrame(
					frame,
					input.readFloat() /* time */,
					input.readFloat() /* mix */,
					input.readFloat() * scale /* softness */,
					input.readByte() /* bendDirection */,
					input.readBoolean() /* compress */,
					input.readBoolean() /* stretch */,
				);
				if (frame < frameLast) {
					switch (input.readByte()) {
						case CURVE_STEPPED:
							timeline.setStepped(frame);
							break;
						case CURVE_BEZIER:
							timeline.setCurve(frame, input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat());
					}
				}
			}
			timelines.push(timeline);
			duration = Math.max(duration, timeline.frames[(frameCount - 1) * IkConstraintTimeline.ENTRIES]);
		}

		// Transform constraint timelines.
		for (let i = 0, n = input.readInt(true); i < n; i++) {
			let index = input.readInt(true), frameCount = input.readInt(true), frameLast = frameCount - 1;
			let timeline = new TransformConstraintTimeline(frameCount, index);

			for (let frame = 0; frame < frameCount; frame++) {
				timeline.setFrame(
					frame,
					input.readFloat() /* time */,
					input.readFloat() /* mixRotate */,
					input.readFloat() /* mix (mixX, mixY) */,
					input.readFloat() /* mixScale */,
					input.readFloat() /* mixShear */,
				);
				if (frame < frameLast) {
					switch (input.readByte()) {
						case CURVE_STEPPED:
							timeline.setStepped(frame);
							break;
						case CURVE_BEZIER:
							timeline.setCurve(frame, input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat());
					}
				}
			}
			timelines.push(timeline);
			duration = Math.max(duration, timeline.frames[(frameCount - 1) * TransformConstraintTimeline.ENTRIES]);
		}

		// Path constraint timelines.
		for (let i = 0, n = input.readInt(true); i < n; i++) {
			let index = input.readInt(true);
			let data = skeletonData.pathConstraints[index];
			for (let ii = 0, nn = input.readInt(true); ii < nn; ii++) {
				const timelineType = input.readByte();
				const frameCount = input.readInt(true);

				switch (timelineType) {
					case PATH_POSITION:
					case PATH_SPACING: {
						let timeline;
						let timelineScale = 1;
						if (timelineType == PATH_SPACING) {
							timeline = new PathConstraintSpacingTimeline(frameCount, index);
							if (data.spacingMode == SpacingMode.Length || data.spacingMode == SpacingMode.Fixed)
								timelineScale = scale;
						} else {
							timeline = new PathConstraintPositionTimeline(frameCount, index);
							if (data.positionMode == PositionMode.Fixed)
								timelineScale = scale;
						}

						for (let frame = 0; frame < frameCount; frame++) {
							timeline.setFrame(frame, input.readFloat(), input.readFloat() * timelineScale);
							if (frame < frameCount - 1) {
								switch (input.readByte()) {
									case CURVE_STEPPED:
										timeline.setStepped(frame);
										break;
									case CURVE_BEZIER:
										timeline.setCurve(frame, input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat());
								}
							}
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(frameCount - 1) * PathConstraintPositionTimeline.ENTRIES]);
						break;
					}
					case PATH_MIX: {
						let timeline = new PathConstraintMixTimeline(frameCount, index);
						timeline.pathConstraintIndex = index;
						for (let frame = 0; frame < frameCount; frame++) {
							timeline.setFrame(frame, input.readFloat(), input.readFloat(), input.readFloat());

							if (frame < frameCount - 1) {
								switch (input.readByte()) {
									case CURVE_STEPPED:
										timeline.setStepped(frame);
										break;
									case CURVE_BEZIER:
										timeline.setCurve(frame, input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat());
								}
							}
						}
						timelines.push(timeline);
						duration = Math.max(duration, timeline.frames[(frameCount - 1) * PathConstraintMixTimeline.ENTRIES]);
						break;
					}
				}
			}
		}

		// Deform timelines.
		for (let i = 0, n = input.readInt(true); i < n; i++) {
			let skin = skeletonData.skins[input.readInt(true)];
			for (let ii = 0, nn = input.readInt(true); ii < nn; ii++) {
				let slotIndex = input.readInt(true);
				for (let iii = 0, nnn = input.readInt(true); iii < nnn; iii++) {
					let attachmentName = input.readStringRef();
					if (!attachmentName) throw new Error("attachmentName must not be null.");
					let attachment = skin.getAttachment(slotIndex, attachmentName);
					// let timelineType = input.readByte();
					let frameCount = input.readInt(true);
					let frameLast = frameCount - 1;

					let vertexAttachment = attachment as VertexAttachment;
					let weighted = !!vertexAttachment.bones;
					let vertices = vertexAttachment.vertices;
					let deformLength = weighted ? vertices.length / 3 * 2 : vertices.length;


					// let bezierCount = input.readInt(true);
					let timeline = new DeformTimeline(frameCount, slotIndex, vertexAttachment);

					for (let frame = 0; frame < frameCount; frame++) {
						let time = input.readFloat();
						let deform;
						let end = input.readInt(true);
						if (end == 0)
							deform = weighted ? Utils.newFloatArray(deformLength) : vertices;
						else {
							deform = Utils.newFloatArray(deformLength);
							let start = input.readInt(true);
							end += start;

							for (let v = start; v < end; v++)
								deform[v] = input.readFloat() * scale;

							if (!weighted) {
								for (let v = 0, vn = deform.length; v < vn; v++)
									deform[v] += vertices[v];
							}
						}

						timeline.setFrame(frame, time, deform);
						if (frame === frameLast) break;

						switch (input.readByte()) {
							case CURVE_STEPPED:
								timeline.setStepped(frame);
								break;
							case CURVE_BEZIER:
								timeline.setCurve(frame, input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat());
						}
					}
					timelines.push(timeline);
					duration = Math.max(duration, timeline.frames[frameCount - 1]);
				}
			}
		}

		// Draw order timeline.
		let drawOrderCount = input.readInt(true);
		if (drawOrderCount > 0) {
			let timeline = new DrawOrderTimeline(drawOrderCount);
			let slotCount = skeletonData.slots.length;
			for (let i = 0; i < drawOrderCount; i++) {
				let time = input.readFloat();
				let offsetCount = input.readInt(true);
				let drawOrder = Utils.newArray(slotCount, 0);
				for (let ii = slotCount - 1; ii >= 0; ii--)
					drawOrder[ii] = -1;
				let unchanged = Utils.newArray(slotCount - offsetCount, 0);
				let originalIndex = 0, unchangedIndex = 0;
				for (let ii = 0; ii < offsetCount; ii++) {
					let slotIndex = input.readInt(true);
					// Collect unchanged items.
					while (originalIndex != slotIndex)
						unchanged[unchangedIndex++] = originalIndex++;
					// Set changed items.
					drawOrder[originalIndex + input.readInt(true)] = originalIndex++;
				}
				// Collect remaining unchanged items.
				while (originalIndex < slotCount)
					unchanged[unchangedIndex++] = originalIndex++;
				// Fill in unchanged items.
				for (let ii = slotCount - 1; ii >= 0; ii--)
					if (drawOrder[ii] == -1) drawOrder[ii] = unchanged[--unchangedIndex];
				timeline.setFrame(i, time, drawOrder);
			}
			timelines.push(timeline);
			duration = Math.max(duration, timeline.frames[drawOrderCount - 1]);
		}

		// Event timeline.
		let eventCount = input.readInt(true);
		if (eventCount > 0) {
			let timeline = new EventTimeline(eventCount);
			for (let i = 0; i < eventCount; i++) {
				let time = input.readFloat();
				let eventData = skeletonData.events[input.readInt(true)];
				let event = new Event(time, eventData);
				event.intValue = input.readInt(false);
				event.floatValue = input.readFloat();
				event.stringValue = input.readBoolean() ? input.readString() : eventData.stringValue;
				if (event.data.audioPath) {
					event.volume = input.readFloat();
					event.balance = input.readFloat();
				}
				timeline.setFrame(i, event);
			}
			timelines.push(timeline);
			duration = Math.max(duration, timeline.frames[eventCount - 1]);
		}

		return new Animation(name, timelines, duration);
	}
}

export class BinaryInput {
	constructor (data: Uint8Array, public strings = new Array<string>(), private index: number = 0, private buffer = new DataView(data.buffer)) {
	}

	readByte (): number {
		return this.buffer.getInt8(this.index++);
	}

	readUnsignedByte (): number {
		return this.buffer.getUint8(this.index++);
	}

	readShort (): number {
		let value = this.buffer.getInt16(this.index);
		this.index += 2;
		return value;
	}

	readInt32 (): number {
		let value = this.buffer.getInt32(this.index);
		this.index += 4;
		return value;
	}

	readInt (optimizePositive: boolean) {
		let b = this.readByte();
		let result = b & 0x7F;
		if ((b & 0x80) != 0) {
			b = this.readByte();
			result |= (b & 0x7F) << 7;
			if ((b & 0x80) != 0) {
				b = this.readByte();
				result |= (b & 0x7F) << 14;
				if ((b & 0x80) != 0) {
					b = this.readByte();
					result |= (b & 0x7F) << 21;
					if ((b & 0x80) != 0) {
						b = this.readByte();
						result |= (b & 0x7F) << 28;
					}
				}
			}
		}
		return optimizePositive ? result : ((result >>> 1) ^ -(result & 1));
	}

	readStringRef (): string | null {
		let index = this.readInt(true);
		return index == 0 ? null : this.strings[index - 1];
	}

	readString (): string | null {
		let byteCount = this.readInt(true);
		switch (byteCount) {
			case 0:
				return null;
			case 1:
				return "";
		}
		byteCount--;
		let chars = "";
		for (let i = 0; i < byteCount;) {
			let b = this.readUnsignedByte();
			switch (b >> 4) {
				case 12:
				case 13:
					chars += String.fromCharCode(((b & 0x1F) << 6 | this.readByte() & 0x3F));
					i += 2;
					break;
				case 14:
					chars += String.fromCharCode(((b & 0x0F) << 12 | (this.readByte() & 0x3F) << 6 | this.readByte() & 0x3F));
					i += 3;
					break;
				default:
					chars += String.fromCharCode(b);
					i++;
			}
		}
		return chars;
	}

	readFloat (): number {
		let value = this.buffer.getFloat32(this.index);
		this.index += 4;
		return value;
	}

	readBoolean (): boolean {
		return this.readByte() != 0;
	}
}

class LinkedMesh {
	parent: string | null; skin: string | null;
	slotIndex: number;
	mesh: MeshAttachment;
	inheritTimeline: boolean;

	constructor (mesh: MeshAttachment, skin: string | null, slotIndex: number, parent: string | null, inheritDeform: boolean) {
		this.mesh = mesh;
		this.skin = skin;
		this.slotIndex = slotIndex;
		this.parent = parent;
		this.inheritTimeline = inheritDeform;
	}
}

class Vertices {
	constructor (public bones: Array<number> | null = null, public vertices: Array<number> | Float32Array | null = null) { }
}

enum AttachmentType { Region, BoundingBox, Mesh, LinkedMesh, Path, Point, Clipping }

function readTimeline1 (input: BinaryInput, timeline: CurveTimeline1, scale: number): CurveTimeline1 {
	const frameCount = timeline.getFrameCount();

	let time = input.readFloat(), value = input.readFloat() * scale;
	for (let frame = 0, bezier = 0; frame < frameCount; frame++) {
		timeline.setFrame(frame, time, value);
		if (frame === frameCount - 1) break;

		const curveType = input.readByte();
		let time2: number = 0;
		let value2: number = 0;

		switch (curveType) {
			case CURVE_STEPPED:
				timeline.setStepped(frame);
				break;
			case CURVE_BEZIER:
				const [cx1, cy1, cx2, cy2] = [input.readFloat(), input.readFloat(), input.readFloat(), input.readFloat()];
				time2 = input.readFloat();
				value2 = input.readFloat() * scale;
				timeline.setBezier(bezier++, frame, 0, time, value, cx1, cy1, cx2, cy2, time2, value2);
		}

		if (curveType !== CURVE_BEZIER) {
			time2 = input.readFloat();
			value2 = input.readFloat() * scale;
		}

		time = time2;
		value = value2;
	}

	return timeline;
}

const BONE_ROTATE = 0;
const BONE_TRANSLATE = 1;
const BONE_SCALE = 2;
const BONE_SHEAR = 3;
// const BONE_ROTATE = 0;
// const BONE_TRANSLATE = 1;
// const BONE_TRANSLATEX = 2;
// const BONE_TRANSLATEY = 3;
// const BONE_SCALE = 4;
// const BONE_SCALEX = 5;
// const BONE_SCALEY = 6;
// const BONE_SHEAR = 7;
// const BONE_SHEARX = 8;
// const BONE_SHEARY = 9;

const SLOT_ATTACHMENT = 0;
const SLOT_COLOR = 1;
const SLOT_TWO_COLOR = 2;
// const SLOT_RGB = 2;
// const SLOT_RGBA2 = 3;
// const SLOT_RGB2 = 4;
// const SLOT_ALPHA = 5;

// const ATTACHMENT_DEFORM = 0;
// const ATTACHMENT_SEQUENCE = 1;

const PATH_POSITION = 0;
const PATH_SPACING = 1;
const PATH_MIX = 2;

// const CURVE_LINEAR = 0;
const CURVE_STEPPED = 1;
const CURVE_BEZIER = 2;
