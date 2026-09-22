/**
 * Image Pin Block — 唯一のScene Runtime。
 *
 * Model(scene-model.js)/Assets(scene-assets.js)/Text(scene-text.js)/
 * Geometry(geometry.js)/Renderer(svg-renderer.js)/Camera(scene-camera.js)を
 * ここで1本の非同期pipelineへ接続する。Editor(通常Preview/Fullscreen)・
 * Frontend・Frontend Lightboxは、すべてこの`createRuntime()`の別インスタンスを
 * mountするだけでよく、Model→ResolvedScene変換ロジック自体は複製しない
 * (3節・21節)。
 *
 * ─── revision-gated pipeline(28節) ───
 * setAttributes()が呼ばれるたびにrevisionを1つ進める。非同期(asset解決→
 * font読み込み待ち→text layout→geometry)の途中で、より新しいrevisionの
 * setAttributes()呼び出しが発生した場合、古いrevisionの結果は(すでに計算が
 * 終わっていても)一切適用しない。「表示が一旦おかしいが、何かに触ると直る」
 * (旧staticGeometryReady/modalGeometryReadyのパターン)を構造的に排除する。
 *
 * ─── resolveScene()を外部へ公開する理由 ───
 * PNG書き出し(png-export.js)は、mountされたRendererを持たない状態で
 * 「確定したAttributesスナップショット」からResolvedSceneだけを1回作りたい
 * (Popover/editorOverlay無し)。createRuntime()の内部状態(revision・camera等)を
 * 経由せずに済むよう、Attributes→ResolvedScene変換そのもの(resolveScene)を
 * 独立した関数としても公開する(37節: PNG Export共通pipeline)。
 */
( function( root, factory ) {
	'use strict';
	var isNode = ( 'undefined' !== typeof module && module.exports );
	function dep( name, globalName ) {
		return isNode ? require( './' + name ) : ( root && root[ globalName ] );
	}
	var Geometry = dep( 'geometry.js', 'ImagePinBlockGeometry' );
	var SceneModel = dep( 'scene-model.js', 'ImagePinBlockSceneModel' );
	var SceneAssets = dep( 'scene-assets.js', 'ImagePinBlockSceneAssets' );
	var SceneText = dep( 'scene-text.js', 'ImagePinBlockSceneText' );
	var SceneCamera = dep( 'scene-camera.js', 'ImagePinBlockSceneCamera' );
	var SvgRenderer = dep( 'svg-renderer.js', 'ImagePinBlockSvgRenderer' );
	var api = factory( Geometry, SceneModel, SceneAssets, SceneText, SceneCamera, SvgRenderer );
	if ( isNode ) {
		module.exports = api;
	}
	if ( root ) {
		root.ImagePinBlockSceneRuntime = api;
	}
} )(
	( 'undefined' !== typeof window ) ? window : ( ( 'undefined' !== typeof global ) ? global : null ),
	function( Geometry, SceneModel, SceneAssets, SceneText, SceneCamera, SvgRenderer ) {
		'use strict';

		// 依存モジュール(別ファイル)の版がずれて古いものが混ざると、片方だけ新しい関数を呼んで
		// 描画が黙って止まる。読み込み時に必要な関数の有無を確認し、足りなければ原因が分かる
		// メッセージをConsoleへ出す(キャッシュ・反映漏れの検出用)。
		var REQUIRED_API = [
			[ 'geometry.js', Geometry, [ 'resolveTailDimensions', 'buildSpeechBubblePolygon', 'computePopoverPlacement' ] ],
			[ 'scene-model.js', SceneModel, [ 'buildSceneModel' ] ],
			[ 'scene-assets.js', SceneAssets, [ 'createAssetStore', 'normalizeUrl' ] ],
			[ 'scene-text.js', SceneText, [ 'layoutText' ] ],
			[ 'scene-camera.js', SceneCamera, [ 'zoomAt' ] ],
			[ 'svg-renderer.js', SvgRenderer, [ 'createScene' ] ]
		];
		var OUTDATED_FILES = REQUIRED_API.filter( function( entry ) {
			return ! entry[ 1 ] || entry[ 2 ].some( function( name ) {
				return 'function' !== typeof entry[ 1 ][ name ];
			} );
		} ).map( function( entry ) {
			return entry[ 0 ];
		} );
		if ( OUTDATED_FILES.length && 'undefined' !== typeof console && console.error ) {
			console.error( '[Image Pin Block] Outdated or missing plugin files: ' + OUTDATED_FILES.join( ', ' ) + '. Re-upload all plugin files and clear the cache.' );
		}

		// Editorでのみ、描画失敗を画面上に表示する(何も出ないまま原因が分からなくなるのを防ぐ)。
		function setLoadNotice( hostEl, show ) {
			var existing = hostEl.querySelector( '.ipb-load-notice' );
			if ( ! show ) {
				if ( existing && existing.parentNode ) {
					existing.parentNode.removeChild( existing );
				}
				return;
			}
			if ( existing ) {
				return;
			}
			var notice = ( hostEl.ownerDocument || document ).createElement( 'div' );
			notice.className = 'ipb-load-notice';
			notice.setAttribute( 'role', 'alert' );
			notice.style.cssText = 'padding:8px 10px;font-size:12px;color:#8a1f11;background:#fbeaea;border:1px solid #d63638;';
			notice.textContent = OUTDATED_FILES.length
				? ( 'Image Pin Block: outdated plugin files detected (' + OUTDATED_FILES.join( ', ' ) + '). Re-upload all files and clear the cache.' )
				: 'Image Pin Block: failed to render. See the browser console for details.';
			hostEl.appendChild( notice );
		}

		function clampToRange( n, min, max ) {
			return Math.min( max, Math.max( min, n ) );
		}

		// 色(hex/rgb/rgba/hsl/CSS標準色名)に不透明度(0〜100)を掛け合わせた最終色を返す。
		// editor.js/image-pin-block.phpのapplyOpacityToColor()と同じ考え方
		// (color-mix(in srgb, color pct%, transparent))。100(既定)のときはcolorそのまま
		// (color-mixで包まない。SVGのfill属性値としてもそのままcolor-mixを渡せる
		// ・CSS <color>値として解決される)。
		function applyOpacityToColor( color, opacityPct ) {
			var pct = clampToRange( ( 'number' === typeof opacityPct ) ? opacityPct : 100, 0, 100 );
			if ( 100 === pct ) {
				return color;
			}
			return 'color-mix(in srgb, ' + color + ' ' + pct.toFixed( 3 ) + '%, transparent)';
		}

		var LABEL_TEXT_PROFILE_BASE = {
			fontFamily: Geometry.LABEL_FONT_FAMILY,
			fontWeight: Geometry.LABEL_FONT_WEIGHT,
			fontStyle: Geometry.LABEL_FONT_STYLE,
			letterSpacing: Geometry.LABEL_LETTER_SPACING,
			lineHeight: Geometry.LABEL_LINE_HEIGHT,
			wrap: false
		};

		var POPOVER_TEXT_PROFILE_BASE = {
			fontFamily: Geometry.POPOVER_FONT_FAMILY,
			fontWeight: Geometry.POPOVER_FONT_WEIGHT,
			fontStyle: Geometry.POPOVER_FONT_STYLE,
			letterSpacing: Geometry.POPOVER_LETTER_SPACING,
			lineHeight: Geometry.POPOVER_LINE_HEIGHT,
			wrap: true
		};

		// ─── Pinの1件分の Label(natural単位。表示しない場合はnull) ───
		function resolvePinLabel( ctx, pinModel, resolvedSize, appearance ) {
			if ( ! pinModel.label.show ) {
				return null;
			}
			var profile = Object.assign( {}, LABEL_TEXT_PROFILE_BASE, { fontSize: appearance.label.fontSize } );
			var layout = SceneText.layoutText( ctx, pinModel.label.text, profile );
			var bodyWidth = layout.width + Geometry.LABEL_PADDING_X * 2;
			var bodyHeight = layout.height + Geometry.LABEL_PADDING_Y * 2;
			var pinRect = { centerX: pinModel.cx, centerY: pinModel.cy, width: resolvedSize.width, height: resolvedSize.height };
			var center = Geometry.computeLabelCenter( pinModel.label.positionRaw, pinModel.hasMarker, pinRect, { width: bodyWidth, height: bodyHeight } );
			var bubblePolygon = null;
			if ( appearance.label.speechBubble ) {
				var targetLocal = { x: pinModel.cx - center.x, y: pinModel.cy - center.y };
				var tail = Geometry.resolveTailDimensions( appearance.label.tailSize );
				bubblePolygon = Geometry.buildSpeechBubblePolygon( bodyWidth / 2, bodyHeight / 2, targetLocal, tail.width / 2, tail.height );
			}
			return {
				cx: center.x,
				cy: center.y,
				bodyWidth: bodyWidth,
				bodyHeight: bodyHeight,
				lines: layout.lines,
				lineHeight: layout.lineHeight,
				paddingX: Geometry.LABEL_PADDING_X,
				paddingY: Geometry.LABEL_PADDING_Y,
				bgColor: applyOpacityToColor( appearance.label.backgroundColor, appearance.label.backgroundOpacity ),
				textColor: appearance.label.textColor,
				strokeColor: appearance.label.strokeColor,
				strokeWidthPx: appearance.label.strokeWidthPx,
				fontFamily: profile.fontFamily,
				fontWeight: profile.fontWeight,
				fontStyle: profile.fontStyle,
				letterSpacing: profile.letterSpacing,
				fontSize: profile.fontSize,
				bubblePolygon: bubblePolygon
			};
		}

		// ─── PC Popover(natural単位。開いていない場合はnull) ───
		// imageWidth/imageHeight: はみ出し判定に使うScene全体のnatural寸法。
		// pinRect: 対象PinのGeometry.computePopoverPlacement()用矩形。
		function resolvePopover( ctx, pinModel, imageWidth, imageHeight, pinRect, appearance, pcBehavior ) {
			var textColor = ( '' !== appearance.popover.textColorRaw ) ? appearance.popover.textColorRaw : Geometry.POPOVER_TEXT_COLOR_FALLBACK;
			var bgColorBase = ( '' !== appearance.popover.backgroundColorRaw ) ? appearance.popover.backgroundColorRaw : Geometry.POPOVER_BACKGROUND_COLOR_FALLBACK;
			// 11節: PC Popover本文の最大幅は、そのPopoverのfontSizeに比例した
			// 値(Geometry.POPOVER_MAX_BODY_WIDTH_EM倍)にする(fontSize固定260 natural pxの
			// 組み合わせだと、fontSizeを大きくするほど1行の文字数が極端に少なくなる回帰が
			// あったため。geometry.js側のPOPOVER_MAX_BODY_WIDTH_EMのコメント参照)。
			// Scene内で利用可能な幅(画像natural widthからpadding/gap分を除いた残り)は
			// 従来どおり超えない。
			var fontRelativeMaxWidth = Geometry.POPOVER_MAX_BODY_WIDTH_EM * appearance.popover.fontSize;
			var availableWidth = Math.max( 40, imageWidth - Geometry.POPOVER_PADDING_X * 2 - Geometry.POPOVER_GAP * 2 );
			var maxBodyWidth = Math.min( fontRelativeMaxWidth, availableWidth );
			var profile = Object.assign( {}, POPOVER_TEXT_PROFILE_BASE, { fontSize: appearance.popover.fontSize, maxWidth: maxBodyWidth } );
			var layout = SceneText.layoutText( ctx, pinModel.description, profile );
			var bodyWidth = Math.min( layout.width, maxBodyWidth );
			var bodyHeight = layout.height;
			var outerWidth = bodyWidth + Geometry.POPOVER_PADDING_X * 2 + Geometry.POPOVER_BORDER_WIDTH * 2;
			var verticalMetrics = Geometry.computePopoverVerticalMetrics( bodyHeight, imageHeight );
			var outerHeight = verticalMetrics.outerHeight;
			var placement = Geometry.computePopoverPlacement( imageWidth, imageHeight, pinRect, { width: outerWidth, height: outerHeight }, Geometry.POPOVER_GAP );

			var bubblePolygon = null;
			if ( appearance.popover.speechBubble ) {
				var centerX = placement.left + outerWidth / 2;
				var centerY = placement.top + outerHeight / 2;
				var targetLocal = { x: pinRect.centerX - centerX, y: pinRect.centerY - centerY };
				var tail = Geometry.resolveTailDimensions( appearance.popover.tailSize );
				bubblePolygon = Geometry.buildSpeechBubblePolygon( outerWidth / 2, outerHeight / 2, targetLocal, tail.width / 2, tail.height );
			}

			// 12節: 画像内に収まる高さより本文が長い場合は、SVG内部のclipPath+縦scrollで
			// 対応する(はみ出し量がscrollMaxOffset。Rendererはこれをtranslateへ使うだけ)。
			var scrollMaxOffset = verticalMetrics.scrollMaxOffset;

			return {
				id: pinModel.id,
				left: placement.left,
				top: placement.top,
				width: outerWidth,
				height: outerHeight,
				lines: layout.lines,
				lineHeight: layout.lineHeight,
				paddingX: Geometry.POPOVER_PADDING_X,
				paddingY: Geometry.POPOVER_PADDING_Y,
				bgColor: applyOpacityToColor( bgColorBase, appearance.popover.backgroundOpacity ),
				textColor: textColor,
				strokeColor: appearance.popover.strokeColor,
				strokeWidthPx: appearance.popover.strokeWidthPx,
				fontFamily: profile.fontFamily,
				fontWeight: profile.fontWeight,
				fontStyle: profile.fontStyle,
				letterSpacing: profile.letterSpacing,
				fontSize: profile.fontSize,
				bubblePolygon: bubblePolygon,
				// PC Popoverの説明文全体がジャンプ用リンクになるのは、pcBehavior==='click-link'の
				// ときだけ(旧PHP実装の$pc_needs_linkと同じ条件。hover-clickでは、Pin本体の
				// クリックがジャンプを担うため、Popover自身の文字はリンクにしない)。
				link: ( pinModel.target && 'click-link' === pcBehavior ) ? { href: '#' + pinModel.target } : null,
				scrollMaxOffset: scrollMaxOffset
			};
		}

		// ─── Pinのa11y種別(PC操作。Mobile Panelは別UIのため対象外) ───
		// pcBehavior==='click-link' かつ Descriptionあり → button(Popover開閉。
		// aria-expanded/aria-controls)。hover-clickでDescriptionがあれば
		// (targetの有無に関わらず) → button(hover-preview。クリック自体は
		// Controller側でtarget有無に応じ安全にno-opまたはジャンプする。29節)。
		// targetがあれば → link(クリックで直接ジャンプ)。いずれも無ければ → none。
		//
		// 重要: Descriptionの有無だけがPopover表示可否を決め、targetの有無で
		// Hover Description自体を無効化しない(hasTarget && hasDescriptionの場合も
		// targetを優先してkind='link'にするが、hover-preview自体はa11y.kindとは
		// 無関係にpinModel.hasDescription && pcBehaviorだけで判定するView側の
		// ロジックにより、linkでも問題なく動作する。svg-renderer.jsのhover委譲は
		// pointer-events/a11y.kindを一切参照しないため、hover表示自体はここで
		// kindをどう選んでも影響を受けない。ここで決めるのはrole/tabindex等の
		// アクセシビリティ表現と、Enter/SpaceキーでのPinKeyDown活性化対象だけ)。
		//
		// editorOverlay(true = Editor Preview/Fullscreenへmountされる側。29節)の場合は
		// pcBehaviorに関わらずkind='link'を一切返さない。Editor自身の中では
		// クリック/Enterは常に「選択+Popover toggle」であり、targetへの実際のページ内
		// ジャンプ(<a href>のネイティブ遷移)を行う意味は無く、むしろ編集中のiframe内で
		// 予期しないハッシュナビゲーション/スクロールを起こすだけの実害になる
		// (target自体はFrontend側で使う同ページ内アンカーの値であり、ここではEditor
		// 表示上のa11y種別だけを変える。保存値・Frontendの実際のジャンプ挙動は変更しない)。
		function resolvePinA11y( pinModel, pcBehavior, editorOverlay ) {
			var hasTarget = !! pinModel.target;
			var labelText = pinModel.label.hasText ? pinModel.label.text : ( pinModel.hasDescription ? pinModel.description : '' );
			if ( editorOverlay ) {
				if ( hasTarget || pinModel.hasDescription ) {
					return { kind: 'button', label: labelText, href: null, controlsId: 'ipb-popover-' + pinModel.id };
				}
				return { kind: 'none', label: labelText, href: null, controlsId: null };
			}
			var opensPopoverOnClick = pinModel.hasDescription && ( 'click-link' === pcBehavior );
			if ( opensPopoverOnClick ) {
				return { kind: 'button', label: labelText, href: null, controlsId: 'ipb-popover-' + pinModel.id };
			}
			if ( hasTarget ) {
				return { kind: 'link', label: labelText, href: '#' + pinModel.target, controlsId: null };
			}
			// hover-clickでtargetが無くてもDescriptionがあれば、hover/focusで見せる対象と
			// してフォーカス可能にする(キーボードでも同等に到達可能にする。クリック自体は
			// view.jsのhandlePinActivateがtarget空文字を安全にno-opする)。
			var opensPopoverOnHover = pinModel.hasDescription && ( 'hover-click' === pcBehavior );
			if ( opensPopoverOnHover ) {
				return { kind: 'button', label: labelText, href: null, controlsId: 'ipb-popover-' + pinModel.id };
			}
			return { kind: 'none', label: labelText, href: null, controlsId: null };
		}

		// ─── Attributes(+renderState)からResolvedSceneを組み立てる(非同期) ───
		// context: { ownerDocument, assetStore }。renderState: { openPopoverPinId,
		// selectedPinId, editorOverlay, popoverScrollOffset }(Popover本文の解決に
		// 必要な部分だけを読む。PNG書き出し時はopenPopoverPinId=nullを渡すこと)。
		function resolveScene( attributes, renderState, context ) {
			var Model = SceneModel.buildSceneModel( attributes, Geometry );
			var ownerDocument = context.ownerDocument;
			var assetStore = context.assetStore;
			var ctx = SceneText.getMeasurementContext( ownerDocument );

			// Main Image/Marker画像URLの正規化(Mixed Content対策としての
			// 同一ホストhttp→https書き換え)を、ここ1箇所だけで行う。SceneAssetsの
			// normalizeUrl()が唯一の実装であり(scene-assets.js参照)、以降このModelを
			// 読むAsset解決(assetStore.resolveMainImage/resolveMarkerImage)・
			// このresolveScene()が返すResolvedScene(svg-renderer.jsのhref設定・
			// png-export.jsのembedAssets/fetchAsDataUrlが読む)のすべてが、この
			// 正規化済みURLを一貫して使う(個別のsurface/経路ごとに同種の補正を
			// 追加しない)。Modelは呼び出しごとにbuildSceneModel()が新しく作る一時
			// オブジェクトのため、ここでの変更が保存属性(attributes)自体へ影響することは
			// ない(保存schemaは変更しない)。
			Model.image.url = SceneAssets.normalizeUrl( Model.image.url, ownerDocument );
			Model.pins.forEach( function( pin ) {
				if ( pin.hasMarker ) {
					pin.markerImageUrl = SceneAssets.normalizeUrl( pin.markerImageUrl, ownerDocument );
				}
			} );

			var imageLoad = Model.image.url
				? assetStore.resolveMainImage( Model.image.url, ownerDocument ).catch( function() { return null; } )
				: Promise.resolve( null );

			var markerLoads = {};
			Model.pins.forEach( function( pin ) {
				if ( pin.hasMarker && ! markerLoads[ pin.markerImageUrl ] ) {
					markerLoads[ pin.markerImageUrl ] = assetStore.resolveMarkerImage( pin.markerImageUrl, ownerDocument ).catch( function() { return null; } );
				}
			} );

			return Promise.all( [ imageLoad, Promise.all( Object.keys( markerLoads ).map( function( url ) { return markerLoads[ url ]; } ) ), SceneText.waitForFonts( ownerDocument ) ] )
				.then( function( results ) {
					var mainImageResolved = results[ 0 ];
					var markerUrls = Object.keys( markerLoads );
					var markerResolvedByUrl = {};
					markerUrls.forEach( function( url, index ) {
						markerResolvedByUrl[ url ] = results[ 1 ][ index ];
					} );

					// Model.image.width/heightは保存済み属性(元画像決定時に確定済み)。
					// まだ0の場合(初回・画像未選択)は、今回decode()できたimgの実寸を採用する
					// (保存前のEditorプレビュー用フォールバック。保存属性自体は書き換えない)。
					var imageWidth = Model.image.width || ( mainImageResolved ? mainImageResolved.naturalWidth : 0 );
					var imageHeight = Model.image.height || ( mainImageResolved ? mainImageResolved.naturalHeight : 0 );

					var resolvedPins = Model.pins.map( function( pin ) {
						var visual;
						var resolvedSize;
						if ( pin.hasMarker ) {
							var markerResolved = markerResolvedByUrl[ pin.markerImageUrl ];
							var naturalImgWidth = markerResolved ? markerResolved.naturalWidth : 0;
							var naturalImgHeight = markerResolved ? markerResolved.naturalHeight : 0;
							resolvedSize = Geometry.computeMarkerNaturalSize( naturalImgWidth, naturalImgHeight, pin.markerScale, imageWidth, Geometry.MARKER_MAX_WIDTH_RATIO );
							// intrinsicWidth/Height(マーカー画像ファイル自身の実寸。表示スケールに
							// 一切依存しない値)も併せて持たせる。Rendererは無視してよいが、Editor
							// Controllerがドラッグリサイズ中に「目標display width→markerScale」を
							// 逆算する際、Runtime内部のAsset cacheへ直接アクセスせずに済むよう、
							// ResolvedSceneのこの1箇所だけから読めるようにする(29節: Asset
							// Resolutionの結果はscene-runtime.js経由でのみ公開する)。
							visual = { kind: 'marker', url: pin.markerImageUrl, width: resolvedSize.width, height: resolvedSize.height, intrinsicWidth: naturalImgWidth, intrinsicHeight: naturalImgHeight };
						} else {
							resolvedSize = { width: Model.appearance.pin.size, height: Model.appearance.pin.size };
							visual = { kind: 'dot', diameter: Model.appearance.pin.size, color: Model.appearance.pin.color };
						}

						var handleSize = clampToRange( resolvedSize.width * Geometry.MARKER_RESIZE_HANDLE_RATIO, Geometry.MARKER_RESIZE_HANDLE_MIN, Geometry.MARKER_RESIZE_HANDLE_MAX );
						// ハンドルはMarker画像の右下隅(旧実装と同じ位置)。中心はGeometry側の
						// 解決済みサイズから決める(Rendererは位置を推測しない)。
						var resizeHandle = ( pin.hasMarker && resolvedSize.width > 0 )
							? { size: handleSize, cx: pin.cx + resolvedSize.width / 2, cy: pin.cy + resolvedSize.height / 2 }
							: null;

						return {
							id: pin.id,
							cx: pin.cx,
							cy: pin.cy,
							hasMarker: pin.hasMarker,
							visual: visual,
							resizeHandle: resizeHandle,
							label: resolvePinLabel( ctx, pin, resolvedSize, Model.appearance ),
							a11y: resolvePinA11y( pin, Model.interaction.pcBehavior, !! ( renderState && renderState.editorOverlay ) ),
							target: pin.target,
							_resolvedSize: resolvedSize // Controller(drag/resize)用の内部参照。Rendererは無視すること。
						};
					} );

					var popover = null;
					if ( renderState && renderState.openPopoverPinId ) {
						var openPin = resolvedPins.filter( function( p ) { return p.id === renderState.openPopoverPinId; } )[ 0 ];
						var openPinModel = Model.pins.filter( function( p ) { return p.id === renderState.openPopoverPinId; } )[ 0 ];
						if ( openPin && openPinModel && openPinModel.hasDescription ) {
							var pinRect = { centerX: openPin.cx, centerY: openPin.cy, width: openPin._resolvedSize.width, height: openPin._resolvedSize.height };
							popover = resolvePopover( ctx, openPinModel, imageWidth, imageHeight, pinRect, Model.appearance, Model.interaction.pcBehavior );
						}
					}

					return {
						image: { url: Model.image.url, width: imageWidth, height: imageHeight },
						pins: resolvedPins,
						popover: popover
					};
				} );
		}

		// ─── createRuntime: mountされた1インスタンス(Editor Preview/Fullscreen/
		// Frontend/Lightboxそれぞれが自分の host要素へ1つ作る) ───
		function createRuntime( hostEl, options ) {
			options = options || {};
			var ownerDocument = hostEl.ownerDocument || document;
			var assetStore = SceneAssets.createAssetStore();
			var renderer = SvgRenderer.createScene( hostEl, options.rendererOptions || {} );

			var revisionCounter = 0;
			var lastAttributes = null;
			var disposed = false;
			var minZoom = ( 'number' === typeof options.minZoom ) ? options.minZoom : 100;
			var maxZoom = ( 'number' === typeof options.maxZoom ) ? options.maxZoom : 200;

			var renderState = {
				selectedPinId: null,
				openPopoverPinId: null,
				editorOverlay: !! options.editorOverlay,
				focusedPinId: null,
				popoverScrollOffset: 0
			};
			var camera = { zoomPercent: 100, centerX: 0, centerY: 0 };

			function runPipeline() {
				if ( disposed || ! lastAttributes ) {
					return;
				}
				revisionCounter++;
				var myRevision = revisionCounter;
				resolveScene( lastAttributes, renderState, { ownerDocument: ownerDocument, assetStore: assetStore } ).then( function( resolvedScene ) {
					if ( disposed || myRevision !== revisionCounter ) {
						return; // より新しいrevisionが既に走っている。この結果は捨てる。
					}
					resolvedScene.revision = myRevision;
					renderer.setModel( resolvedScene );
					renderer.setCamera( camera );
					setLoadNotice( hostEl, false );
				} ).catch( function( err ) {
					// 失敗を握りつぶすと「ピンが全部消える」原因が追えないため、開発者向けに残す
					// (asset読み込み失敗はresolveScene内で個別にnullへ丸められるため、ここへ来るのは
					// 想定外の例外のみ)。
					if ( 'undefined' !== typeof console && console.error ) {
						console.error( '[Image Pin Block] scene pipeline failed:', err );
					}
					if ( renderState.editorOverlay && myRevision === revisionCounter ) {
						setLoadNotice( hostEl, true );
					}
					// asset読み込み失敗等。次のsetAttributes()/setRenderState()で
					// 再試行される(scene-assets.jsは失敗したURLをcacheへ残さないため)。
				} );
			}

			return {
				setAttributes: function( attributes ) {
					lastAttributes = attributes;
					runPipeline();
				},
				setRenderState: function( partial ) {
					var openPopoverChanged = partial && ( 'openPopoverPinId' in partial );
					renderState = Object.assign( {}, renderState, partial );
					renderer.setRenderState( renderState );
					if ( openPopoverChanged ) {
						runPipeline();
					}
				},
				getRenderState: function() {
					return Object.assign( {}, renderState );
				},
				getCamera: function() {
					return Object.assign( {}, camera );
				},
				setCamera: function( nextCamera ) {
					camera = nextCamera;
					renderer.setCamera( camera );
				},
				zoomTo: function( nextZoomPercent, anchorX, anchorY ) {
					var image = renderer.getSnapshot().model && renderer.getSnapshot().model.image;
					if ( ! image ) {
						return;
					}
					camera = SceneCamera.zoomAt( image.width, image.height, camera, nextZoomPercent, anchorX, anchorY, minZoom, maxZoom );
					renderer.setCamera( camera );
				},
				panBy: function( dxNatural, dyNatural ) {
					var image = renderer.getSnapshot().model && renderer.getSnapshot().model.image;
					if ( ! image ) {
						return;
					}
					camera = SceneCamera.panBy( image.width, image.height, camera, dxNatural, dyNatural );
					renderer.setCamera( camera );
				},
				resetToFit: function() {
					var image = renderer.getSnapshot().model && renderer.getSnapshot().model.image;
					camera = { zoomPercent: 100, centerX: image ? image.width / 2 : 0, centerY: image ? image.height / 2 : 0 };
					renderer.setCamera( camera );
				},
				// client座標(clientX/clientY)→Scene(natural)座標変換(共通API。27節)。
				clientToScene: function( clientX, clientY ) {
					return SceneCamera.clientToScene( renderer.getSvgElement(), clientX, clientY );
				},
				getRenderer: function() {
					return renderer;
				},
				ready: function( revision ) {
					return renderer.ready( revision );
				},
				getSnapshot: function() {
					return renderer.getSnapshot();
				},
				dispose: function() {
					disposed = true;
					renderer.dispose();
					assetStore.dispose();
				}
			};
		}

		return {
			resolveScene: resolveScene,
			applyOpacityToColor: applyOpacityToColor,
			// resolvePinA11yはresolveScene()内部で使う判断だが、DOM(SVG計測)を必要としない
			// 純粋関数のため、そのままexportしてNode上で単体テストできるようにする
			// (ロジックを複製せず、既存の唯一の判断箇所を直接テスト対象にする)。
			resolvePinA11y: resolvePinA11y,
			createRuntime: createRuntime
		};
	}
);
