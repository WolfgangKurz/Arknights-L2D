import { useEffect, useRef, useState } from "preact/hooks";

import IllustModel from "./IllustModel";

import style from "./style.module.scss";

interface IllustPlayerProps {
	uid: string;
	pathPrefix?: string;
}

const IllustPlayer: FunctionalComponent<IllustPlayerProps> = (props) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const [app, setApp] = useState<IllustModel | null>(null);

	useEffect(() => {
		if (app) {
			app.destroy(); // destroy and set to null (to reload player)
			setApp(null);
		}
	}, [props.uid, props.pathPrefix]);

	useEffect(() => {
		if (!app && canvasRef.current) {
			setApp(new IllustModel(props.uid, canvasRef.current, props.pathPrefix || "/"));
		}

		return () => {
			if (app) {
				app.destroy();
				setApp(null);
			}
		};
	}, [app, canvasRef.current]);

	useEffect(() => {
		if (app) {
			app.initialize().then(() => {
				app.load();

				// app.setSkin(["skin_base", "breast/Unedited"]);
				app.play("Idle");

				// on next frame
				requestAnimationFrame(() => app.center());
			});
		}
	}, [app]);

	return <div class={ style.IllustPlayer }>
		<canvas key="illust-player-canvas" ref={ canvasRef } />

		{ app ? <div class={ style.Interact }>
			<button onClick={ e => {
				e.preventDefault();
				app.play("Interact");
			} }>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
					<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 21v-2a4 4 0 0 0-4-4h-1a1 1 0 0 1-1-1V9a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v9l-2.4-3.2A2 2 0 0 0 6 14h-.434C4.701 14 4 14.701 4 15.566v0c0 .284.077.563.223.806L7 21m5-17V3m6 7h1M5 10h1m1.343-4.657l-.707-.707m10.021.707l.707-.707" />
				</svg>
			</button>
			<button onClick={ e => {
				e.preventDefault();
				app.play("Special");
			} }>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
					<path fill="currentColor" d="M10.655 3.466c.55-1.115 2.14-1.115 2.69 0l1.964 3.98l4.392.638c1.23.178 1.721 1.69.831 2.558l-3.178 3.098l.75 4.374c.21 1.225-1.076 2.16-2.176 1.58L12 17.63l-3.928 2.065c-1.1.578-2.387-.356-2.176-1.581l.75-4.374l-3.178-3.098c-.89-.868-.399-2.38.831-2.558l4.392-.639l1.964-3.98zM12 5.26l-1.632 3.306a1.5 1.5 0 0 1-1.13.82l-3.649.531l2.641 2.574a1.5 1.5 0 0 1 .431 1.328l-.623 3.634l3.264-1.716a1.5 1.5 0 0 1 1.396 0l3.264 1.716l-.623-3.634a1.5 1.5 0 0 1 .431-1.328l2.64-2.574l-3.649-.53a1.5 1.5 0 0 1-1.129-.82L12 5.26z" />
				</svg>
			</button>
		</div>
			: <></>
		}
	</div>;
};
export default IllustPlayer;
