/**
 * Image Pin Block — 唯一のPNG書き出しpipeline。
 *
 * 旧実装が持っていたPNG専用のCanvas描画コード(Pin/Marker/Label/Bubbleを
 * fillText/measureText/arc等で個別に再描画する経路)は完全に廃止し、
 * 「確定したAttributesスナップショット→共通pipelineでResolvedSceneを作る→
 * Popover/Editor overlay OFFのまま同じSvgRendererへ渡す→そのSVGを丸ごと1回
 * drawImage()する」という、Scene・Frontend・Lightboxと完全に同じ経路を使う
 * (37節)。この経路以外でCanvas 2Dへ何かを描く処理は、このファイルに一切
 * 存在しない(fillText/measureText/arc等は使わない)。
 *
 * ─── 自己完結化(CORS) ───
 * 元画像・各Marker画像は、実際にbytesを取得できたものだけをdata URLへ変換して
 * SVG文字列へ埋め込む(scene-assets.jsのfetchAsDataUrl()。取得できない
 * (CORS拒否・404等)場合は、勝手なproxy追加等は一切行わず、明示的な
 * exportエラーとしてPromiseをrejectする)。
 */
( function( root, factory ) {
	'use strict';
	var isNode = ( 'undefined' !== typeof module && module.exports );
	function dep( name, globalName ) {
		return isNode ? require( './' + name ) : ( root && root[ globalName ] );
	}
	var SceneAssets = dep( 'scene-assets.js', 'ImagePinBlockSceneAssets' );
	var SceneRuntime = dep( 'scene-runtime.js', 'ImagePinBlockSceneRuntime' );
	var SvgRenderer = dep( 'svg-renderer.js', 'ImagePinBlockSvgRenderer' );
	var api = factory( SceneAssets, SceneRuntime, SvgRenderer );
	if ( isNode ) {
		module.exports = api;
	}
	if ( root ) {
		root.ImagePinBlockPngExport = api;
	}
} )(
	( 'undefined' !== typeof window ) ? window : ( ( 'undefined' !== typeof global ) ? global : null ),
	function( SceneAssets, SceneRuntime, SvgRenderer ) {
		'use strict';

		var SVG_NS = 'http://www.w3.org/2000/svg';
		var XLINK_NS = 'http://www.w3.org/1999/xlink';

		// Popover/選択/resize handle/focus ring/操作UI/Camera(letterbox・crop)/
		// スクロール状態/Mobile Panel/未確定ColorPicker previewは、PNGに含めない
		// (37節)。ResolvedScene自体はPopover OFFで作るため、popoverフィールドは
		// 常にnull(resolveSceneへ渡すrenderStateで強制する)。
		var EXPORT_RENDER_STATE = {
			selectedPinId: null,
			openPopoverPinId: null,
			editorOverlay: false,
			focusedPinId: null,
			popoverScrollOffset: 0
		};

		// resolvedSceneの中で使われている画像URL(Main Image + 重複を除いたMarker URL)を
		// すべて自己完結化(data URL化)した、新しいResolvedSceneを返す(浅いclone。
		// image/pins[].visual以外は参照を共有してよい)。1つでも取得に失敗した場合は
		// Promiseをrejectする(明示的なexportエラー。24節: 勝手なproxy追加はしない)。
		function embedAssets( resolvedScene ) {
			var urls = [];
			if ( resolvedScene.image.url && urls.indexOf( resolvedScene.image.url ) === -1 ) {
				urls.push( resolvedScene.image.url );
			}
			resolvedScene.pins.forEach( function( pin ) {
				if ( 'marker' === pin.visual.kind && urls.indexOf( pin.visual.url ) === -1 ) {
					urls.push( pin.visual.url );
				}
			} );
			return Promise.all( urls.map( function( url ) {
				return SceneAssets.fetchAsDataUrl( url ).then( function( dataUrl ) {
					return { url: url, dataUrl: dataUrl };
				} );
			} ) ).then( function( results ) {
				var map = {};
				results.forEach( function( r ) {
					map[ r.url ] = r.dataUrl;
				} );
				var embeddedImage = Object.assign( {}, resolvedScene.image, { url: map[ resolvedScene.image.url ] || resolvedScene.image.url } );
				var embeddedPins = resolvedScene.pins.map( function( pin ) {
					if ( 'marker' !== pin.visual.kind ) {
						return pin;
					}
					return Object.assign( {}, pin, { visual: Object.assign( {}, pin.visual, { url: map[ pin.visual.url ] || pin.visual.url } ) } );
				} );
				return Object.assign( {}, resolvedScene, { image: embeddedImage, pins: embeddedPins, popover: null } );
			} );
		}

		// resolvedScene(自己完結化済み)を、Popover/Editor overlay無しのSvgRendererへ
		// 一度だけ描画し、そのSVG要素自身(DOM)を返す(offscreenHostへmountしたまま。
		// 呼び出し側がdispose()すること)。
		function renderOffscreenSvg( ownerDocument, embeddedScene ) {
			var host = ownerDocument.createElement( 'div' );
			host.style.position = 'fixed';
			host.style.left = '-99999px';
			host.style.top = '0px';
			host.style.width = embeddedScene.image.width + 'px';
			host.style.height = embeddedScene.image.height + 'px';
			( ownerDocument.body || ownerDocument.documentElement ).appendChild( host );

			var scene = SvgRenderer.createScene( host, {} );
			scene.setModel( embeddedScene );
			scene.setViewBox( '0 0 ' + embeddedScene.image.width + ' ' + embeddedScene.image.height );
			var svgEl = scene.getSvgElement();

			return {
				svgEl: svgEl,
				dispose: function() {
					scene.dispose();
					if ( host.parentNode ) {
						host.parentNode.removeChild( host );
					}
				}
			};
		}

		// SVG要素をシリアライズし、data: URLとして<img>へ読み込んだ状態(実寸確定済み)の
		// imgを返す(scene-assets.jsのloadImage()相当のload優先ロジックを再利用したい
		// ところだが、SVGのxmlns等の前提が異なるため専用の軽量版を用意する)。
		function loadSvgAsImage( ownerDocument, svgEl, width, height ) {
			svgEl.setAttribute( 'xmlns', SVG_NS );
			svgEl.setAttributeNS( 'http://www.w3.org/2000/xmlns/', 'xmlns:xlink', XLINK_NS );
			var svgString = new XMLSerializer().serializeToString( svgEl );
			var svgBlob = new Blob( [ svgString ], { type: 'image/svg+xml;charset=utf-8' } );
			var blobUrl = URL.createObjectURL( svgBlob );
			return new Promise( function( resolve, reject ) {
				var img = ownerDocument.createElement( 'img' );
				img.onload = function() {
					resolve( img );
				};
				img.onerror = function() {
					reject( new Error( 'export-svg-image-decode-failed' ) );
				};
				img.width = width;
				img.height = height;
				img.src = blobUrl;
			} ).then( function( img ) {
				URL.revokeObjectURL( blobUrl );
				return img;
			}, function( err ) {
				URL.revokeObjectURL( blobUrl );
				return Promise.reject( err );
			} );
		}

		// attributes(保存属性のスナップショット)からPNG Blobを生成する。
		// options: { ownerDocument }(省略時はグローバルdocument)。
		// 戻り値: Promise<Blob>(image/png)。読み込み失敗・Canvas非対応・toBlob失敗は
		// すべてPromiseのrejectとして呼び出し側(Editor Controller)へ伝える。
		function exportPng( attributes, options ) {
			options = options || {};
			var ownerDocument = options.ownerDocument || ( ( 'undefined' !== typeof document ) ? document : null );
			if ( ! ownerDocument ) {
				return Promise.reject( new Error( 'export-no-owner-document' ) );
			}
			// Attributesは書き出し中のユーザー編集の影響を受けないよう、この時点で
			// 値のスナップショットを取る(6節・保存属性はプレーンJSON値のみのため
			// JSON往復で安全にdeep copyできる)。
			var attributesSnapshot = JSON.parse( JSON.stringify( attributes ) );
			var assetStore = SceneAssets.createAssetStore();

			return SceneRuntime.resolveScene( attributesSnapshot, EXPORT_RENDER_STATE, { ownerDocument: ownerDocument, assetStore: assetStore } )
				.then( function( resolvedScene ) {
					if ( ! resolvedScene.image.url || resolvedScene.image.width <= 0 || resolvedScene.image.height <= 0 ) {
						return Promise.reject( new Error( 'export-no-main-image' ) );
					}
					return embedAssets( resolvedScene );
				} )
				.then( function( embeddedScene ) {
					var offscreen = renderOffscreenSvg( ownerDocument, embeddedScene );
					return loadSvgAsImage( ownerDocument, offscreen.svgEl, embeddedScene.image.width, embeddedScene.image.height )
						.then( function( svgImg ) {
							offscreen.dispose();
							var canvas = ownerDocument.createElement( 'canvas' );
							canvas.width = embeddedScene.image.width;
							canvas.height = embeddedScene.image.height;
							var ctx = canvas.getContext( '2d' );
							if ( ! ctx ) {
								return Promise.reject( new Error( 'export-canvas-2d-not-supported' ) );
							}
							// このファイル内でCanvas 2Dへ描画する唯一の呼び出し(21節・37節: SVG全体を
							// 丸ごと1回描くだけで、Pin/Marker/Label/Bubbleを個別に再描画しない)。
							ctx.drawImage( svgImg, 0, 0, embeddedScene.image.width, embeddedScene.image.height );
							return new Promise( function( resolve, reject ) {
								try {
									canvas.toBlob( function( blob ) {
										if ( ! blob ) {
											reject( new Error( 'export-png-blob-generation-failed' ) );
											return;
										}
										resolve( blob );
									} );
								} catch ( err ) {
									reject( err );
								}
							} );
						}, function( err ) {
							offscreen.dispose();
							return Promise.reject( err );
						} );
				} )
				.then( function( blob ) {
					assetStore.dispose();
					return blob;
				}, function( err ) {
					assetStore.dispose();
					return Promise.reject( err );
				} );
		}

		return {
			exportPng: exportPng
		};
	}
);
