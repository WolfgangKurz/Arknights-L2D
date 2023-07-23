import { useCallback, useEffect, useState } from "preact/hooks";

import SpineRenderer from "./spine";

import style from "./app.module.scss";

import list from "./json/list.json";

type Locale = "KR" | "EN";

type SkinData = [id: string, collection: string, color: string];
type SkinStructure = Record<string, Record<string, SkinData>>;
const skinData: SkinStructure = list as unknown as SkinStructure;

const skinMap: Record<string, SkinData> = {};
Object.keys(skinData).forEach(g => {
	Object.keys(skinData[g]).forEach(k => {
		const o = skinData[g][k];
		skinMap[o[0]] = o;
	});
});

export function App () {
	const [model, setModel] = useState<SkinData | null>(null);
	const [locale, setLocale] = useState<Locale>("KR");

	const [localeData, setLocaleData] = useState<Record<string, string> | null>(null);

	const locales: Locale[] = ["KR", "EN"];

	const loc = useCallback((key: string) => {
		return localeData && (key in localeData) ? localeData[key] : key;
	}, [localeData]);

	useEffect(() => {
		setLocaleData(null);

		fetch(`/${locale}.json`)
			.then(r => r.json())
			.then(r => setLocaleData(r))
			.catch(e => {
				console.error(e?.message ?? "failed to load locale");
			});
	}, [locale]);

	function alphaColor (color: string, alpha: number): string {
		if (!color) return `rgba(255, 255, 255, ${alpha})`;

		const r = parseInt(color.substring(1, 3), 16);
		const g = parseInt(color.substring(3, 5), 16);
		const b = parseInt(color.substring(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	return <div class={ style.Root }>
		<div class={ style.Page }>
			<div class={ style.Toolbox }>
				<select onChange={ e => {
					const k = e.currentTarget.value;
					setModel(skinMap[k]);
				} }>
					<option value="" disabled selected>{ loc("# Select skin to view") }</option>
					{ Object.keys(skinData).map(g => <optgroup label={ loc(g) }>
						{ Object.keys(skinData[g]).map(k => <option value={ skinData[g][k][0] }>{ loc(k) }</option>) }
					</optgroup>) }
				</select>

				{ locales.map(loc =>
					locale === loc
						? <span class={ style.Link }>{ loc }</span>
						: <a class={ style.Link } href="#" onClick={ e => {
							e.preventDefault();
							setLocale(loc);
						} }>{ loc }</a>
				) }
			</div>

			<div class={ style.Container }>
				{ model ?
					<>
						<SpineRenderer uid={ model[0] } />
						<div
							key={ `collection-${model[1]}` }
							class={ style.Collection }
							style={ { backgroundColor: alphaColor(model[2], 0.89) } }
						>
							<img src={ `/collections/${model[1]}.png` } alt={ model[1] } />
						</div>
					</>
					: <></>
				}
			</div>

			<div class={ style.Footer }>
				{ loc("This site is fit on Desktop") }
				・
				by <a href="https://github.com/WolfgangKurz" target="_blank" rel="noreferrer noopener nofollow">
					WolfgangKurz
				</a>
				・
				<a href="https://github.com/WolfgangKurz/Arknights-L2D" target="_blank" rel="noreferrer noopener nofollow">
					Github
				</a>
			</div>
		</div>
	</div>;
}
