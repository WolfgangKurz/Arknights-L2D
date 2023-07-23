import { FunctionalComponent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import Spine from "./Spine";
import SpineCanvas from "./SpineCanvas";

import style from "./style.module.scss";

enum RendererStateEnum {
	None,
	Error,
	Loading,
	OK,
}

export interface RendererProps {
	uid: string;
}

const SpineRenderer: FunctionalComponent<RendererProps> = (props) => {
	const WrapperRef = useRef<HTMLDivElement>(null);
	const CanvasRef = useRef<HTMLCanvasElement>(null);

	const canvas = useRef<SpineCanvas | null>(null);
	const app = useRef<Spine | null>(null);

	const [state, setState] = useState<RendererStateEnum>(RendererStateEnum.None);
	const [error, setError] = useState<string>("");

	function Initialize () {
		const { current: canvas } = CanvasRef;
		if (!canvas) {
			setState(RendererStateEnum.Error);
			setError("Invalid element");
			return;
		}

		setState(RendererStateEnum.Loading);
	}

	useEffect(() => {
		if (!props.uid) {
			setState(RendererStateEnum.Error);
			setError("Invalid uid parameter");
		} else {
			if (canvas.current) {
				canvas.current.assetManager.dispose();
				canvas.current.renderer.dispose();
			}

			canvas.current = null;
			app.current = null;

			setState(RendererStateEnum.None);
			setError("");

			Initialize();
		}
	}, [props.uid]);

	useEffect(() => {
		if (state === RendererStateEnum.Loading) { // from Initialize
			const { current: canvasEl } = CanvasRef;
			if (!canvasEl) return;

			try {
				app.current = new Spine(
					"dyn_illust_" + props.uid,
					(app, names) => {
						app.addSkin("default");
						app.play();

						setState(RendererStateEnum.OK);
					},
				);

				canvas.current = new SpineCanvas(canvasEl, {
					app: app.current,
					pathPrefix: `/models/${props.uid}/`,
				});
			} catch (e) {
				setState(RendererStateEnum.Error);
				setError("Spine Error\n\n" + (e instanceof Error ? e.toString() : e));
			}
		} else if (state === RendererStateEnum.OK) {
			if (app.current)
				app.current.updateCamera();
		}
	}, [state]);

	useLayoutEffect(() => {
		return () => {
			if (canvas.current) {
				canvas.current.destroy();
				canvas.current = null;
			}
			app.current = null;
		};
	}, []);

	const overlayTexts: Record<RendererStateEnum, string> = {
		[RendererStateEnum.OK]: "",
		[RendererStateEnum.None]: "Initializing",
		[RendererStateEnum.Loading]: "In loading",
		[RendererStateEnum.Error]: `Error - ${error}`,
	};

	return <div class={ style.SpineRenderer } ref={ WrapperRef }>
		<canvas ref={ CanvasRef } />

		{ state !== RendererStateEnum.OK
			? <div class={ style.OverlayText }>
				{ overlayTexts[state] }
			</div>
			: <div class={ style.Interact }>
				<button onClick={ e => {
					e.preventDefault();
					if (app.current)
						app.current.play("Interact");
				} }>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
						<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 21v-2a4 4 0 0 0-4-4h-1a1 1 0 0 1-1-1V9a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v9l-2.4-3.2A2 2 0 0 0 6 14h-.434C4.701 14 4 14.701 4 15.566v0c0 .284.077.563.223.806L7 21m5-17V3m6 7h1M5 10h1m1.343-4.657l-.707-.707m10.021.707l.707-.707" />
					</svg>
				</button>
				<button onClick={ e => {
					e.preventDefault();
					if (app.current)
						app.current.play("Special");
				} }>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
						<path fill="currentColor" d="M10.655 3.466c.55-1.115 2.14-1.115 2.69 0l1.964 3.98l4.392.638c1.23.178 1.721 1.69.831 2.558l-3.178 3.098l.75 4.374c.21 1.225-1.076 2.16-2.176 1.58L12 17.63l-3.928 2.065c-1.1.578-2.387-.356-2.176-1.581l.75-4.374l-3.178-3.098c-.89-.868-.399-2.38.831-2.558l4.392-.639l1.964-3.98zM12 5.26l-1.632 3.306a1.5 1.5 0 0 1-1.13.82l-3.649.531l2.641 2.574a1.5 1.5 0 0 1 .431 1.328l-.623 3.634l3.264-1.716a1.5 1.5 0 0 1 1.396 0l3.264 1.716l-.623-3.634a1.5 1.5 0 0 1 .431-1.328l2.64-2.574l-3.649-.53a1.5 1.5 0 0 1-1.129-.82L12 5.26z" />
					</svg>
				</button>
			</div>
		}
	</div>;
};
export default SpineRenderer;
