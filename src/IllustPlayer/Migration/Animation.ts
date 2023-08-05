import { Attachment, BoneTimeline, IkConstraint, MathUtils, MixBlend, MixDirection, NumberArrayLike, PathConstraint, PathConstraintData, Skeleton, Slot, SlotTimeline, Event as SpineEvent, Timeline, TransformConstraint, TransformConstraintData, Utils, VertexAttachment } from "@esotericsoftware/spine-webgl";

const Property = {
	rotate: 0,
	x: 1,
	y: 2,
	scaleX: 3,
	scaleY: 4,
	shearX: 5,
	shearY: 6,
	rgb: 7,
	alpha: 8,
	rgb2: 9,
	attachment: 10,
	deform: 11,
	event: 12,
	drawOrder: 13,
	ikConstraint: 14,
	transformConstraint: 15,
	pathConstraintPosition: 16,
	pathConstraintSpacing: 17,
	pathConstraintMix: 18,
	sequence: 19
};

export abstract class CurveTimeline extends Timeline {
	static LINEAR = 0;
	static STEPPED = 1;
	static BEZIER = 2;
	static BEZIER_SIZE = 10 * 2 - 1;

	protected curves: NumberArrayLike; // type, x, y, ...

	constructor (frameCount: number, propertyId: string[]) {
		super(frameCount, propertyId);
		if (frameCount <= 0) throw new Error("frameCount must be > 0: " + frameCount);
		this.curves = Utils.newFloatArray((frameCount - 1) * CurveTimeline.BEZIER_SIZE);
	}

	getFrameCount () {
		return this.curves.length / CurveTimeline.BEZIER_SIZE + 1;
	}

	setLinear (frameIndex: number) {
		this.curves[frameIndex * CurveTimeline.BEZIER_SIZE] = CurveTimeline.LINEAR;
	}

	setStepped (frameIndex: number) {
		this.curves[frameIndex * CurveTimeline.BEZIER_SIZE] = CurveTimeline.STEPPED;
	}

	getCurveType (frameIndex: number): number {
		let index = frameIndex * CurveTimeline.BEZIER_SIZE;
		if (index == this.curves.length) return CurveTimeline.LINEAR;
		let type = this.curves[index];
		if (type == CurveTimeline.LINEAR) return CurveTimeline.LINEAR;
		if (type == CurveTimeline.STEPPED) return CurveTimeline.STEPPED;
		return CurveTimeline.BEZIER;
	}

	setCurve (frameIndex: number, cx1: number, cy1: number, cx2: number, cy2: number) {
		let tmpx = (-cx1 * 2 + cx2) * 0.03, tmpy = (-cy1 * 2 + cy2) * 0.03;
		let dddfx = ((cx1 - cx2) * 3 + 1) * 0.006, dddfy = ((cy1 - cy2) * 3 + 1) * 0.006;
		let ddfx = tmpx * 2 + dddfx, ddfy = tmpy * 2 + dddfy;
		let dfx = cx1 * 0.3 + tmpx + dddfx * 0.16666667, dfy = cy1 * 0.3 + tmpy + dddfy * 0.16666667;

		let i = frameIndex * CurveTimeline.BEZIER_SIZE;
		let curves = this.curves;
		curves[i++] = CurveTimeline.BEZIER;

		let x = dfx, y = dfy;
		for (let n = i + CurveTimeline.BEZIER_SIZE - 1; i < n; i += 2) {
			curves[i] = x;
			curves[i + 1] = y;
			dfx += ddfx;
			dfy += ddfy;
			ddfx += dddfx;
			ddfy += dddfy;
			x += dfx;
			y += dfy;
		}
	}

	getCurvePercent (frameIndex: number, percent: number) {
		percent = MathUtils.clamp(percent, 0, 1);
		let curves = this.curves;
		let i = frameIndex * CurveTimeline.BEZIER_SIZE;
		let type = curves[i];
		if (type == CurveTimeline.LINEAR) return percent;
		if (type == CurveTimeline.STEPPED) return 0;
		i++;
		let x = 0;
		for (let start = i, n = i + CurveTimeline.BEZIER_SIZE - 1; i < n; i += 2) {
			x = curves[i];
			if (x >= percent) {
				let prevX: number, prevY: number;
				if (i == start) {
					prevX = 0;
					prevY = 0;
				} else {
					prevX = curves[i - 2];
					prevY = curves[i - 1];
				}
				return prevY + (curves[i + 1] - prevY) * (percent - prevX) / (x - prevX);
			}
		}
		let y = curves[i - 1];
		return y + (1 - y) * (percent - x) / (1 - x); // Last point is 1,1.
	}

	abstract apply (skeleton: Skeleton, lastTime: number, time: number, events: Array<SpineEvent>, alpha: number, blend: MixBlend, direction: MixDirection): void;
}

function binarySearch (values: NumberArrayLike, target: number, step: number = 1) {
	let low = 0;
	let high = values.length / step - 2;
	if (high == 0) return step;
	let current = high >>> 1;
	while (true) {
		if (values[(current + 1) * step] <= target)
			low = current + 1;
		else
			high = current;
		if (low == high) return (low + 1) * step;
		current = (low + high) >>> 1;
	}
}
function linearSearch (values: NumberArrayLike, target: number, step: number) {
	for (let i = 0, last = values.length - step; i <= last; i += step)
		if (values[i] > target) return i;
	return -1;
}

/** Changes a bone's local {@link Bone#rotation}. */
export class RotateTimeline extends CurveTimeline implements BoneTimeline {
	static ENTRIES = 2;

	static PREV_TIME = -2;
	static PREV_ROTATION = -1;

	static ROTATION = 1;

	boneIndex: number;

	constructor (frameCount: number, boneIndex: number) {
		super(frameCount, [Property.rotate + "|" + boneIndex]);
		this.frames = Utils.newFloatArray(frameCount << 1);
		this.boneIndex = boneIndex;
	}

	setFrame (frameIndex: number, time: number, degrees: number) {
		frameIndex <<= 1;
		this.frames[frameIndex] = time;
		this.frames[frameIndex + RotateTimeline.ROTATION] = degrees;
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, events: Array<SpineEvent> | null, alpha: number, blend: MixBlend, direction: MixDirection) {
		let frames = this.frames;

		let bone = skeleton.bones[this.boneIndex];
		if (!bone.active) return;
		if (time < frames[0]) {
			switch (blend) {
				case MixBlend.setup:
					bone.rotation = bone.data.rotation;
					return;
				case MixBlend.first:
					let r = bone.data.rotation - bone.rotation;
					bone.rotation += (r - (16384 - ((16384.499999999996 - r / 360) | 0)) * 360) * alpha;
			}
			return;
		}

		if (time >= frames[frames.length - RotateTimeline.ENTRIES]) { // Time is after last frame.
			let r = frames[frames.length + RotateTimeline.PREV_ROTATION];
			switch (blend) {
				case MixBlend.setup:
					bone.rotation = bone.data.rotation + r * alpha;
					break;
				case MixBlend.first:
				case MixBlend.replace:
					r += bone.data.rotation - bone.rotation;
					r -= (16384 - ((16384.499999999996 - r / 360) | 0)) * 360; // Wrap within -180 and 180.
				case MixBlend.add:
					bone.rotation += r * alpha;
			}
			return;
		}

		// Interpolate between the previous frame and the current frame.
		let frame = binarySearch(frames, time, RotateTimeline.ENTRIES);
		let prevRotation = frames[frame + RotateTimeline.PREV_ROTATION];
		let frameTime = frames[frame];
		let percent = this.getCurvePercent((frame >> 1) - 1,
			1 - (time - frameTime) / (frames[frame + RotateTimeline.PREV_TIME] - frameTime));

		let r = frames[frame + RotateTimeline.ROTATION] - prevRotation;
		r = prevRotation + (r - (16384 - ((16384.499999999996 - r / 360) | 0)) * 360) * percent;
		switch (blend) {
			case MixBlend.setup:
				bone.rotation = bone.data.rotation + (r - (16384 - ((16384.499999999996 - r / 360) | 0)) * 360) * alpha;
				break;
			case MixBlend.first:
			case MixBlend.replace:
				r += bone.data.rotation - bone.rotation;
			case MixBlend.add:
				bone.rotation += (r - (16384 - ((16384.499999999996 - r / 360) | 0)) * 360) * alpha;
		}
	}
}

/** Changes a bone's local {@link Bone#x} and {@link Bone#y}. */
export class TranslateTimeline extends CurveTimeline implements BoneTimeline {
	static ENTRIES = 3;

	static PREV_TIME = -3;
	static PREV_X = -2;
	static PREV_Y = -1;

	static X = 1;
	static Y = 2;

	boneIndex: number;

	constructor (frameCount: number, boneIndex: number) {
		super(frameCount, [Property.x + "|" + boneIndex, Property.y + "|" + boneIndex]);
		this.frames = Utils.newFloatArray(frameCount * TranslateTimeline.ENTRIES);
		this.boneIndex = boneIndex;
	}

	setFrame (frameIndex: number, time: number, x: number, y: number) {
		frameIndex *= TranslateTimeline.ENTRIES;
		this.frames[frameIndex] = time;
		this.frames[frameIndex + TranslateTimeline.X] = x;
		this.frames[frameIndex + TranslateTimeline.Y] = y;
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, events: Array<SpineEvent> | null, alpha: number, blend: MixBlend, direction: MixDirection) {
		let frames = this.frames;

		let bone = skeleton.bones[this.boneIndex];
		if (!bone.active) return;
		if (time < frames[0]) {
			switch (blend) {
				case MixBlend.setup:
					bone.x = bone.data.x;
					bone.y = bone.data.y;
					return;
				case MixBlend.first:
					bone.x += (bone.data.x - bone.x) * alpha;
					bone.y += (bone.data.y - bone.y) * alpha;
			}
			return;
		}

		let x = 0, y = 0;
		if (time >= frames[frames.length - TranslateTimeline.ENTRIES]) { // Time is after last frame.
			x = frames[frames.length + TranslateTimeline.PREV_X];
			y = frames[frames.length + TranslateTimeline.PREV_Y];
		} else {
			// Interpolate between the previous frame and the current frame.
			let frame = binarySearch(frames, time, TranslateTimeline.ENTRIES);
			x = frames[frame + TranslateTimeline.PREV_X];
			y = frames[frame + TranslateTimeline.PREV_Y];
			let frameTime = frames[frame];
			let percent = this.getCurvePercent(frame / TranslateTimeline.ENTRIES - 1,
				1 - (time - frameTime) / (frames[frame + TranslateTimeline.PREV_TIME] - frameTime));

			x += (frames[frame + TranslateTimeline.X] - x) * percent;
			y += (frames[frame + TranslateTimeline.Y] - y) * percent;
		}
		switch (blend) {
			case MixBlend.setup:
				bone.x = bone.data.x + x * alpha;
				bone.y = bone.data.y + y * alpha;
				break;
			case MixBlend.first:
			case MixBlend.replace:
				bone.x += (bone.data.x + x - bone.x) * alpha;
				bone.y += (bone.data.y + y - bone.y) * alpha;
				break;
			case MixBlend.add:
				bone.x += x * alpha;
				bone.y += y * alpha;
		}
	}
}

/** Changes a bone's local {@link Bone#scaleX} and {@link Bone#scaleY}. */
export class ScaleTimeline extends TranslateTimeline implements BoneTimeline {
	constructor (frameCount: number, boneIndex: number) {
		super(frameCount, boneIndex);
		this.propertyIds = [Property.scaleX + "|" + boneIndex, Property.scaleY + "|" + boneIndex];
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, events: Array<SpineEvent> | null, alpha: number, blend: MixBlend, direction: MixDirection) {
		let frames = this.frames;

		let bone = skeleton.bones[this.boneIndex];
		if (!bone.active) return;
		if (time < frames[0]) {
			switch (blend) {
				case MixBlend.setup:
					bone.scaleX = bone.data.scaleX;
					bone.scaleY = bone.data.scaleY;
					return;
				case MixBlend.first:
					bone.scaleX += (bone.data.scaleX - bone.scaleX) * alpha;
					bone.scaleY += (bone.data.scaleY - bone.scaleY) * alpha;
			}
			return;
		}

		let x = 0, y = 0;
		if (time >= frames[frames.length - ScaleTimeline.ENTRIES]) { // Time is after last frame.
			x = frames[frames.length + ScaleTimeline.PREV_X] * bone.data.scaleX;
			y = frames[frames.length + ScaleTimeline.PREV_Y] * bone.data.scaleY;
		} else {
			// Interpolate between the previous frame and the current frame.
			let frame = binarySearch(frames, time, ScaleTimeline.ENTRIES);
			x = frames[frame + ScaleTimeline.PREV_X];
			y = frames[frame + ScaleTimeline.PREV_Y];
			let frameTime = frames[frame];
			let percent = this.getCurvePercent(frame / ScaleTimeline.ENTRIES - 1,
				1 - (time - frameTime) / (frames[frame + ScaleTimeline.PREV_TIME] - frameTime));

			x = (x + (frames[frame + ScaleTimeline.X] - x) * percent) * bone.data.scaleX;
			y = (y + (frames[frame + ScaleTimeline.Y] - y) * percent) * bone.data.scaleY;
		}
		if (alpha == 1) {
			if (blend == MixBlend.add) {
				bone.scaleX += x - bone.data.scaleX;
				bone.scaleY += y - bone.data.scaleY;
			} else {
				bone.scaleX = x;
				bone.scaleY = y;
			}
		} else {
			let bx = 0, by = 0;
			if (direction == MixDirection.mixOut) {
				switch (blend) {
					case MixBlend.setup:
						bx = bone.data.scaleX;
						by = bone.data.scaleY;
						bone.scaleX = bx + (Math.abs(x) * MathUtils.signum(bx) - bx) * alpha;
						bone.scaleY = by + (Math.abs(y) * MathUtils.signum(by) - by) * alpha;
						break;
					case MixBlend.first:
					case MixBlend.replace:
						bx = bone.scaleX;
						by = bone.scaleY;
						bone.scaleX = bx + (Math.abs(x) * MathUtils.signum(bx) - bx) * alpha;
						bone.scaleY = by + (Math.abs(y) * MathUtils.signum(by) - by) * alpha;
						break;
					case MixBlend.add:
						bx = bone.scaleX;
						by = bone.scaleY;
						bone.scaleX = bx + (Math.abs(x) * MathUtils.signum(bx) - bone.data.scaleX) * alpha;
						bone.scaleY = by + (Math.abs(y) * MathUtils.signum(by) - bone.data.scaleY) * alpha;
				}
			} else {
				switch (blend) {
					case MixBlend.setup:
						bx = Math.abs(bone.data.scaleX) * MathUtils.signum(x);
						by = Math.abs(bone.data.scaleY) * MathUtils.signum(y);
						bone.scaleX = bx + (x - bx) * alpha;
						bone.scaleY = by + (y - by) * alpha;
						break;
					case MixBlend.first:
					case MixBlend.replace:
						bx = Math.abs(bone.scaleX) * MathUtils.signum(x);
						by = Math.abs(bone.scaleY) * MathUtils.signum(y);
						bone.scaleX = bx + (x - bx) * alpha;
						bone.scaleY = by + (y - by) * alpha;
						break;
					case MixBlend.add:
						bx = MathUtils.signum(x);
						by = MathUtils.signum(y);
						bone.scaleX = Math.abs(bone.scaleX) * bx + (x - Math.abs(bone.data.scaleX) * bx) * alpha;
						bone.scaleY = Math.abs(bone.scaleY) * by + (y - Math.abs(bone.data.scaleY) * by) * alpha;
				}
			}
		}
	}
}

/** Changes a bone's local {@link Bone#shearX} and {@link Bone#shearY}. */
export class ShearTimeline extends TranslateTimeline implements BoneTimeline {
	constructor (frameCount: number, boneIndex: number) {
		super(frameCount, boneIndex);
		this.propertyIds = [Property.shearX + "|" + boneIndex, Property.shearY + "|" + boneIndex];
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, events: Array<SpineEvent> | null, alpha: number, blend: MixBlend, direction: MixDirection) {
		let frames = this.frames;

		let bone = skeleton.bones[this.boneIndex];
		if (!bone.active) return;
		if (time < frames[0]) {
			switch (blend) {
				case MixBlend.setup:
					bone.shearX = bone.data.shearX;
					bone.shearY = bone.data.shearY;
					return;
				case MixBlend.first:
					bone.shearX += (bone.data.shearX - bone.shearX) * alpha;
					bone.shearY += (bone.data.shearY - bone.shearY) * alpha;
			}
			return;
		}

		let x = 0, y = 0;
		if (time >= frames[frames.length - ShearTimeline.ENTRIES]) { // Time is after last frame.
			x = frames[frames.length + ShearTimeline.PREV_X];
			y = frames[frames.length + ShearTimeline.PREV_Y];
		} else {
			// Interpolate between the previous frame and the current frame.
			let frame = binarySearch(frames, time, ShearTimeline.ENTRIES);
			x = frames[frame + ShearTimeline.PREV_X];
			y = frames[frame + ShearTimeline.PREV_Y];
			let frameTime = frames[frame];
			let percent = this.getCurvePercent(frame / ShearTimeline.ENTRIES - 1,
				1 - (time - frameTime) / (frames[frame + ShearTimeline.PREV_TIME] - frameTime));

			x = x + (frames[frame + ShearTimeline.X] - x) * percent;
			y = y + (frames[frame + ShearTimeline.Y] - y) * percent;
		}
		switch (blend) {
			case MixBlend.setup:
				bone.shearX = bone.data.shearX + x * alpha;
				bone.shearY = bone.data.shearY + y * alpha;
				break;
			case MixBlend.first:
			case MixBlend.replace:
				bone.shearX += (bone.data.shearX + x - bone.shearX) * alpha;
				bone.shearY += (bone.data.shearY + y - bone.shearY) * alpha;
				break;
			case MixBlend.add:
				bone.shearX += x * alpha;
				bone.shearY += y * alpha;
		}
	}
}

/** Changes a slot's {@link Slot#color}. */
export class ColorTimeline extends CurveTimeline implements SlotTimeline {
	static ENTRIES = 5;

	static PREV_TIME = -5;
	static PREV_R = -4;
	static PREV_G = -3;
	static PREV_B = -2;
	static PREV_A = -1;

	static R = 1;
	static G = 2;
	static B = 3;
	static A = 4;

	slotIndex: number;

	constructor (frameCount: number, slotIndex: number) {
		super(frameCount, [
			Property.rgb + "|" + slotIndex,
			Property.alpha + "|" + slotIndex,
		]);
		this.frames = Utils.newFloatArray(frameCount * ColorTimeline.ENTRIES);
		this.slotIndex = slotIndex;
	}

	/** Sets the time in seconds, red, green, blue, and alpha for the specified key frame. */
	setFrame (frameIndex: number, time: number, r: number, g: number, b: number, a: number) {
		frameIndex *= ColorTimeline.ENTRIES;
		this.frames[frameIndex] = time;
		this.frames[frameIndex + ColorTimeline.R] = r;
		this.frames[frameIndex + ColorTimeline.G] = g;
		this.frames[frameIndex + ColorTimeline.B] = b;
		this.frames[frameIndex + ColorTimeline.A] = a;
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, events: Array<SpineEvent>, alpha: number, blend: MixBlend, direction: MixDirection) {
		let slot = skeleton.slots[this.slotIndex];
		if (!slot.bone.active) return;

		let frames = this.frames;
		if (time < frames[0]) {
			switch (blend) {
				case MixBlend.setup:
					slot.color.setFromColor(slot.data.color);
					return;
				case MixBlend.first:
					let color = slot.color, setup = slot.data.color;
					color.add((setup.r - color.r) * alpha, (setup.g - color.g) * alpha, (setup.b - color.b) * alpha,
						(setup.a - color.a) * alpha);
			}
			return;
		}

		let r = 0, g = 0, b = 0, a = 0;
		if (time >= frames[frames.length - ColorTimeline.ENTRIES]) { // Time is after last frame.
			let i = frames.length;
			r = frames[i + ColorTimeline.PREV_R];
			g = frames[i + ColorTimeline.PREV_G];
			b = frames[i + ColorTimeline.PREV_B];
			a = frames[i + ColorTimeline.PREV_A];
		} else {
			// Interpolate between the previous frame and the current frame.
			let frame = binarySearch(frames, time, ColorTimeline.ENTRIES);
			r = frames[frame + ColorTimeline.PREV_R];
			g = frames[frame + ColorTimeline.PREV_G];
			b = frames[frame + ColorTimeline.PREV_B];
			a = frames[frame + ColorTimeline.PREV_A];
			let frameTime = frames[frame];
			let percent = this.getCurvePercent(frame / ColorTimeline.ENTRIES - 1,
				1 - (time - frameTime) / (frames[frame + ColorTimeline.PREV_TIME] - frameTime));

			r += (frames[frame + ColorTimeline.R] - r) * percent;
			g += (frames[frame + ColorTimeline.G] - g) * percent;
			b += (frames[frame + ColorTimeline.B] - b) * percent;
			a += (frames[frame + ColorTimeline.A] - a) * percent;
		}
		if (alpha == 1)
			slot.color.set(r, g, b, a);
		else {
			let color = slot.color;
			if (blend == MixBlend.setup) color.setFromColor(slot.data.color);
			color.add((r - color.r) * alpha, (g - color.g) * alpha, (b - color.b) * alpha, (a - color.a) * alpha);
		}
	}
}

/** Changes a slot's {@link Slot#color} and {@link Slot#darkColor} for two color tinting. */
export class TwoColorTimeline extends CurveTimeline implements SlotTimeline {
	static ENTRIES = 8;

	static PREV_TIME = -8;
	static PREV_R = -7;
	static PREV_G = -6;
	static PREV_B = -5;
	static PREV_A = -4;
	static PREV_R2 = -3;
	static PREV_G2 = -2;
	static PREV_B2 = -1;

	static R = 1;
	static G = 2;
	static B = 3;
	static A = 4;
	static R2 = 5;
	static G2 = 6;
	static B2 = 7;

	slotIndex: number;

	constructor (frameCount: number, slotIndex: number) {
		super(frameCount, [
			Property.rgb + "|" + slotIndex,
			Property.alpha + "|" + slotIndex,
			Property.rgb2 + "|" + slotIndex,
		]);
		this.frames = Utils.newFloatArray(frameCount * TwoColorTimeline.ENTRIES);
		this.slotIndex = slotIndex;
	}

	/** Sets the time in seconds, light, and dark colors for the specified key frame. */
	setFrame (frameIndex: number, time: number, r: number, g: number, b: number, a: number, r2: number, g2: number, b2: number) {
		frameIndex *= TwoColorTimeline.ENTRIES;
		this.frames[frameIndex] = time;
		this.frames[frameIndex + TwoColorTimeline.R] = r;
		this.frames[frameIndex + TwoColorTimeline.G] = g;
		this.frames[frameIndex + TwoColorTimeline.B] = b;
		this.frames[frameIndex + TwoColorTimeline.A] = a;
		this.frames[frameIndex + TwoColorTimeline.R2] = r2;
		this.frames[frameIndex + TwoColorTimeline.G2] = g2;
		this.frames[frameIndex + TwoColorTimeline.B2] = b2;
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, events: Array<SpineEvent>, alpha: number, blend: MixBlend, direction: MixDirection) {
		let slot = skeleton.slots[this.slotIndex];
		if (!slot.bone.active) return;

		let frames = this.frames;
		if (time < frames[0]) {
			switch (blend) {
				case MixBlend.setup:
					slot.color.setFromColor(slot.data.color);
					slot.darkColor!.setFromColor(slot.data.darkColor!);
					return;
				case MixBlend.first:
					let light = slot.color, dark = slot.darkColor!, setupLight = slot.data.color, setupDark = slot.data.darkColor!;
					light.add(
						(setupLight.r - light.r) * alpha,
						(setupLight.g - light.g) * alpha,
						(setupLight.b - light.b) * alpha,
						(setupLight.a - light.a) * alpha,
					);
					dark.add(
						(setupDark.r - dark.r) * alpha,
						(setupDark.g - dark.g) * alpha,
						(setupDark.b - dark.b) * alpha,
						0,
					);
			}
			return;
		}

		let r = 0, g = 0, b = 0, a = 0, r2 = 0, g2 = 0, b2 = 0;
		if (time >= frames[frames.length - TwoColorTimeline.ENTRIES]) { // Time is after last frame.
			let i = frames.length;
			r = frames[i + TwoColorTimeline.PREV_R];
			g = frames[i + TwoColorTimeline.PREV_G];
			b = frames[i + TwoColorTimeline.PREV_B];
			a = frames[i + TwoColorTimeline.PREV_A];
			r2 = frames[i + TwoColorTimeline.PREV_R2];
			g2 = frames[i + TwoColorTimeline.PREV_G2];
			b2 = frames[i + TwoColorTimeline.PREV_B2];
		} else {
			// Interpolate between the previous frame and the current frame.
			let frame = binarySearch(frames, time, TwoColorTimeline.ENTRIES);
			r = frames[frame + TwoColorTimeline.PREV_R];
			g = frames[frame + TwoColorTimeline.PREV_G];
			b = frames[frame + TwoColorTimeline.PREV_B];
			a = frames[frame + TwoColorTimeline.PREV_A];
			r2 = frames[frame + TwoColorTimeline.PREV_R2];
			g2 = frames[frame + TwoColorTimeline.PREV_G2];
			b2 = frames[frame + TwoColorTimeline.PREV_B2];
			let frameTime = frames[frame];
			let percent = this.getCurvePercent(frame / TwoColorTimeline.ENTRIES - 1,
				1 - (time - frameTime) / (frames[frame + TwoColorTimeline.PREV_TIME] - frameTime));

			r += (frames[frame + TwoColorTimeline.R] - r) * percent;
			g += (frames[frame + TwoColorTimeline.G] - g) * percent;
			b += (frames[frame + TwoColorTimeline.B] - b) * percent;
			a += (frames[frame + TwoColorTimeline.A] - a) * percent;
			r2 += (frames[frame + TwoColorTimeline.R2] - r2) * percent;
			g2 += (frames[frame + TwoColorTimeline.G2] - g2) * percent;
			b2 += (frames[frame + TwoColorTimeline.B2] - b2) * percent;
		}
		if (alpha == 1) {
			slot.color.set(r, g, b, a);
			slot.darkColor!.set(r2, g2, b2, 1);
		} else {
			let light = slot.color, dark = slot.darkColor;
			if (blend == MixBlend.setup) {
				light.setFromColor(slot.data.color);
				dark!.setFromColor(slot.data.darkColor!);
			}
			light.add((r - light.r) * alpha, (g - light.g) * alpha, (b - light.b) * alpha, (a - light.a) * alpha);
			dark!.add((r2 - dark!.r) * alpha, (g2 - dark!.g) * alpha, (b2 - dark!.b) * alpha, 0);
		}
	}
}

let zeros: NumberArrayLike | null = null;
/** Changes a slot's {@link Slot#deform} to deform a {@link VertexAttachment}. */
export class DeformTimeline extends CurveTimeline {
	slotIndex: number;
	attachment: VertexAttachment;
	frameVertices: Array<NumberArrayLike>;

	constructor (frameCount: number, slotIndex: number, attachment: VertexAttachment) {
		super(frameCount, [Property.deform + "|" + slotIndex + "|" + attachment.id]);

		this.frames = Utils.newFloatArray(frameCount);
		this.frameVertices = new Array<NumberArrayLike>(frameCount);
		if (zeros == null) zeros = Utils.newFloatArray(64);

		this.slotIndex = slotIndex;
		this.attachment = attachment;
	}

	setFrame (frameIndex: number, time: number, vertices: NumberArrayLike) {
		this.frames[frameIndex] = time;
		this.frameVertices[frameIndex] = vertices;
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, firedEvents: Array<SpineEvent>, alpha: number, blend: MixBlend, direction: MixDirection) {
		let slot: Slot = skeleton.slots[this.slotIndex];
		if (!slot.bone.active) return;

		let slotAttachment: Attachment | null = slot.getAttachment();
		if (
			!(slotAttachment instanceof VertexAttachment) ||
			!(slotAttachment.timelineAttachment == this.attachment)
		) return;

		const deformArray: number[] = slot.deform;
		if (deformArray.length == 0) blend = MixBlend.setup;

		let frameVertices = this.frameVertices;
		let vertexCount = frameVertices[0].length;

		let frames = this.frames;
		if (time < frames[0]) {
			let vertexAttachment = slotAttachment;
			switch (blend) {
				case MixBlend.setup:
					deformArray.length = 0;
					return;
				case MixBlend.first:
					if (alpha == 1) {
						deformArray.length = 0;
						break;
					}
					let deform: number[] = Utils.setArraySize(deformArray, vertexCount);
					if (vertexAttachment.bones == null) {
						// Unweighted vertex positions.
						let setupVertices = vertexAttachment.vertices;
						for (var i = 0; i < vertexCount; i++)
							deform[i] += (setupVertices[i] - deform[i]) * alpha;
					} else {
						// Weighted deform offsets.
						alpha = 1 - alpha;
						for (var i = 0; i < vertexCount; i++)
							deform[i] *= alpha;
					}
			}
			return;
		}

		let deform: number[] = Utils.setArraySize(deformArray, vertexCount);
		if (time >= frames[frames.length - 1]) { // Time is after last frame.
			let lastVertices = frameVertices[frames.length - 1];
			if (alpha == 1) {
				if (blend == MixBlend.add) {
					let vertexAttachment = slotAttachment;
					if (vertexAttachment.bones == null) {
						// Unweighted vertex positions, with alpha.
						let setupVertices = vertexAttachment.vertices;
						for (let i = 0; i < vertexCount; i++) {
							deform[i] += lastVertices[i] - setupVertices[i];
						}
					} else {
						// Weighted deform offsets, with alpha.
						for (let i = 0; i < vertexCount; i++)
							deform[i] += lastVertices[i];
					}
				} else {
					Utils.arrayCopy(lastVertices, 0, deform, 0, vertexCount);
				}
			} else {
				switch (blend) {
					case MixBlend.setup: {
						let vertexAttachment = slotAttachment;
						if (vertexAttachment.bones == null) {
							// Unweighted vertex positions, with alpha.
							let setupVertices = vertexAttachment.vertices;
							for (let i = 0; i < vertexCount; i++) {
								let setup = setupVertices[i];
								deform[i] = setup + (lastVertices[i] - setup) * alpha;
							}
						} else {
							// Weighted deform offsets, with alpha.
							for (let i = 0; i < vertexCount; i++)
								deform[i] = lastVertices[i] * alpha;
						}
						break;
					}
					case MixBlend.first:
					case MixBlend.replace:
						for (let i = 0; i < vertexCount; i++)
							deform[i] += (lastVertices[i] - deform[i]) * alpha;
						break;
					case MixBlend.add:
						let vertexAttachment = slotAttachment;
						if (vertexAttachment.bones == null) {
							// Unweighted vertex positions, with alpha.
							let setupVertices = vertexAttachment.vertices;
							for (let i = 0; i < vertexCount; i++) {
								deform[i] += (lastVertices[i] - setupVertices[i]) * alpha;
							}
						} else {
							// Weighted deform offsets, with alpha.
							for (let i = 0; i < vertexCount; i++)
								deform[i] += lastVertices[i] * alpha;
						}
				}
			}
			return;
		}

		// Interpolate between the previous frame and the current frame.
		let frame = binarySearch(frames, time);
		let prevVertices = frameVertices[frame - 1];
		let nextVertices = frameVertices[frame];
		let frameTime = frames[frame];
		let percent = this.getCurvePercent(frame - 1, 1 - (time - frameTime) / (frames[frame - 1] - frameTime));

		if (alpha == 1) {
			if (blend == MixBlend.add) {
				let vertexAttachment = slotAttachment;
				if (vertexAttachment.bones == null) {
					// Unweighted vertex positions, with alpha.
					let setupVertices = vertexAttachment.vertices;
					for (let i = 0; i < vertexCount; i++) {
						let prev = prevVertices[i];
						deform[i] += prev + (nextVertices[i] - prev) * percent - setupVertices[i];
					}
				} else {
					// Weighted deform offsets, with alpha.
					for (let i = 0; i < vertexCount; i++) {
						let prev = prevVertices[i];
						deform[i] += prev + (nextVertices[i] - prev) * percent;
					}
				}
			} else {
				for (let i = 0; i < vertexCount; i++) {
					let prev = prevVertices[i];
					deform[i] = prev + (nextVertices[i] - prev) * percent;
				}
			}
		} else {
			switch (blend) {
				case MixBlend.setup: {
					let vertexAttachment = slotAttachment;
					if (vertexAttachment.bones == null) {
						// Unweighted vertex positions, with alpha.
						let setupVertices = vertexAttachment.vertices;
						for (let i = 0; i < vertexCount; i++) {
							let prev = prevVertices[i], setup = setupVertices[i];
							deform[i] = setup + (prev + (nextVertices[i] - prev) * percent - setup) * alpha;
						}
					} else {
						// Weighted deform offsets, with alpha.
						for (let i = 0; i < vertexCount; i++) {
							let prev = prevVertices[i];
							deform[i] = (prev + (nextVertices[i] - prev) * percent) * alpha;
						}
					}
					break;
				}
				case MixBlend.first:
				case MixBlend.replace:
					for (let i = 0; i < vertexCount; i++) {
						let prev = prevVertices[i];
						deform[i] += (prev + (nextVertices[i] - prev) * percent - deform[i]) * alpha;
					}
					break;
				case MixBlend.add:
					let vertexAttachment = slotAttachment;
					if (vertexAttachment.bones == null) {
						// Unweighted vertex positions, with alpha.
						let setupVertices = vertexAttachment.vertices;
						for (let i = 0; i < vertexCount; i++) {
							let prev = prevVertices[i];
							deform[i] += (prev + (nextVertices[i] - prev) * percent - setupVertices[i]) * alpha;
						}
					} else {
						// Weighted deform offsets, with alpha.
						for (let i = 0; i < vertexCount; i++) {
							let prev = prevVertices[i];
							deform[i] += (prev + (nextVertices[i] - prev) * percent) * alpha;
						}
					}
			}
		}
	}
}

/** Changes an IK constraint's {@link IkConstraint#mix}, {@link IkConstraint#softness},
 * {@link IkConstraint#bendDirection}, {@link IkConstraint#stretch}, and {@link IkConstraint#compress}. */
export class IkConstraintTimeline extends CurveTimeline {
	static ENTRIES = 6;

	static PREV_TIME = -6;
	static PREV_MIX = -5;
	static PREV_SOFTNESS = -4;
	static PREV_BEND_DIRECTION = -3;
	static PREV_COMPRESS = -2;
	static PREV_STRETCH = -1;

	static MIX = 1;
	static SOFTNESS = 2;
	static BEND_DIRECTION = 3;
	static COMPRESS = 4;
	static STRETCH = 5;

	ikConstraintIndex: number;

	constructor (frameCount: number, ikConstraintIndex: number) {
		super(frameCount, [Property.ikConstraint + "|" + ikConstraintIndex]);
		this.frames = Utils.newFloatArray(frameCount * IkConstraintTimeline.ENTRIES);
		this.ikConstraintIndex = ikConstraintIndex;
	}

	setFrame (frameIndex: number, time: number, mix: number, softness: number, bendDirection: number, compress: boolean, stretch: boolean) {
		frameIndex *= IkConstraintTimeline.ENTRIES;
		this.frames[frameIndex] = time;
		this.frames[frameIndex + IkConstraintTimeline.MIX] = mix;
		this.frames[frameIndex + IkConstraintTimeline.SOFTNESS] = softness;
		this.frames[frameIndex + IkConstraintTimeline.BEND_DIRECTION] = bendDirection;
		this.frames[frameIndex + IkConstraintTimeline.COMPRESS] = compress ? 1 : 0;
		this.frames[frameIndex + IkConstraintTimeline.STRETCH] = stretch ? 1 : 0;
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, firedEvents: Array<SpineEvent>, alpha: number, blend: MixBlend, direction: MixDirection) {
		let frames = this.frames;
		let constraint: IkConstraint = skeleton.ikConstraints[this.ikConstraintIndex];
		if (!constraint.active) return;
		if (time < frames[0]) {
			switch (blend) {
				case MixBlend.setup:
					constraint.mix = constraint.data.mix;
					constraint.softness = constraint.data.softness;
					constraint.bendDirection = constraint.data.bendDirection;
					constraint.compress = constraint.data.compress;
					constraint.stretch = constraint.data.stretch;
					return;
				case MixBlend.first:
					constraint.mix += (constraint.data.mix - constraint.mix) * alpha;
					constraint.softness += (constraint.data.softness - constraint.softness) * alpha;
					constraint.bendDirection = constraint.data.bendDirection;
					constraint.compress = constraint.data.compress;
					constraint.stretch = constraint.data.stretch;
			}
			return;
		}

		if (time >= frames[frames.length - IkConstraintTimeline.ENTRIES]) { // Time is after last frame.
			if (blend == MixBlend.setup) {
				constraint.mix = constraint.data.mix + (frames[frames.length + IkConstraintTimeline.PREV_MIX] - constraint.data.mix) * alpha;
				constraint.softness = constraint.data.softness
					+ (frames[frames.length + IkConstraintTimeline.PREV_SOFTNESS] - constraint.data.softness) * alpha;
				if (direction == MixDirection.mixOut) {
					constraint.bendDirection = constraint.data.bendDirection;
					constraint.compress = constraint.data.compress;
					constraint.stretch = constraint.data.stretch;
				} else {
					constraint.bendDirection = frames[frames.length + IkConstraintTimeline.PREV_BEND_DIRECTION];
					constraint.compress = frames[frames.length + IkConstraintTimeline.PREV_COMPRESS] != 0;
					constraint.stretch = frames[frames.length + IkConstraintTimeline.PREV_STRETCH] != 0;
				}
			} else {
				constraint.mix += (frames[frames.length + IkConstraintTimeline.PREV_MIX] - constraint.mix) * alpha;
				constraint.softness += (frames[frames.length + IkConstraintTimeline.PREV_SOFTNESS] - constraint.softness) * alpha;
				if (direction == MixDirection.mixIn) {
					constraint.bendDirection = frames[frames.length + IkConstraintTimeline.PREV_BEND_DIRECTION];
					constraint.compress = frames[frames.length + IkConstraintTimeline.PREV_COMPRESS] != 0;
					constraint.stretch = frames[frames.length + IkConstraintTimeline.PREV_STRETCH] != 0;
				}
			}
			return;
		}

		// Interpolate between the previous frame and the current frame.
		let frame = binarySearch(frames, time, IkConstraintTimeline.ENTRIES);
		let mix = frames[frame + IkConstraintTimeline.PREV_MIX];
		let softness = frames[frame + IkConstraintTimeline.PREV_SOFTNESS];
		let frameTime = frames[frame];
		let percent = this.getCurvePercent(frame / IkConstraintTimeline.ENTRIES - 1,
			1 - (time - frameTime) / (frames[frame + IkConstraintTimeline.PREV_TIME] - frameTime));

		if (blend == MixBlend.setup) {
			constraint.mix = constraint.data.mix + (mix + (frames[frame + IkConstraintTimeline.MIX] - mix) * percent - constraint.data.mix) * alpha;
			constraint.softness = constraint.data.softness
				+ (softness + (frames[frame + IkConstraintTimeline.SOFTNESS] - softness) * percent - constraint.data.softness) * alpha;
			if (direction == MixDirection.mixOut) {
				constraint.bendDirection = constraint.data.bendDirection;
				constraint.compress = constraint.data.compress;
				constraint.stretch = constraint.data.stretch;
			} else {
				constraint.bendDirection = frames[frame + IkConstraintTimeline.PREV_BEND_DIRECTION];
				constraint.compress = frames[frame + IkConstraintTimeline.PREV_COMPRESS] != 0;
				constraint.stretch = frames[frame + IkConstraintTimeline.PREV_STRETCH] != 0;
			}
		} else {
			constraint.mix += (mix + (frames[frame + IkConstraintTimeline.MIX] - mix) * percent - constraint.mix) * alpha;
			constraint.softness += (softness + (frames[frame + IkConstraintTimeline.SOFTNESS] - softness) * percent - constraint.softness) * alpha;
			if (direction == MixDirection.mixIn) {
				constraint.bendDirection = frames[frame + IkConstraintTimeline.PREV_BEND_DIRECTION];
				constraint.compress = frames[frame + IkConstraintTimeline.PREV_COMPRESS] != 0;
				constraint.stretch = frames[frame + IkConstraintTimeline.PREV_STRETCH] != 0;
			}
		}
	}
}

const cu = { // constraint utils
	r (data: TransformConstraint | TransformConstraintData | PathConstraint | PathConstraintData): number {
		return "rotateMix" in data
			? data.rotateMix as number
			: data.mixRotate;
	},
	t (data: TransformConstraint | TransformConstraintData | PathConstraint | PathConstraintData): number {
		return "translateMix" in data
			? data.translateMix as number
			: data.mixX;
	},
	sc (data: TransformConstraint | TransformConstraintData): number {
		return "scaleMix" in data
			? data.scaleMix as number
			: data.mixScaleX;
	},
	sh (data: TransformConstraint | TransformConstraintData): number {
		return "shearMix" in data
			? data.shearMix as number
			: data.mixShearY;
	},
};

/** Changes a transform constraint's {@link TransformConstraint#rotateMix}, {@link TransformConstraint#translateMix},
 * {@link TransformConstraint#scaleMix}, and {@link TransformConstraint#shearMix}. */
export class TransformConstraintTimeline extends CurveTimeline {
	static ENTRIES = 5;

	static PREV_TIME = -5;
	static PREV_ROTATE = -4;
	static PREV_TRANSLATE = -3;
	static PREV_SCALE = -2;
	static PREV_SHEAR = -1;

	static ROTATE = 1;
	static TRANSLATE = 2;
	static SCALE = 3;
	static SHEAR = 4;

	transformConstraintIndex: number;

	constructor (frameCount: number, transformConstraintIndex: number) {
		super(frameCount, [Property.transformConstraint + "|" + transformConstraintIndex]);
		this.frames = Utils.newFloatArray(frameCount * TransformConstraintTimeline.ENTRIES);
		this.transformConstraintIndex = transformConstraintIndex;
	}

	setFrame (frameIndex: number, time: number, rotateMix: number, translateMix: number, scaleMix: number, shearMix: number) {
		frameIndex *= TransformConstraintTimeline.ENTRIES;
		this.frames[frameIndex] = time;
		this.frames[frameIndex + TransformConstraintTimeline.ROTATE] = rotateMix;
		this.frames[frameIndex + TransformConstraintTimeline.TRANSLATE] = translateMix;
		this.frames[frameIndex + TransformConstraintTimeline.SCALE] = scaleMix;
		this.frames[frameIndex + TransformConstraintTimeline.SHEAR] = shearMix;
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, firedEvents: Array<SpineEvent>, alpha: number, blend: MixBlend, direction: MixDirection) {
		let frames = this.frames;

		let constraint: TransformConstraint = skeleton.transformConstraints[this.transformConstraintIndex];
		if (!constraint.active) return;

		if (time < frames[0]) {
			let data = constraint.data;
			switch (blend) {
				case MixBlend.setup:
					debugger;
					constraint.mixRotate = "rotateMix" in data
						? data.rotateMix as number
						: data.mixRotate;

					constraint.mixX = constraint.mixY = "translateMix" in data
						? data.translateMix as number
						: data.mixX;

					constraint.mixScaleX = constraint.mixScaleY = "scaleMix" in data
						? data.scaleMix as number
						: data.mixScaleX;

					constraint.mixShearY = "shearMix" in data
						? data.shearMix as number
						: data.mixShearY;
					return;
				case MixBlend.first: {
					const { r, t, sc, sh } = cu;
					constraint.mixRotate = r(constraint) + (r(data) - r(constraint)) * alpha;
					constraint.mixX = constraint.mixY = t(constraint) + (t(data) - t(constraint)) * alpha;
					constraint.mixScaleX = constraint.mixScaleY = sc(constraint) + (sc(data) - sc(constraint)) * alpha;
					constraint.mixShearY = sh(constraint) + (sh(data) - sh(constraint)) * alpha;
				}
			}
			return;
		}

		let rotate = 0, translate = 0, scale = 0, shear = 0;
		if (time >= frames[frames.length - TransformConstraintTimeline.ENTRIES]) { // Time is after last frame.
			let i = frames.length;
			rotate = frames[i + TransformConstraintTimeline.PREV_ROTATE];
			translate = frames[i + TransformConstraintTimeline.PREV_TRANSLATE];
			scale = frames[i + TransformConstraintTimeline.PREV_SCALE];
			shear = frames[i + TransformConstraintTimeline.PREV_SHEAR];
		} else {
			// Interpolate between the previous frame and the current frame.
			let frame = binarySearch(frames, time, TransformConstraintTimeline.ENTRIES);
			rotate = frames[frame + TransformConstraintTimeline.PREV_ROTATE];
			translate = frames[frame + TransformConstraintTimeline.PREV_TRANSLATE];
			scale = frames[frame + TransformConstraintTimeline.PREV_SCALE];
			shear = frames[frame + TransformConstraintTimeline.PREV_SHEAR];
			let frameTime = frames[frame];
			let percent = this.getCurvePercent(frame / TransformConstraintTimeline.ENTRIES - 1,
				1 - (time - frameTime) / (frames[frame + TransformConstraintTimeline.PREV_TIME] - frameTime));

			rotate += (frames[frame + TransformConstraintTimeline.ROTATE] - rotate) * percent;
			translate += (frames[frame + TransformConstraintTimeline.TRANSLATE] - translate) * percent;
			scale += (frames[frame + TransformConstraintTimeline.SCALE] - scale) * percent;
			shear += (frames[frame + TransformConstraintTimeline.SHEAR] - shear) * percent;
		}

		const { r, t, sc, sh } = cu;
		if (blend == MixBlend.setup) {
			let data = constraint.data;
			constraint.mixRotate = r(data) + (rotate - r(data)) * alpha;
			constraint.mixX = constraint.mixY = t(data) + (translate - t(data)) * alpha;
			constraint.mixScaleX = constraint.mixScaleY = sc(data) + (scale - sc(data)) * alpha;
			constraint.mixShearY = sh(data) + (shear - sh(data)) * alpha;
		} else {
			constraint.mixRotate = r(constraint) + (rotate - r(constraint)) * alpha;
			constraint.mixX = constraint.mixY = t(constraint) + (translate - t(constraint)) * alpha;
			constraint.mixScaleX = constraint.mixScaleY = sc(constraint) + (scale - sc(constraint)) * alpha;
			constraint.mixShearY = sh(constraint) + (shear - sh(constraint)) * alpha;
		}
	}
}

/** Changes a path constraint's {@link PathConstraint#position}. */
export class PathConstraintPositionTimeline extends CurveTimeline {
	static ENTRIES = 2;

	static PREV_TIME = -2;
	static PREV_VALUE = -1;

	static VALUE = 1;

	pathConstraintIndex: number;

	constructor (frameCount: number, pathConstraintIndex: number) {
		super(frameCount, [Property.pathConstraintPosition + "|" + pathConstraintIndex]);
		this.frames = Utils.newFloatArray(frameCount * PathConstraintPositionTimeline.ENTRIES);
		this.pathConstraintIndex = pathConstraintIndex;
	}

	setFrame (frameIndex: number, time: number, value: number) {
		frameIndex *= PathConstraintPositionTimeline.ENTRIES;
		this.frames[frameIndex] = time;
		this.frames[frameIndex + PathConstraintPositionTimeline.VALUE] = value;
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, firedEvents: Array<SpineEvent>, alpha: number, blend: MixBlend, direction: MixDirection) {
		let frames = this.frames;
		let constraint: PathConstraint = skeleton.pathConstraints[this.pathConstraintIndex];
		if (!constraint.active) return;
		if (time < frames[0]) {
			switch (blend) {
				case MixBlend.setup:
					constraint.position = constraint.data.position;
					return;
				case MixBlend.first:
					constraint.position += (constraint.data.position - constraint.position) * alpha;
			}
			return;
		}

		let position = 0;
		if (time >= frames[frames.length - PathConstraintPositionTimeline.ENTRIES]) // Time is after last frame.
			position = frames[frames.length + PathConstraintPositionTimeline.PREV_VALUE];
		else {
			// Interpolate between the previous frame and the current frame.
			let frame = binarySearch(frames, time, PathConstraintPositionTimeline.ENTRIES);
			position = frames[frame + PathConstraintPositionTimeline.PREV_VALUE];
			let frameTime = frames[frame];
			let percent = this.getCurvePercent(frame / PathConstraintPositionTimeline.ENTRIES - 1,
				1 - (time - frameTime) / (frames[frame + PathConstraintPositionTimeline.PREV_TIME] - frameTime));

			position += (frames[frame + PathConstraintPositionTimeline.VALUE] - position) * percent;
		}
		if (blend == MixBlend.setup)
			constraint.position = constraint.data.position + (position - constraint.data.position) * alpha;
		else
			constraint.position += (position - constraint.position) * alpha;
	}
}

/** Changes a path constraint's {@link PathConstraint#spacing}. */
export class PathConstraintSpacingTimeline extends PathConstraintPositionTimeline {
	constructor (frameCount: number, pathConstraintIndex: number) {
		super(frameCount, pathConstraintIndex);
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, firedEvents: Array<SpineEvent>, alpha: number, blend: MixBlend, direction: MixDirection) {
		let frames = this.frames;
		let constraint: PathConstraint = skeleton.pathConstraints[this.pathConstraintIndex];
		if (!constraint.active) return;
		if (time < frames[0]) {
			switch (blend) {
				case MixBlend.setup:
					constraint.spacing = constraint.data.spacing;
					return;
				case MixBlend.first:
					constraint.spacing += (constraint.data.spacing - constraint.spacing) * alpha;
			}
			return;
		}

		let spacing = 0;
		if (time >= frames[frames.length - PathConstraintSpacingTimeline.ENTRIES]) // Time is after last frame.
			spacing = frames[frames.length + PathConstraintSpacingTimeline.PREV_VALUE];
		else {
			// Interpolate between the previous frame and the current frame.
			let frame = binarySearch(frames, time, PathConstraintSpacingTimeline.ENTRIES);
			spacing = frames[frame + PathConstraintSpacingTimeline.PREV_VALUE];
			let frameTime = frames[frame];
			let percent = this.getCurvePercent(frame / PathConstraintSpacingTimeline.ENTRIES - 1,
				1 - (time - frameTime) / (frames[frame + PathConstraintSpacingTimeline.PREV_TIME] - frameTime));

			spacing += (frames[frame + PathConstraintSpacingTimeline.VALUE] - spacing) * percent;
		}

		if (blend == MixBlend.setup)
			constraint.spacing = constraint.data.spacing + (spacing - constraint.data.spacing) * alpha;
		else
			constraint.spacing += (spacing - constraint.spacing) * alpha;
	}
}

/** Changes a transform constraint's {@link PathConstraint#rotateMix} and
 * {@link TransformConstraint#translateMix}. */
export class PathConstraintMixTimeline extends CurveTimeline {
	static ENTRIES = 3;

	static PREV_TIME = -3;
	static PREV_ROTATE = -2;
	static PREV_TRANSLATE = -1;

	static ROTATE = 1;
	static TRANSLATE = 2;

	pathConstraintIndex: number;

	constructor (frameCount: number, pathConstraintIndex: number) {
		super(frameCount, [Property.pathConstraintMix + "|" + pathConstraintIndex]);
		this.frames = Utils.newFloatArray(frameCount * PathConstraintMixTimeline.ENTRIES);
		this.pathConstraintIndex = pathConstraintIndex;
	}

	setFrame (frameIndex: number, time: number, rotateMix: number, translateMix: number) {
		frameIndex *= PathConstraintMixTimeline.ENTRIES;
		this.frames[frameIndex] = time;
		this.frames[frameIndex + PathConstraintMixTimeline.ROTATE] = rotateMix;
		this.frames[frameIndex + PathConstraintMixTimeline.TRANSLATE] = translateMix;
	}

	apply (skeleton: Skeleton, lastTime: number, time: number, firedEvents: Array<SpineEvent>, alpha: number, blend: MixBlend, direction: MixDirection) {
		let frames = this.frames;
		let constraint: PathConstraint = skeleton.pathConstraints[this.pathConstraintIndex];
		if (!constraint.active) return;

		if (time < frames[0]) {
			const { r, t } = cu;

			switch (blend) {
				case MixBlend.setup:
					constraint.mixRotate = r(constraint.data);
					constraint.mixX = constraint.mixY = t(constraint.data);
					return;
				case MixBlend.first:
					constraint.mixRotate = r(constraint) + (r(constraint.data) - r(constraint)) * alpha;
					constraint.mixX = constraint.mixY = t(constraint) + (t(constraint.data) - t(constraint)) * alpha;
			}
			return;
		}

		let rotate = 0, translate = 0;
		if (time >= frames[frames.length - PathConstraintMixTimeline.ENTRIES]) { // Time is after last frame.
			rotate = frames[frames.length + PathConstraintMixTimeline.PREV_ROTATE];
			translate = frames[frames.length + PathConstraintMixTimeline.PREV_TRANSLATE];
		} else {
			// Interpolate between the previous frame and the current frame.
			let frame = binarySearch(frames, time, PathConstraintMixTimeline.ENTRIES);
			rotate = frames[frame + PathConstraintMixTimeline.PREV_ROTATE];
			translate = frames[frame + PathConstraintMixTimeline.PREV_TRANSLATE];
			let frameTime = frames[frame];
			let percent = this.getCurvePercent(frame / PathConstraintMixTimeline.ENTRIES - 1,
				1 - (time - frameTime) / (frames[frame + PathConstraintMixTimeline.PREV_TIME] - frameTime));

			rotate += (frames[frame + PathConstraintMixTimeline.ROTATE] - rotate) * percent;
			translate += (frames[frame + PathConstraintMixTimeline.TRANSLATE] - translate) * percent;
		}

		const { r, t } = cu;
		if (blend == MixBlend.setup) {
			constraint.mixRotate = r(constraint.data) + (rotate - r(constraint.data)) * alpha;
			constraint.mixX = constraint.mixY = t(constraint.data) + (translate - t(constraint.data)) * alpha;
		} else {
			constraint.mixRotate = r(constraint) + (rotate - r(constraint)) * alpha;
			constraint.mixX = constraint.mixY = t(constraint) + (translate - t(constraint)) * alpha;
		}
	}
}
