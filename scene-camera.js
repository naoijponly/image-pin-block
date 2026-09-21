/**
 * Image Pin Block — 共通Camera(Viewport/viewBox/Fit/Zoom/Pan/座標変換)
 * モジュール。
 *
 * SVG Scene RendererはMain ImageもPin/Label/Popoverと同じnatural座標系
 * (<svg viewBox="0 0 imageWidth imageHeight">)へ入れるため、「画面へ収める」
 * (Fit)自体はブラウザ側のviewBox+CSSサイズ指定で自動的に行われる
 * (Geometry/Text/Rendererは一切Zoomを知らない。30節)。このモジュールが担当するのは、
 * Fit状態からさらにZoom/Panしたい場合(Fullscreen Editor・Frontend Lightbox)の
 * viewBox計算と、client座標→Scene(natural)座標の変換だけ。
 *
 * ─── Camera state ───
 * { zoomPercent(100=Fit。100以上のみ), centerX, centerY(natural座標。表示の
 *   中心にしたい点) }。zoomPercent=100のときは常にcenterX/Yをnatural画像の
 *   中心へ強制する(Fit状態ではPan不可。旧実装のPan=0リセットと同じ意味)。
 */
( function( root, factory ) {
	'use strict';
	var api = factory();
	if ( 'undefined' !== typeof module && module.exports ) {
		module.exports = api;
	}
	if ( root ) {
		root.ImagePinBlockSceneCamera = api;
	}
} )(
	( 'undefined' !== typeof window ) ? window : ( ( 'undefined' !== typeof global ) ? global : null ),
	function() {
		'use strict';

		function clamp( n, min, max ) {
			return Math.min( max, Math.max( min, n ) );
		}

		// naturalWidth/Height: 画像のnatural座標系全体のサイズ。zoomPercent: 100が
		// Fit(=viewBox全体)、100超で拡大(viewBoxを縮小)。centerX/centerY: 表示の
		// 中心にしたいnatural座標(zoomPercent<=100のときは常に画像中心へ強制)。
		// 戻り値はSVGのviewBox属性へそのまま使える{minX, minY, width, height}。
		function getViewBox( naturalWidth, naturalHeight, zoomPercent, centerX, centerY ) {
			if ( naturalWidth <= 0 || naturalHeight <= 0 ) {
				return { minX: 0, minY: 0, width: naturalWidth || 1, height: naturalHeight || 1 };
			}
			var zoom = Math.max( 100, zoomPercent || 100 ) / 100;
			var vw = naturalWidth / zoom;
			var vh = naturalHeight / zoom;
			var cx = ( zoom <= 1 ) ? naturalWidth / 2 : ( ( 'number' === typeof centerX ) ? centerX : naturalWidth / 2 );
			var cy = ( zoom <= 1 ) ? naturalHeight / 2 : ( ( 'number' === typeof centerY ) ? centerY : naturalHeight / 2 );
			var minX = clamp( cx - vw / 2, 0, Math.max( 0, naturalWidth - vw ) );
			var minY = clamp( cy - vh / 2, 0, Math.max( 0, naturalHeight - vh ) );
			return { minX: minX, minY: minY, width: vw, height: vh };
		}

		function viewBoxToAttr( viewBox ) {
			return viewBox.minX + ' ' + viewBox.minY + ' ' + viewBox.width + ' ' + viewBox.height;
		}

		// 現在のCamera stateから、次のzoomPercentへ変更する。anchor(natural座標。
		// 省略時は現在の中心)がそのまま画面上の同じ位置に留まるよう、中心を
		// 再計算する(旧実装のsetRatio()と同じ考え方。ただし旧実装はpx pan、
		// 今回はnatural座標の中心で表現するため、clamp計算がより単純になる)。
		function zoomAt( naturalWidth, naturalHeight, camera, nextZoomPercent, anchorX, anchorY, minZoom, maxZoom ) {
			var clampedZoom = clamp( nextZoomPercent, minZoom || 100, maxZoom || 100 );
			var currentBox = getViewBox( naturalWidth, naturalHeight, camera.zoomPercent, camera.centerX, camera.centerY );
			var ax = ( 'number' === typeof anchorX ) ? anchorX : ( currentBox.minX + currentBox.width / 2 );
			var ay = ( 'number' === typeof anchorY ) ? anchorY : ( currentBox.minY + currentBox.height / 2 );
			if ( clampedZoom <= 100 ) {
				return { zoomPercent: 100, centerX: naturalWidth / 2, centerY: naturalHeight / 2 };
			}
			// anchor点を固定した拡縮: 新しい中心は、anchorから見た現在の中心への
			// ベクトルを、倍率の変化分だけ縮小/拡大した位置。
			var scaleChange = camera.zoomPercent ? ( camera.zoomPercent / clampedZoom ) : ( 100 / clampedZoom );
			var curCenterX = currentBox.minX + currentBox.width / 2;
			var curCenterY = currentBox.minY + currentBox.height / 2;
			var nextCenterX = ax + ( curCenterX - ax ) * scaleChange;
			var nextCenterY = ay + ( curCenterY - ay ) * scaleChange;
			return { zoomPercent: clampedZoom, centerX: nextCenterX, centerY: nextCenterY };
		}

		// 現在のCamera stateへ、natural座標のPan量(dx, dy)を加える(旧実装のpx pan
		// ドラッグと同じ操作感を、natural座標の中心移動として表現する)。画像外へ
		// 出ないよう、getViewBox()と同じclamp規則を再適用する。
		function panBy( naturalWidth, naturalHeight, camera, dxNatural, dyNatural ) {
			if ( camera.zoomPercent <= 100 ) {
				return { zoomPercent: 100, centerX: naturalWidth / 2, centerY: naturalHeight / 2 };
			}
			var nextCenterX = camera.centerX + dxNatural;
			var nextCenterY = camera.centerY + dyNatural;
			var box = getViewBox( naturalWidth, naturalHeight, camera.zoomPercent, nextCenterX, nextCenterY );
			return {
				zoomPercent: camera.zoomPercent,
				centerX: box.minX + box.width / 2,
				centerY: box.minY + box.height / 2
			};
		}

		// client座標(ブラウザのビューポート基準px。マウス/タッチイベントの
		// clientX/clientY)を、svgEl自身のSVG座標系(natural座標)へ変換する
		// (27節・16節: 共通API。Preview用/Fullscreen用の別座標式を持たない)。
		// getScreenCTM()が取得できない場合(未接続・display:none等)はnullを返す。
		function clientToScene( svgEl, clientX, clientY ) {
			if ( ! svgEl || 'function' !== typeof svgEl.getScreenCTM ) {
				return null;
			}
			var ctm = svgEl.getScreenCTM();
			if ( ! ctm ) {
				return null;
			}
			var inverse = ctm.inverse();
			if ( svgEl.createSVGPoint ) {
				var pt = svgEl.createSVGPoint();
				pt.x = clientX;
				pt.y = clientY;
				var transformed = pt.matrixTransform( inverse );
				return { x: transformed.x, y: transformed.y };
			}
			if ( 'undefined' !== typeof DOMPoint ) {
				var dp = new DOMPoint( clientX, clientY ).matrixTransform( inverse );
				return { x: dp.x, y: dp.y };
			}
			return null;
		}

		return {
			getViewBox: getViewBox,
			viewBoxToAttr: viewBoxToAttr,
			zoomAt: zoomAt,
			panBy: panBy,
			clientToScene: clientToScene
		};
	}
);
