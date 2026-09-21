/**
 * Image Pin Block — 共通Geometryモジュール。
 * SVG Scene Renderer移行に伴い、drag/resize制約もこのファイルへ統合した。
 *
 * Pin/Marker BODY・Label center・Popover配置・Bubble/Tail・drag containment/
 * resize制約に使う「純粋関数」(DOM・React・WordPress API・SVG DOM・Camera・
 * surfaceに一切依存しない、同じ入力なら常に同じ出力を返す関数)だけをここへ
 * 集約する。scene-model.js/svg-renderer.js/scene-runtime.js/editor.js/view.js は
 * この1つのファイルの関数を呼ぶだけに徹し、位置計算の式そのものを複製しない
 * (過去に何度も発生した「Editor/Frontendで別々に式を持ち、片方だけ直して
 * 再発する」問題を、実装を1か所にまとめることで構造的に防ぐ)。
 *
 * ─── canonical coordinate(唯一の正) ───
 * このファイルが扱う座標・サイズは、すべて「画像の元解像度(natural image
 * coordinate。0〜imageWidth、0〜imageHeight)」を基準にした値(以下「natural」)。
 * SVG Scene RendererはSVG自身の<svg viewBox="0 0 imageWidth
 * imageHeight">がnatural座標系そのものであるため、Renderer・Cameraは
 * このファイルが返すnatural値をそのままSVG属性(cx/cy/x/y/points等)へ設定する
 * だけでよく、「screen = natural * renderScale」という手動スケール変換は
 * もう存在しない(ブラウザのSVG描画がviewBoxを通じて自動的に行う)。
 * このファイル自身は相変わらずnatural単位のみを扱い、screen/renderScaleの概念を
 * 一切知らない。
 *
 * ─── ビルドシステムは使わない ───
 * このプラグインは元々ビルドツールを使わない構成のため、このファイルも
 * 素のES5関数のみで書く(var、無名function、アロー関数不使用)。ブラウザでは
 * window.ImagePinBlockGeometry として、Nodeでは module.exports として、
 * 同じ内容を公開する(UMDパターン)。
 */
( function( root, factory ) {
	'use strict';
	var api = factory();
	if ( 'undefined' !== typeof module && module.exports ) {
		module.exports = api;
	}
	if ( root ) {
		root.ImagePinBlockGeometry = api;
	}
} )(
	( 'undefined' !== typeof window ) ? window : ( ( 'undefined' !== typeof global ) ? global : null ),
	function() {
		'use strict';

		// ─── canonical定数(natural単位固定。表示スケールに追従して変える値は
		// 一切含めない) ───

		// Label位置(Pin/Marker+Label寸法込みの「安全矩形」を小さく角丸化した軌道)関連。
		// Label寸法を最初から安全矩形に含める現在の方式を使う
		// (docs/DATA_LAYOUT.md「Label位置」参照)。
		var LABEL_GAP = 6;
		var LABEL_SAFE_CORNER_RADIUS_RATIO = 0.22;
		var LABEL_SAFE_CORNER_RADIUS_MIN = 4;
		var LABEL_SAFE_CORNER_RADIUS_MAX = 14;
		var LABEL_POSITION_FALLBACK_ROUND = 0;
		var LABEL_POSITION_FALLBACK_MARKER = 0.25;

		// Label BODYのcanonical padding(natural px)。SVG Scene Rendererは
		// このnatural値をそのままSVG座標として使う(<svg viewBox>がnatural座標系のため、
		// renderScaleを掛ける必要が無い)。旧HTML/CSS実装では画面px固定の`padding: 1px 6px`を
		// HTML/CSSに直接書いており、font-sizeだけが表示倍率で縮小される一方でpaddingは
		// 縮小されず、相似性が壊れていた。
		var LABEL_PADDING_X = 6;
		var LABEL_PADDING_Y = 1;

		// Label BODYのcanonical font設定。テーマ・WordPress管理画面からの継承に依存すると
		// Static Preview/Fullscreen Editor/Frontendで文字幅(=Label BODYのnatural size)が
		// 変わってしまうため、プラグイン側で固定する。font-familyは特定の
		// Webフォントに依存しない、OS標準UIフォントのsystem font stack(admin/frontendの
		// どちらでも追加リクエスト無しに解決できる安全な値)。
		var LABEL_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
		var LABEL_FONT_WEIGHT = 'normal';
		var LABEL_FONT_STYLE = 'normal';
		var LABEL_LETTER_SPACING = 'normal';
		var LABEL_LINE_HEIGHT = 1.4;
		var LABEL_WHITE_SPACE = 'nowrap';

		// Popoverのcanonical gap・padding(natural px)。旧Popover Tail実装では
		// gap=10px・padding=10px 12pxを画面px固定のまま使っていたが、Labelと
		// 同じ理由でcanonical化)。
		var POPOVER_GAP = 10;
		var POPOVER_PADDING_X = 12;
		var POPOVER_PADDING_Y = 10;
		// PC Popover本文の最大幅。本文領域
		// (padding除く)の最大幅であり、Popover外形全体の幅ではない。
		//
		// 当初は固定260 natural pxとして実装したが、実WordPress環境での
		// 受入確認で「popoverFontSizeを大きく(例: 38)設定すると、日本語が約6文字ごとに
		// 強制折り返しされる」回帰が見つかった。原因は次の通り: natural座標系では
		// Camera(zoom)がPopover本文とfont-sizeを常に同じ比率で一緒に拡縮するため、
		// 「本文の最大幅」と「font-size」がどちらも固定のnatural px同士だと、
		// 1行に入る文字数(=maxWidth/fontSize相当)がfont-sizeにだけ依存して決まって
		// しまい、fontSizeを大きくするほど極端に少ない文字数で折り返される
		// (旧CSS実装のmax-width: 260pxは画面px固定・font-sizeだけがnatural×比率で
		// 縮小される非対称な設計だったため、この問題が起きなかった)。
		// 「260」という数値そのものを維持するのではなく、「旧デフォルト値
		// (popoverFontSize=12、260 natural px)における1行の文字数相当」を
		// font-size比の定数として持ち直すことで、natural座標のみで一貫した
		// (Cameraのzoomに依存しない)寸法契約にする。実際の最大幅は
		// POPOVER_MAX_BODY_WIDTH_EM * (そのPopoverのfontSize) で求める
		// (scene-runtime.jsのresolvePopover参照。Scene内で利用可能な幅による
		// 追加のclampも従来どおり行う)。
		var POPOVER_MAX_BODY_WIDTH_EM = 260 / 12;
		// popoverTextColor(保存値)が空文字(''=未設定)の場合のfallback色。
		// Theme文字色を継承しない。明示設定された色は常にそのまま使う(このfallbackは
		// 未設定時のみ適用される)。
		var POPOVER_TEXT_COLOR_FALLBACK = '#1e1e1e';
		// popoverBackgroundColor(保存値)が空文字(''=未設定)の場合のfallback色。旧CSSの
		// background: var(--ipb-popover-bg-color, #fff)(style.css)と同じ既定値
		// (テーマ継承ではなく元から固定の白fallbackだったため、textColorと違って
		// 今回変更する仕様ではない)。
		var POPOVER_BACKGROUND_COLOR_FALLBACK = '#ffffff';
		// PC Popover自身のBODY枠線・影(旧CSSの border: 1px solid #ddd; box-shadow: 0 2px
		// 10px rgba(0,0,0,0.15)。popoverStrokeColor/Width(文字の-webkit-text-stroke専用)
		// とは無関係の、常に固定・ユーザー設定不可のUI装飾。吹き出しON/OFFのいずれでも
		// 同じ値を使う(旧実装がspeechBubble ON時にgetComputedStyle()で読んで背景SVGへ
		// 転写していたのと同じ値を、そのまま固定値化した。view.js updateOpenPopoverGeometry
		// 参照)。
					var POPOVER_BORDER_COLOR = '#dddddd';
			var POPOVER_BORDER_WIDTH = 1;
			var POPOVER_SHADOW_OFFSET_Y = 2;
			var POPOVER_SHADOW_BLUR = 10;
			var POPOVER_SHADOW_COLOR = '#000000';
			var POPOVER_SHADOW_OPACITY = 0.15;
			var POPOVER_FONT_FAMILY = LABEL_FONT_FAMILY;
		var POPOVER_FONT_WEIGHT = 'normal';
		var POPOVER_FONT_STYLE = 'normal';
		var POPOVER_LETTER_SPACING = 'normal';
		var POPOVER_LINE_HEIGHT = 1.6;

		// マーカー画像の表示幅は、本体画像(imageWidth)に対してこの割合を上限とする。
		// image-pin-block.php側の$marker_max_width_ratioと必ず一致させること
		// (PHPはこのJSファイルを読めないため、値の一致は手動で保つ)。
		var MARKER_MAX_WIDTH_RATIO = 0.5;
			// Marker選択時のresize handle(Editor限定のinteraction-overlay装飾。natural単位。
			// 旧実装(screen px、8〜18px・displayWidthPx*0.4)をFit(natural=screen)時に
			// 完全に一致する値のまま、natural単位の固定値として再定義した。Camera/zoomには
			// 一切依存しない(29節: Geometry/Rendererはzoomを知らない)。
			var MARKER_RESIZE_HANDLE_RATIO = 0.4;
			var MARKER_RESIZE_HANDLE_MIN = 8;
			var MARKER_RESIZE_HANDLE_MAX = 18;

		// 吹き出し先端(tail)のcanonical サイズ(natural px)。
		// 付け根幅(TAIL_WIDTH)・突出量(TAIL_HEIGHT)。
		var TAIL_WIDTH = 20;
		var TAIL_HEIGHT = 14;

		// 先端サイズ3段階(small/medium/large)の倍率。mediumは従来の見た目(TAIL_WIDTH/HEIGHTそのまま)。
		var TAIL_SIZE_SCALES = { small: 0.6, medium: 1, large: 1.6 };
		var TAIL_SIZE_DEFAULT = 'medium';

		// Label/Popover共通の先端寸法(付け根幅・突出量)を決める唯一の関数。
		function resolveTailDimensions( tailSize ) {
			var scale = TAIL_SIZE_SCALES.hasOwnProperty( tailSize ) ? TAIL_SIZE_SCALES[ tailSize ] : TAIL_SIZE_SCALES[ TAIL_SIZE_DEFAULT ];
			return { width: TAIL_WIDTH * scale, height: TAIL_HEIGHT * scale };
		}

		function clampToRange( n, min, max ) {
			return Math.min( max, Math.max( min, n ) );
		}

		function clampPercent( n ) {
			return clampToRange( n, 0, 100 );
		}

		// ─── Pin/Marker中心・寸法(canonical、natural単位) ───

		// pin.x/pin.y(0〜100の%属性。保存データの唯一の正)から、natural image
		// coordinate上のPin中心を求める。DOMの実測(getBoundingClientRect()等)は
		// 一切使わない。以前はEditor Static Preview/Fullscreen Editorが、
		// 表示用に描画されたPin/Marker本体の外側button/divをDOMで実測し、そこから
		// 逆算していたため、外側要素のスタイル・選択枠・resize handle等の影響を受けて
		// 表示環境ごとに結果が食い違っていた)。
		function computePinCenter( imageWidth, imageHeight, pinXPercent, pinYPercent ) {
			return {
				x: imageWidth * ( clampPercent( pinXPercent ) / 100 ),
				y: imageHeight * ( clampPercent( pinYPercent ) / 100 )
			};
		}

		// 画像マーカーのnatural表示サイズ(width/height、natural px)を、マーカー画像
		// 自身の実寸(naturalImgWidth/naturalImgHeight。img.naturalWidth/naturalHeightの
		// ような、表示スケールに一切依存しない「画像ファイル自身の実寸」)・markerScale
		// (%)・本体画像のimageWidth・MARKER_MAX_WIDTH_RATIOから求める。
		// idealWidth = naturalImgWidth * markerScale / 100
		// maxWidth   = imageWidth * maxWidthRatio
		// width      = min(idealWidth, maxWidth)
		// height     = width * naturalImgHeight / naturalImgWidth(アスペクト比維持)
		// naturalImgWidthがまだ判明していない(画像読み込み前)場合は{width:0, height:0}を
		// 返す(呼び出し側はこれを「geometry未確定」として扱うこと)。
		function computeMarkerNaturalSize( naturalImgWidth, naturalImgHeight, markerScale, imageWidth, maxWidthRatio ) {
			if ( ! naturalImgWidth || naturalImgWidth <= 0 ) {
				return { width: 0, height: 0 };
			}
			var ratio = ( 'number' === typeof maxWidthRatio ) ? maxWidthRatio : MARKER_MAX_WIDTH_RATIO;
			var idealWidth = naturalImgWidth * ( markerScale / 100 );
			var maxWidth = ( imageWidth > 0 ) ? ( imageWidth * ratio ) : idealWidth;
			var width = Math.min( idealWidth, maxWidth );
			var height = width * ( ( naturalImgHeight || 0 ) / naturalImgWidth );
			return { width: width, height: height };
		}

		// ─── Label位置(角丸矩形経路上の位置)用の純粋なジオメトリ計算 ───
		// Pin/Markerの周囲を「辺」「角」で場合分けしない、連続した軌道上の位置として扱う。
		// Label寸法を安全矩形に含める確定済みのアルゴリズム
		// (docs/DATA_LAYOUT.md「Label位置」参照)。editor.js/view.jsに複製されていた
		// 実装をこのファイルへ統合し、natural単位専用の
		// pure functionとして固定した(renderScaleはここへ一切入れないこと)。

		// labelPositionRaw: 保存属性(0以上1未満の連続値。無効/未設定ならNaN等)。
		// hasMarker: 画像マーカーかどうか(fallback方向判定に使う。丸マーカーは右、
		// 画像マーカーは下)。
		function resolveLabelPosition( labelPositionRaw, hasMarker ) {
			if ( 'number' === typeof labelPositionRaw && isFinite( labelPositionRaw ) ) {
				var t = labelPositionRaw % 1;
				if ( t < 0 ) {
					t += 1;
				}
				return t;
			}
			return hasMarker ? LABEL_POSITION_FALLBACK_MARKER : LABEL_POSITION_FALLBACK_ROUND;
		}

		// 原点中心・半径(halfWidth, halfHeight)の軸並行矩形を、半径radiusの円で外側へ
		// 丸めた形の符号付き距離関数(signed distance function)。0が境界、負が内側、
		// 正が外側。
		function roundedBoxSdf( x, y, halfWidth, halfHeight, radius ) {
			var qx = Math.abs( x ) - halfWidth;
			var qy = Math.abs( y ) - halfHeight;
			var ox = Math.max( qx, 0 );
			var oy = Math.max( qy, 0 );
			return Math.sqrt( ox * ox + oy * oy ) + Math.min( Math.max( qx, qy ), 0 ) - radius;
		}

		// 原点(Pin/Marker中心)からangle方向へ伸ばしたrayが、上記のrounded-box境界と
		// 交わる距離を二分探索で求める(30回反復。範囲/2^30の精度)。
		function findRoundedBoxRayDistance( angle, safeHalfX, safeHalfY, radius ) {
			var dx = Math.cos( angle );
			var dy = Math.sin( angle );
			var lo = 0;
			var hi = safeHalfX + safeHalfY + radius + 1;
			for ( var i = 0; i < 30; i++ ) {
				var mid = ( lo + hi ) / 2;
				var d = roundedBoxSdf( dx * mid, dy * mid, safeHalfX, safeHalfY, radius );
				if ( d < 0 ) {
					lo = mid;
				} else {
					hi = mid;
				}
			}
			return ( lo + hi ) / 2;
		}

		// targetWidth/targetHeight(Pin/Markerのnatural矩形)とlabelSize.width/height
		// (Label BODYのnatural size)から、Label中心の「Pin/Marker中心からのオフセット」
		// (natural単位)を求める。LABEL_GAP・corner radiusもnatural単位固定値として扱い、
		// renderScaleは一切関与させない(renderScale invariance の核心部分)。
		function calculateLabelOffset( targetWidth, targetHeight, labelPosition, labelSize ) {
			var angle = labelPosition * Math.PI * 2;
			var safeHalfX = targetWidth / 2 + labelSize.width / 2 + LABEL_GAP;
			var safeHalfY = targetHeight / 2 + labelSize.height / 2 + LABEL_GAP;
			var cornerRadius = clampToRange( labelSize.height * LABEL_SAFE_CORNER_RADIUS_RATIO, LABEL_SAFE_CORNER_RADIUS_MIN, LABEL_SAFE_CORNER_RADIUS_MAX );
			var distance = findRoundedBoxRayDistance( angle, safeHalfX, safeHalfY, cornerRadius );
			return { x: Math.cos( angle ) * distance, y: Math.sin( angle ) * distance };
		}

		// pinRect: {centerX, centerY, width, height}(natural単位)。labelSize:
		// {width, height}(natural単位、Label BODYの実サイズ)。labelPositionRaw/
		// hasMarkerはresolveLabelPosition()と同じ。戻り値{x, y, t}もnatural単位
		// (x/y=Label中心のnatural座標、t=解決済みlabelPosition)。
		function computeLabelCenter( labelPositionRaw, hasMarker, pinRect, labelSize ) {
			var t = resolveLabelPosition( labelPositionRaw, hasMarker );
			var offset = calculateLabelOffset( pinRect.width, pinRect.height, t, labelSize );
			return { x: pinRect.centerX + offset.x, y: pinRect.centerY + offset.y, t: t };
		}

		// ─── 吹き出し先端(tail)の方向計算・本体+先端の合体多角形(natural単位) ───
		// LabelはPin/Markerの周囲を360°連続で移動できるため、先端は固定4方向ではなく、
		// 「対象(Label/Popover)自身の中心 → Pin/Marker中心」という実際の位置関係から
		// 都度atan2()で角度を求める。対象自身の矩形は角丸を持つが、先端自体は小さいため、
		// 角丸を無視した矩形近似で十分な精度とする(Label位置計算のような角丸SDFは
		// 使わない。あちらはPin/Markerと自分自身の寸法を合成した「安全矩形」を扱う
		// 別の問題であり、ここでは自分自身の矩形と対象の中心点だけを使う単純な問題)。
		//
		// elCenter: 対象(Label/Popover)自身の中心。elHalfWidth/elHalfHeight: 対象自身の
		// 半幅・半高さ。targetCenter: 先端が向くべきPin/Marker中心。tailWidth/tailHeight:
		// 先端(三角形)自身のサイズ(底辺幅/突出量)。すべてnatural単位。elCenterと
		// targetCenterが完全に一致する場合はnullを返す(方向が定義できないため)。
		function computeTailPlacement( elCenter, elHalfWidth, elHalfHeight, targetCenter, tailWidth, tailHeight ) {
			var dx = targetCenter.x - elCenter.x;
			var dy = targetCenter.y - elCenter.y;
			if ( 0 === dx && 0 === dy ) {
				return null;
			}
			var angle = Math.atan2( dy, dx );
			var cos = Math.cos( angle );
			var sin = Math.sin( angle );
			var tx = ( 0 !== cos ) ? Math.abs( elHalfWidth / cos ) : Infinity;
			var ty = ( 0 !== sin ) ? Math.abs( elHalfHeight / sin ) : Infinity;
			var t = Math.min( tx, ty );
			var boundaryX = elCenter.x + cos * t;
			var boundaryY = elCenter.y + sin * t;
			return {
				left: boundaryX - tailWidth / 2,
				top: boundaryY,
				width: tailWidth,
				height: tailHeight,
				rotateDeg: ( angle * 180 / Math.PI ) - 90
			};
		}

		// 本体(Label/Popover)+吹き出し先端を「1枚の多角形」として組み立てる
		// (半透明背景の重なりによるAlpha二重化・独立図形間の継ぎ目を、
		// 1回の塗りで根本的に避けるための方式。詳細はdocs/DATA_LAYOUT.md参照)。
		// すべてnatural単位。呼び出し側(adapter)は、戻り値のpoints/bboxLeft等を
		// 描画直前に renderScale倍してから使うこと(このファイル自身はrenderScaleに
		// 一切関知しない)。
		function buildSpeechBubblePolygon( elHalfWidth, elHalfHeight, targetCenterLocal, tailBaseHalfWidth, tailHeight ) {
			var placement = computeTailPlacement( { x: 0, y: 0 }, elHalfWidth, elHalfHeight, targetCenterLocal, tailBaseHalfWidth, tailHeight );
			if ( ! placement ) {
				return null;
			}
			var boundaryX = placement.left + placement.width / 2;
			var boundaryY = placement.top;
			var angle = ( placement.rotateDeg + 90 ) * Math.PI / 180;
			var cos = Math.cos( angle );
			var sin = Math.sin( angle );
			var tx = ( 0 !== cos ) ? Math.abs( elHalfWidth / cos ) : Infinity;
			var ty = ( 0 !== sin ) ? Math.abs( elHalfHeight / sin ) : Infinity;
			var onVerticalEdge = tx < ty;

			var apexX = boundaryX + cos * tailHeight;
			var apexY = boundaryY + sin * tailHeight;

			var left = -elHalfWidth;
			var right = elHalfWidth;
			var top = -elHalfHeight;
			var bottom = elHalfHeight;

			var points;
			if ( onVerticalEdge ) {
				var baseTop = clampToRange( boundaryY - tailBaseHalfWidth, top, bottom );
				var baseBottom = clampToRange( boundaryY + tailBaseHalfWidth, top, bottom );
				points = ( boundaryX > 0 )
					? [ [ left, top ], [ right, top ], [ right, baseTop ], [ apexX, apexY ], [ right, baseBottom ], [ right, bottom ], [ left, bottom ] ]
					: [ [ left, top ], [ right, top ], [ right, bottom ], [ left, bottom ], [ left, baseBottom ], [ apexX, apexY ], [ left, baseTop ] ];
			} else {
				var baseLeft = clampToRange( boundaryX - tailBaseHalfWidth, left, right );
				var baseRight = clampToRange( boundaryX + tailBaseHalfWidth, left, right );
				points = ( boundaryY > 0 )
					? [ [ left, top ], [ right, top ], [ right, bottom ], [ baseRight, bottom ], [ apexX, apexY ], [ baseLeft, bottom ], [ left, bottom ] ]
					: [ [ left, bottom ], [ left, top ], [ baseLeft, top ], [ apexX, apexY ], [ baseRight, top ], [ right, top ], [ right, bottom ] ];
			}

			var bboxLeft = Math.min( left, apexX );
			var bboxRight = Math.max( right, apexX );
			var bboxTop = Math.min( top, apexY );
			var bboxBottom = Math.max( bottom, apexY );

			return {
				bboxLeft: bboxLeft,
				bboxTop: bboxTop,
				bboxWidth: bboxRight - bboxLeft,
				bboxHeight: bboxBottom - bboxTop,
				// points: elCenter(0,0)を基準にした生の頂点配列(natural単位)。
				points: points,
				// pointsAttr: bbox左上を原点にオフセットした、SVGの<polygon points="...">
				// へそのまま渡せる文字列(natural単位のまま。SVG自身の
				// viewBoxがnatural座標系のため、呼び出し側でのscreen変換は不要)。
				pointsAttr: points.map( function( p ) {
					return ( p[ 0 ] - bboxLeft ) + ',' + ( p[ 1 ] - bboxTop );
				} ).join( ' ' )
			};
		}

		// ─── Marker drag/resize制約(natural単位) ───
		// Astra SVG Scene Renderer移行により、Editor Controllerの操作制約計算も
		// DOM実測(getBoundingClientRect()の差分)からnatural座標のpure functionへ
		// 統一する。挙動(意味)自体は旧DOM実測版と同じ: 「開始時の解決済み幅」+
		// 「Scene座標上の横方向Pointer移動量」→ 制約 → markerScaleへ戻す、という
		// 操作意味は変更しない(29節)。

		// Marker(中心center、natural width/height)が本体画像[0,imageWidth]×
		// [0,imageHeight]の内側に収まるための、中心のみの許容範囲を返す。
		// Marker移動(ドラッグ)時のcontainmentに使う。Markerが画像より大きい場合は
		// 中央寄せ(min>maxになる軸はimageの中心1点にフォールバック)。
		function computeMarkerDragContainment( imageWidth, imageHeight, markerWidth, markerHeight ) {
			var halfW = markerWidth / 2;
			var halfH = markerHeight / 2;
			var minCx = halfW;
			var maxCx = imageWidth - halfW;
			var minCy = halfH;
			var maxCy = imageHeight - halfH;
			if ( minCx > maxCx ) {
				minCx = maxCx = imageWidth / 2;
			}
			if ( minCy > maxCy ) {
				minCy = maxCy = imageHeight / 2;
			}
			return { minCx: minCx, maxCx: maxCx, minCy: minCy, maxCy: maxCy };
		}

		// pinCenter(natural、固定。resizeでは中心は動かない)を軸に拡大縮小する
		// Markerが本体画像の内側に収まるための、natural表示幅の上限を返す
		// (アスペクト比aspectRatio = naturalImgWidth/naturalImgHeightを保ったまま
		// 拡大した場合に、四辺のうち最も厳しい制約)。呼び出し側は
		// Math.min(この戻り値, imageWidth*maxWidthRatio)をさらに適用すること
		// (画像幅50%上限は別の制約であり、この関数はcontainmentだけを担当する)。
		function computeMarkerResizeMaxWidth( imageWidth, imageHeight, pinCenter, aspectRatio ) {
			if ( ! aspectRatio || aspectRatio <= 0 ) {
				return 0;
			}
			var maxWidthFromLeft = 2 * pinCenter.x;
			var maxWidthFromRight = 2 * ( imageWidth - pinCenter.x );
			var maxWidthFromTop = 2 * pinCenter.y * aspectRatio;
			var maxWidthFromBottom = 2 * ( imageHeight - pinCenter.y ) * aspectRatio;
			return Math.max( 0, Math.min( maxWidthFromLeft, maxWidthFromRight, maxWidthFromTop, maxWidthFromBottom ) );
		}

		// ─── Popover高さ・縦scroll(natural単位) ───
		// 本文が画像高に収まる場合は内容由来の自然高を保つ。長文時だけ外形を
		// 画像高で頭打ちにし、本文全高と実際に見える本文領域との差をscroll量とする。
		// imageHeightが未確定(0以下)の場合は、従来どおり自然高へフォールバックする。
		function computePopoverVerticalMetrics( bodyHeight, imageHeight ) {
			var normalizedBodyHeight = Math.max( 0, bodyHeight || 0 );
			var chromeHeight = POPOVER_PADDING_Y * 2 + POPOVER_BORDER_WIDTH * 2;
			var naturalOuterHeight = normalizedBodyHeight + chromeHeight;
			var outerHeight = ( imageHeight > 0 ) ? Math.min( naturalOuterHeight, imageHeight ) : naturalOuterHeight;
			var visibleBodyHeight = Math.max( 0, outerHeight - chromeHeight );

			return {
				outerHeight: outerHeight,
				visibleBodyHeight: visibleBodyHeight,
				scrollMaxOffset: Math.max( 0, normalizedBodyHeight - visibleBodyHeight )
			};
		}

		// ─── Popover配置(natural単位) ───
		// まずPin右側→入らなければ左側→左右とも不足なら画像内へclamp。縦方向はPin
		// 中央付近→上下からはみ出す場合はclamp、という既存ルール(Editor/Frontend
		// 共通)をpure functionとして1か所にまとめる。
		// wrapperWidth/wrapperHeight: はみ出し判定に使う領域のnatural width/height
		// (呼び出し側は画像のnatural imageWidth/imageHeightを渡すこと)。
		// pinRect: {centerX, centerY, width, height}(natural単位、Pin/Marker中心+
		// 半幅を使ってPopoverが自然に隣接配置されるようにする)。
		// popoverSize: {width, height}(natural単位、Popover BODYの実サイズ)。
		// gap: natural px(省略時はPOPOVER_GAP)。戻り値{left, top}はPopover BODYの
		// 左上のnatural座標。
		function computePopoverPlacement( wrapperWidth, wrapperHeight, pinRect, popoverSize, gap ) {
			var g = ( 'number' === typeof gap ) ? gap : POPOVER_GAP;
			var popW = popoverSize.width;
			var popH = popoverSize.height;
			var pinHalfW = pinRect.width / 2;

			var left = pinRect.centerX + pinHalfW + g;
			var top = pinRect.centerY - popH / 2;

			if ( left + popW > wrapperWidth ) {
				left = pinRect.centerX - pinHalfW - g - popW;
			}
			if ( left < 0 ) {
				left = Math.max( 0, Math.min( pinRect.centerX, wrapperWidth - popW ) );
			}
			if ( top < 0 ) {
				top = 0;
			}
			if ( top + popH > wrapperHeight ) {
				top = Math.max( 0, wrapperHeight - popH );
			}

			return { left: left, top: top };
		}

		return {
			// 定数(値そのものが必要な呼び出し側 - 例: inline styleのpadding計算 - 用)。
			LABEL_GAP: LABEL_GAP,
			LABEL_SAFE_CORNER_RADIUS_RATIO: LABEL_SAFE_CORNER_RADIUS_RATIO,
			LABEL_SAFE_CORNER_RADIUS_MIN: LABEL_SAFE_CORNER_RADIUS_MIN,
			LABEL_SAFE_CORNER_RADIUS_MAX: LABEL_SAFE_CORNER_RADIUS_MAX,
			LABEL_POSITION_FALLBACK_ROUND: LABEL_POSITION_FALLBACK_ROUND,
			LABEL_POSITION_FALLBACK_MARKER: LABEL_POSITION_FALLBACK_MARKER,
			LABEL_PADDING_X: LABEL_PADDING_X,
			LABEL_PADDING_Y: LABEL_PADDING_Y,
			LABEL_FONT_FAMILY: LABEL_FONT_FAMILY,
			LABEL_FONT_WEIGHT: LABEL_FONT_WEIGHT,
			LABEL_FONT_STYLE: LABEL_FONT_STYLE,
			LABEL_LETTER_SPACING: LABEL_LETTER_SPACING,
			LABEL_LINE_HEIGHT: LABEL_LINE_HEIGHT,
			LABEL_WHITE_SPACE: LABEL_WHITE_SPACE,
			POPOVER_GAP: POPOVER_GAP,
			POPOVER_PADDING_X: POPOVER_PADDING_X,
			POPOVER_PADDING_Y: POPOVER_PADDING_Y,
			POPOVER_MAX_BODY_WIDTH_EM: POPOVER_MAX_BODY_WIDTH_EM,
			POPOVER_TEXT_COLOR_FALLBACK: POPOVER_TEXT_COLOR_FALLBACK,
			POPOVER_BACKGROUND_COLOR_FALLBACK: POPOVER_BACKGROUND_COLOR_FALLBACK,
			POPOVER_BORDER_COLOR: POPOVER_BORDER_COLOR,
			POPOVER_BORDER_WIDTH: POPOVER_BORDER_WIDTH,
			POPOVER_SHADOW_OFFSET_Y: POPOVER_SHADOW_OFFSET_Y,
			POPOVER_SHADOW_BLUR: POPOVER_SHADOW_BLUR,
			POPOVER_SHADOW_COLOR: POPOVER_SHADOW_COLOR,
			POPOVER_SHADOW_OPACITY: POPOVER_SHADOW_OPACITY,
			POPOVER_FONT_FAMILY: POPOVER_FONT_FAMILY,
			POPOVER_FONT_WEIGHT: POPOVER_FONT_WEIGHT,
			POPOVER_FONT_STYLE: POPOVER_FONT_STYLE,
			POPOVER_LETTER_SPACING: POPOVER_LETTER_SPACING,
			POPOVER_LINE_HEIGHT: POPOVER_LINE_HEIGHT,
			MARKER_MAX_WIDTH_RATIO: MARKER_MAX_WIDTH_RATIO,
			MARKER_RESIZE_HANDLE_RATIO: MARKER_RESIZE_HANDLE_RATIO,
			MARKER_RESIZE_HANDLE_MIN: MARKER_RESIZE_HANDLE_MIN,
			MARKER_RESIZE_HANDLE_MAX: MARKER_RESIZE_HANDLE_MAX,
			TAIL_WIDTH: TAIL_WIDTH,
			TAIL_HEIGHT: TAIL_HEIGHT,
			TAIL_SIZE_SCALES: TAIL_SIZE_SCALES,
			TAIL_SIZE_DEFAULT: TAIL_SIZE_DEFAULT,
			resolveTailDimensions: resolveTailDimensions,

			// 関数。
			clampToRange: clampToRange,
			clampPercent: clampPercent,
			computePinCenter: computePinCenter,
			computeMarkerNaturalSize: computeMarkerNaturalSize,
			computeMarkerDragContainment: computeMarkerDragContainment,
			computeMarkerResizeMaxWidth: computeMarkerResizeMaxWidth,
			resolveLabelPosition: resolveLabelPosition,
			roundedBoxSdf: roundedBoxSdf,
			findRoundedBoxRayDistance: findRoundedBoxRayDistance,
			calculateLabelOffset: calculateLabelOffset,
			computeLabelCenter: computeLabelCenter,
			computeTailPlacement: computeTailPlacement,
			buildSpeechBubblePolygon: buildSpeechBubblePolygon,
			computePopoverVerticalMetrics: computePopoverVerticalMetrics,
			computePopoverPlacement: computePopoverPlacement
		};
	}
);
