/**
 * Image Pin Block — 共通Scene Modelモジュール。
 *
 * 保存済みAttributes(pin.x/y%を含む)から、natural座標・表示設定の
 * 正規化済みモデル(Scene Model)を作る。DOM計測・描画は一切行わない
 * (scene-assets.js/scene-text.js/geometry.js/svg-renderer.jsの責務)。
 *
 * ─── 保存データ互換(5節) ───
 * pin.x/y は既存どおり0〜100の百分率で保存されたまま(保存schema・migrationは
 * 一切変更しない)。Scene Model・Geometry・Rendererは百分率を直接扱わず、
 * 必ずこのモジュール(buildSceneModel)を経由してnatural座標
 * (`Geometry.computePinCenter()`)へ変換したPin中心だけを使う。
 *
 * ─── 永続データと派生データの分離(6節) ───
 * このモジュールが返すSceneModelは、Attributesから決定的に導出できる値
 * (natural座標のPin中心・表示設定の正規化値)だけを持つ。Marker解決済み寸法・
 * text layout結果・Label中心・Popover配置・Bubble/Tail path等の「さらに計算が
 * 必要な派生値」は含めない(それらはgeometry.js/scene-text.jsが計算し、
 * scene-runtime.jsがResolved Sceneとして組み立てる。SceneModel自体・
 * Resolved SceneのいずれもsetAttributes()へ書き戻さない)。
 */
( function( root, factory ) {
	'use strict';
	var api = factory();
	if ( 'undefined' !== typeof module && module.exports ) {
		module.exports = api;
	}
	if ( root ) {
		root.ImagePinBlockSceneModel = api;
	}
} )(
	( 'undefined' !== typeof window ) ? window : ( ( 'undefined' !== typeof global ) ? global : null ),
	function() {
		'use strict';

		// 既存のフォールバック・範囲(editor.js/image-pin-block.phpと必ず一致させる。
		// Scene Model側にも同じ値を持つ。値の意味・範囲は変更していない)。
		var DEFAULTS = {
			pinSize: 24, pinSizeMin: 4, pinSizeMax: 300,
			pinColor: '#e63946',
			labelBackgroundColor: 'rgba(255,255,255,0.9)',
			labelTextColor: '#1e1e1e',
			labelFontSize: 12, labelFontSizeMin: 6, labelFontSizeMax: 200,
			labelBackgroundOpacity: 100,
			labelStrokeColor: '#ffffff',
			labelStrokeWidth: 'none',
			popoverFontSize: 12, popoverFontSizeMin: 6, popoverFontSizeMax: 200,
			popoverBackgroundOpacity: 100,
			popoverStrokeColor: '#ffffff',
			popoverStrokeWidth: 'none',
			popoverBackgroundBase: '#ffffff',
			markerScale: 100, markerScaleMin: 1, markerScaleMax: 500,
			tailSize: 'medium',
			pcBehavior: 'hover-click',
			mobileBehavior: 'tap-tap'
		};

		var STROKE_WIDTHS = [ 'none', 'thin', 'normal', 'thick' ];
		var TAIL_SIZES = [ 'small', 'medium', 'large' ];
		var STROKE_WIDTH_PX = { none: 0, thin: 1, normal: 2, thick: 3 };

		function clampNumber( value, min, max, fallback ) {
			var n = ( 'number' === typeof value ) ? value : parseFloat( value );
			if ( ! isFinite( n ) ) {
				return fallback;
			}
			return ( n >= min && n <= max ) ? n : fallback;
		}

		function resolveEnum( value, allowed, fallback ) {
			return ( allowed.indexOf( value ) !== -1 ) ? value : fallback;
		}

		// pins[]の1件を、Scene Model用のPinエントリへ正規化する。Geometry: Pin中心は
		// ここでnatural座標へ変換済み(Renderer/Runtimeは百分率を扱わない)。
		function buildPinModel( pin, imageWidth, imageHeight, Geometry ) {
			var hasMarker = !! ( pin.markerImageUrl && '' !== pin.markerImageUrl );
			var center = Geometry.computePinCenter( imageWidth, imageHeight, pin.x || 0, pin.y || 0 );
			var hasLabelText = !! ( pin.label && '' !== pin.label );
			var showLabel = hasMarker ? ( pin.showLabel !== false ) : true;
			var hasDescription = !! ( pin.description && '' !== pin.description );
			return {
				id: pin.id,
				xPercent: pin.x || 0,
				yPercent: pin.y || 0,
				cx: center.x,
				cy: center.y,
				hasMarker: hasMarker,
				markerImageUrl: hasMarker ? pin.markerImageUrl : '',
				markerScale: clampNumber( pin.markerScale, DEFAULTS.markerScaleMin, DEFAULTS.markerScaleMax, DEFAULTS.markerScale ),
				label: {
					text: pin.label || '',
					hasText: hasLabelText,
					show: showLabel && hasLabelText,
					positionRaw: ( 'number' === typeof pin.labelPosition && isFinite( pin.labelPosition ) ) ? pin.labelPosition : NaN
				},
				description: pin.description || '',
				hasDescription: hasDescription,
				target: pin.target || ''
			};
		}

		// attributes(ブロック保存属性)からSceneModelを組み立てる。Geometry引数は
		// window.ImagePinBlockGeometry(またはrequireしたもの)を渡すこと
		// (このモジュール自身はGeometryを直接requireせず、呼び出し側が注入する。
		// DOM/WordPress同様、依存を注入する形にして単体テストしやすくする)。
		function buildSceneModel( attributes, Geometry ) {
			var pins = attributes.pins || [];
			var imageWidth = attributes.imageWidth || 0;
			var imageHeight = attributes.imageHeight || 0;

			var pinModels = pins.filter( function( p ) {
				return p && p.id;
			} ).map( function( p ) {
				return buildPinModel( p, imageWidth, imageHeight, Geometry );
			} );

			var labelStrokeWidth = resolveEnum( attributes.labelStrokeWidth, STROKE_WIDTHS, DEFAULTS.labelStrokeWidth );
			var popoverStrokeWidth = resolveEnum( attributes.popoverStrokeWidth, STROKE_WIDTHS, DEFAULTS.popoverStrokeWidth );

			return {
				image: {
					url: attributes.imageUrl || '',
					width: imageWidth,
					height: imageHeight
				},
				pins: pinModels,
				appearance: {
					pin: {
						size: clampNumber( attributes.pinSize, DEFAULTS.pinSizeMin, DEFAULTS.pinSizeMax, DEFAULTS.pinSize ),
						color: attributes.pinColor || DEFAULTS.pinColor
					},
					label: {
						backgroundColor: attributes.labelBackgroundColor || DEFAULTS.labelBackgroundColor,
						textColor: attributes.labelTextColor || DEFAULTS.labelTextColor,
						fontSize: clampNumber( attributes.labelFontSize, DEFAULTS.labelFontSizeMin, DEFAULTS.labelFontSizeMax, DEFAULTS.labelFontSize ),
						backgroundOpacity: clampNumber( attributes.labelBackgroundOpacity, 0, 100, DEFAULTS.labelBackgroundOpacity ),
						strokeColor: attributes.labelStrokeColor || DEFAULTS.labelStrokeColor,
						strokeWidth: labelStrokeWidth,
						strokeWidthPx: STROKE_WIDTH_PX[ labelStrokeWidth ] || 0,
						speechBubble: !! attributes.labelSpeechBubble,
						tailSize: resolveEnum( attributes.labelTailSize, TAIL_SIZES, DEFAULTS.tailSize )
					},
					popover: {
						// 空文字は「未設定=fallbackを使う」センチネル値(保存schemaは変更しない。
						// 11節: popoverTextColor===''の場合のみGeometry.POPOVER_TEXT_COLOR_FALLBACKへ
						// 解決する。明示設定された色はそのまま使う)。
						backgroundColorRaw: attributes.popoverBackgroundColor || '',
						textColorRaw: attributes.popoverTextColor || '',
						fontSize: clampNumber( attributes.popoverFontSize, DEFAULTS.popoverFontSizeMin, DEFAULTS.popoverFontSizeMax, DEFAULTS.popoverFontSize ),
						backgroundOpacity: clampNumber( attributes.popoverBackgroundOpacity, 0, 100, DEFAULTS.popoverBackgroundOpacity ),
						strokeColor: attributes.popoverStrokeColor || DEFAULTS.popoverStrokeColor,
						strokeWidth: popoverStrokeWidth,
						strokeWidthPx: STROKE_WIDTH_PX[ popoverStrokeWidth ] || 0,
						speechBubble: !! attributes.popoverSpeechBubble,
						tailSize: resolveEnum( attributes.popoverTailSize, TAIL_SIZES, DEFAULTS.tailSize )
					}
				},
				interaction: {
					pcBehavior: resolveEnum( attributes.pcBehavior, [ 'hover-click', 'click-link' ], DEFAULTS.pcBehavior ),
					mobileBehavior: resolveEnum( attributes.mobileBehavior, [ 'tap-jump', 'tap-tap', 'tap-link' ], DEFAULTS.mobileBehavior )
				}
			};
		}

		return {
			DEFAULTS: DEFAULTS,
			STROKE_WIDTH_PX: STROKE_WIDTH_PX,
			buildSceneModel: buildSceneModel
		};
	}
);
