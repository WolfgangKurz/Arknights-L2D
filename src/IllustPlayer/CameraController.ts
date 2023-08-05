import { Input, OrthoCamera, Vector3 } from "@esotericsoftware/spine-webgl";

export class CameraController {
	constructor (public canvas: HTMLCanvasElement, public camera: OrthoCamera) {
		let cameraX = 0, cameraY = 0, cameraZoom = 0;
		let mouseX = 0, mouseY = 0;
		let lastX = 0, lastY = 0;
		let initialZoom = 0;
		
		new Input(canvas).addListener({
			down: (x, y) => {
				cameraX = camera.position.x;
				cameraY = camera.position.y;
				mouseX = lastX = x;
				mouseY = lastY = y;
				initialZoom = camera.zoom;
			},
			dragged: (x, y) => {
				let deltaX = x - mouseX;
				let deltaY = y - mouseY;
				let originWorld = camera.screenToWorld(new Vector3(0, 0), canvas.clientWidth, canvas.clientHeight);
				let deltaWorld = camera.screenToWorld(new Vector3(deltaX, deltaY), canvas.clientWidth, canvas.clientHeight).sub(originWorld);
				camera.position.set(cameraX - deltaWorld.x, cameraY - deltaWorld.y, 0);
				camera.update();
				lastX = x;
				lastY = y;
			},
			wheel: (delta) => {
				let zoomAmount = delta / 500 * camera.zoom;
				let newZoom = camera.zoom + zoomAmount;
				if (newZoom > 0) {
					let x = 0, y = 0;
					if (delta < 0) {
						x = lastX;
						y = lastY;
					}
					else {
						let viewCenter = new Vector3(canvas.clientWidth / 2 + 15, canvas.clientHeight / 2);
						let mouseToCenterX = lastX - viewCenter.x;
						let mouseToCenterY = canvas.clientHeight - 1 - lastY - viewCenter.y;
						x = viewCenter.x - mouseToCenterX;
						y = canvas.clientHeight - 1 - viewCenter.y + mouseToCenterY;
					}
					let oldDistance = camera.screenToWorld(new Vector3(x, y), canvas.clientWidth, canvas.clientHeight);
					camera.zoom = newZoom;
					camera.update();
					let newDistance = camera.screenToWorld(new Vector3(x, y), canvas.clientWidth, canvas.clientHeight);
					camera.position.add(oldDistance.sub(newDistance));
					camera.update();
				}
			},
			zoom: (initialDistance, distance) => {
				let newZoom = initialDistance / distance;
				camera.zoom = initialZoom * newZoom;
			},
			up: (x, y) => {
				lastX = x;
				lastY = y;
			},
			moved: (x, y) => {
				lastX = x;
				lastY = y;
			},
		});
	}
}
