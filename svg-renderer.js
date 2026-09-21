/**
 * Image Pin Block — 唯一のSVG Scene Renderer。
 *
 * Main Image・丸Pin・Marker・Label・Label Bubble/Tail・PC Popover・Popover
 * Bubble/Tailの、Visual生成を行う唯一の実装。Editor(通常Preview/Fullscreen)・
 * Frontend・Frontend Lightbox・PNG書き出しは、すべてこの`createScene()`の
 * 別インスタンスをmountするだけで、Visual生成コード自体は複製しない
 * (3節・21節)。
 *
 * ─── このファイルが行わないこと(21節: Rendererの禁止責務) ───
 * - asset(画像)の取得・decode(scene-assets.jsの責務)。
 * - 文字の折り返し決定・計測(scene-text.jsの責務)。
 * - Label/Popoverの位置計算・Bubble/Tail形状の計算(geometry.jsの責務)。
 * - getBoundingClientRect()等による内容の実測。
 * - surface名(fullscreen/preview/frontend/lightbox等)によるVisual分岐。
 * 受け取るのは、すでにすべて解決済みのResolved Scene(natural座標・完成した
 * 文字行・完成したBubble多角形)だけであり、それをSVG DOMへ反映するだけ。
 *
 * ─── Resolved Sceneの形(scene-runtime.jsが組み立てて渡す) ───
 * {
 *   image: { url, width, height },
 *   pins: [ {
 *     id, cx, cy, hasMarker,
 *     visual: { kind: 'dot', diameter, color } | { kind: 'marker', url, width, height },
 *     resizeHandle: null | { size },
 *     label: null | {
 *       cx, cy, lines: [{text,width}], lineHeight, bodyWidth, bodyHeight,
 *       bgColor, textColor, strokeColor, strokeWidthPx,
 *       bubblePolygon: null | { pointsAttr, bboxLeft, bboxTop, bboxWidth, bboxHeight }
 *     },
 *     a11y: { kind: 'link'|'button'|'none', label, href, expanded, controlsId }
 *   } ],
 *   popover: null | {
 *     id, left, top, width, height, lines, lineHeight, paddingX, paddingY,
 *     bgColor, textColor, strokeColor, strokeWidthPx,
 *     bubblePolygon: null | {...}, link: null | { href, text },
 *     scrollMaxOffset
 *   }
 * }
 *
 * RenderState: { selectedPinId, openPopoverPinId, editorOverlay(bool),
 *   focusedPinId, popoverScrollOffset }
 */
( function( root, factory ) {
	'use strict';
	var isNode = ( 'undefined' !== typeof module && module.exports );
	var sceneText = isNode ? require( './scene-text.js' ) : ( root && root.ImagePinBlockSceneText );
	var sceneCamera = isNode ? require( './scene-camera.js' ) : ( root && root.ImagePinBlockSceneCamera );
	var geometry = isNode ? require( './geometry.js' ) : ( root && root.ImagePinBlockGeometry );
	var api = factory( sceneText, sceneCamera, geometry );
	if ( isNode ) {
		module.exports = api;
	}
	if ( root ) {
		root.ImagePinBlockSvgRenderer = api;
	}
} )(
	( 'undefined' !== typeof window ) ? window : ( ( 'undefined' !== typeof global ) ? global : null ),
	function( SceneText, SceneCamera, Geometry ) {
		'use strict';

		var SVG_NS = 'http://www.w3.org/2000/svg';
		var XLINK_NS = 'http://www.w3.org/1999/xlink';
		// scene-text.js(計測)とsvg-renderer.js(描画)は、行の縦位置について同じ
		// 基準を使う必要がある(6節・25節)。定数を複製せず、scene-text.js側の値を
		// そのまま使う(scene-text.js未読み込みの場合のみ、同じ既定値0.8へfallback)。
		var BASELINE_RATIO = ( SceneText && 'number' === typeof SceneText.BASELINE_RATIO ) ? SceneText.BASELINE_RATIO : 0.8;

		function ns( tag ) {
			return document.createElementNS( SVG_NS, tag );
		}

		function setAttrs( el, attrs ) {
			Object.keys( attrs ).forEach( function( key ) {
				var value = attrs[ key ];
				if ( undefined === value || null === value ) {
					el.removeAttribute( key );
				} else {
					el.setAttribute( key, value );
				}
			} );
		}

		// bubblePolygon(natural単位。geometry.jsのbuildSpeechBubblePolygon()の戻り値と
		// 同じ形。bboxLeft/bboxTop基準の相対点+bbox情報)を、cx/cy(natural座標の中心)を
		// 基準にした絶対座標のSVG path "d" 文字列へ変換する。bubblePolygonがnullの場合は
		// 単純な矩形(角丸)のpathを返す(吹き出しOFF時。既存の見た目を変えない)。
		function buildBubblePathD( cx, cy, halfWidth, halfHeight, bubblePolygon, cornerRadius ) {
			if ( bubblePolygon ) {
				var offsetX = cx + bubblePolygon.bboxLeft;
				var offsetY = cy + bubblePolygon.bboxTop;
				var raw = bubblePolygon.pointsAttr.split( ' ' ).map( function( pair ) {
					var xy = pair.split( ',' );
					return [ parseFloat( xy[ 0 ] ) + offsetX, parseFloat( xy[ 1 ] ) + offsetY ];
				} );
				var d = 'M ' + raw[ 0 ][ 0 ] + ' ' + raw[ 0 ][ 1 ];
				for ( var i = 1; i < raw.length; i++ ) {
					d += ' L ' + raw[ i ][ 0 ] + ' ' + raw[ i ][ 1 ];
				}
				return d + ' Z';
			}
			// 角丸矩形(吹き出しOFF時。従来の見た目)。
			var r = Math.min( cornerRadius || 0, halfWidth, halfHeight );
			var left = cx - halfWidth;
			var right = cx + halfWidth;
			var top = cy - halfHeight;
			var bottom = cy + halfHeight;
			if ( r <= 0 ) {
				return 'M ' + left + ' ' + top + ' L ' + right + ' ' + top + ' L ' + right + ' ' + bottom + ' L ' + left + ' ' + bottom + ' Z';
			}
			return [
				'M', ( left + r ), top,
				'L', ( right - r ), top,
				'Q', right, top, right, ( top + r ),
				'L', right, ( bottom - r ),
				'Q', right, bottom, ( right - r ), bottom,
				'L', ( left + r ), bottom,
				'Q', left, bottom, left, ( bottom - r ),
				'L', left, ( top + r ),
				'Q', left, top, ( left + r ), top,
				'Z'
			].join( ' ' );
		}

		// text要素の中に、行ごとのtspanを組み立てる(空行も1つのtspanとして描画する。
		// 空文字のtspanは幅が無いだけで、行としての高さ・位置は保つ)。
		function renderTextLines( textEl, lines, cx, topY, lineHeight, textAnchor ) {
			while ( textEl.firstChild ) {
				textEl.removeChild( textEl.firstChild );
			}
			textEl.setAttribute( 'text-anchor', textAnchor || 'middle' );
			lines.forEach( function( line, index ) {
				var tspan = ns( 'tspan' );
				tspan.setAttribute( 'x', cx );
				tspan.setAttribute( 'y', topY + ( index + BASELINE_RATIO ) * lineHeight );
				tspan.textContent = line.text;
				textEl.appendChild( tspan );
			} );
		}

		// ─── PinごとのDOMノード(keyed。setModel()のたびに作り直さず、既存ノードの
		// 属性だけを更新する。ドラッグ中のPointer Captureを保持したまま更新できる
		// ようにするため)。───
		function createPinEntry( pinId ) {
			var pinGroup = ns( 'g' );
			pinGroup.setAttribute( 'data-pin-id', pinId );
			pinGroup.setAttribute( 'class', 'ipb-pin' );

			var labelGroup = ns( 'g' );
			labelGroup.setAttribute( 'data-pin-id', pinId );
			labelGroup.setAttribute( 'class', 'ipb-label' );
			var labelBubble = ns( 'path' );
			labelBubble.setAttribute( 'class', 'ipb-label-bubble' );
			var labelText = ns( 'text' );
			labelText.setAttribute( 'class', 'ipb-label-text' );
			labelGroup.appendChild( labelBubble );
			labelGroup.appendChild( labelText );

			return {
				pinId: pinId,
				pinGroup: pinGroup,
				contentHolder: pinGroup, // visualの現在の親(通常pinGroup自身。'link'時のみ内側の<a>)
				linkEl: null, // 'link'種別のときだけ存在する本物の<a>(applyA11yが管理)
				visualEl: null, // <circle> or <image>、種類が変わったら作り直す
				visualKind: null,
				handleEl: null,
				labelGroup: labelGroup,
				labelBubble: labelBubble,
				labelText: labelText,
				selectionRing: null,
				focusRing: null
			};
		}

		function updateVisual( entry, visual ) {
			if ( entry.visualKind !== visual.kind ) {
				if ( entry.visualEl && entry.visualEl.parentNode ) {
					entry.visualEl.parentNode.removeChild( entry.visualEl );
				}
				entry.visualEl = ( 'marker' === visual.kind ) ? ns( 'image' ) : ns( 'circle' );
				entry.visualEl.setAttribute( 'class', 'ipb-pin-visual' );
				entry.contentHolder.insertBefore( entry.visualEl, entry.contentHolder.firstChild );
				entry.visualKind = visual.kind;
			}
			if ( 'marker' === visual.kind ) {
				setAttrs( entry.visualEl, {
					x: visual.cx - visual.width / 2,
					y: visual.cy - visual.height / 2,
					width: visual.width,
					height: visual.height,
					preserveAspectRatio: 'none'
				} );
				entry.visualEl.setAttributeNS( XLINK_NS, 'xlink:href', visual.url );
				entry.visualEl.setAttribute( 'href', visual.url );
			} else {
				setAttrs( entry.visualEl, {
					cx: visual.cx,
					cy: visual.cy,
					r: visual.diameter / 2,
					fill: visual.color,
					stroke: '#ffffff',
					'stroke-width': 2
				} );
			}
		}

		function updateResizeHandle( entry, handle, show ) {
			if ( ! show || ! handle ) {
				if ( entry.handleEl && entry.handleEl.parentNode ) {
					entry.handleEl.parentNode.removeChild( entry.handleEl );
					entry.handleEl = null;
				}
				return;
			}
			if ( ! entry.handleEl ) {
				entry.handleEl = ns( 'circle' );
				entry.handleEl.style.cursor = 'nwse-resize';
				entry.handleEl.style.touchAction = 'none';
				entry.handleEl.setAttribute( 'class', 'ipb-resize-handle' );
				entry.handleEl.setAttribute( 'data-pin-id', entry.pinId );
				entry.pinGroup.appendChild( entry.handleEl );
			}
			setAttrs( entry.handleEl, {
				cx: handle.cx,
					cy: handle.cy,
					r: handle.size / 2,
					fill: '#1e88e5',
					stroke: '#ffffff',
					'stroke-width': Math.max( 1, handle.size / 8 )
			} );
		}

		function updateLabel( entry, label ) {
			if ( ! label ) {
				entry.labelGroup.style.display = 'none';
				return;
			}
			// labelは、scene-runtime.jsのrevision gateにより「asset/font/text-layout/
			// geometryすべて解決済み」の場合にしか渡されない(revisionが古いままの
			// setModel呼び出しは、そもそもRuntime側で捨てられる)。よってRenderer側で
			// 「一旦見えているが実は未確定」というhidden状態を別途持つ必要は無い
			// (旧実装のstaticGeometryReady/modalGeometryReadyのような、Renderer自身の
			// 準備状態フラグは持たない)。
			entry.labelGroup.style.display = '';
			entry.labelGroup.style.visibility = '';
			var halfWidth = label.bodyWidth / 2;
			var halfHeight = label.bodyHeight / 2;
			var cornerRadius = Math.min( 3, halfWidth, halfHeight );
			entry.labelBubble.setAttribute( 'd', buildBubblePathD( label.cx, label.cy, halfWidth, halfHeight, label.bubblePolygon, cornerRadius ) );
			// 保存schemaにLabel背景自体の縁取り属性は存在しない(labelStrokeColor/Widthは
			// 文字の-webkit-text-stroke専用。旧editor.jsのbuildStrokeStyle()が同じ理由で
			// テキストのみに適用していたのと同じ判断)。BODY+Tailの単一path・単一fill
			// (縁取り無し)が既存の見た目と完全に一致する(29節)。
			setAttrs( entry.labelBubble, {
				fill: label.bgColor,
				stroke: 'none'
			} );
			setAttrs( entry.labelText, {
				fill: label.textColor,
				'font-family': label.fontFamily,
				'font-size': label.fontSize,
				'font-weight': label.fontWeight,
				'font-style': label.fontStyle,
				'letter-spacing': label.letterSpacing,
				style: ( label.strokeWidthPx > 0 )
					? ( '-webkit-text-stroke:' + label.strokeWidthPx + 'px ' + label.strokeColor + ';paint-order:stroke fill;' )
					: ''
			} );
			var top = label.cy - label.bodyHeight / 2 + label.paddingY;
			renderTextLines( entry.labelText, label.lines, label.cx, top, label.lineHeight, 'middle' );
		}

		// ─── Popover(単一。開いているときだけ存在する) ───
		function createPopoverEntry() {
			var group = ns( 'g' );
			group.setAttribute( 'class', 'ipb-popover' );
			group.setAttribute( 'data-role', 'popover' );
			var bubble = ns( 'path' );
			bubble.setAttribute( 'class', 'ipb-popover-bubble' );
			var clipPath = ns( 'clipPath' );
			var clipId = 'ipb-popover-clip-' + Math.random().toString( 36 ).slice( 2 );
			clipPath.setAttribute( 'id', clipId );
			var clipRect = ns( 'rect' );
			clipPath.appendChild( clipRect );
			var clippedGroup = ns( 'g' );
			clippedGroup.setAttribute( 'clip-path', 'url(#' + clipId + ')' );
			var scrollGroup = ns( 'g' );
			var text = ns( 'text' );
			text.setAttribute( 'class', 'ipb-popover-text' );
			scrollGroup.appendChild( text );
			clippedGroup.appendChild( scrollGroup );
			group.appendChild( bubble );
			group.appendChild( clipPath );
			group.appendChild( clippedGroup );
			return {
				group: group, bubble: bubble, clipRect: clipRect, scrollGroup: scrollGroup, text: text,
				linkEl: null // pcBehavior==='click-link'のときだけ、textを包む本物の<a>(updatePopoverが管理)
			};
		}

		function updatePopover( entry, popover, scrollOffset ) {
			if ( ! popover ) {
				entry.group.style.display = 'none';
				return;
			}
			entry.group.style.display = '';
			// Pin→Popoverへポインタが移動しただけでhover-previewが閉じないよう
			// (dispatchMouseOver/Out参照)、開いているPinと同じdata-pin-idをPopover自身にも
			// 付与し、Pin/Popoverを1つの論理hover領域として扱えるようにする。
			entry.group.setAttribute( 'data-pin-id', popover.id );
			var cx = popover.left + popover.width / 2;
			var cy = popover.top + popover.height / 2;
			var halfWidth = popover.width / 2;
			var halfHeight = popover.height / 2;
			var cornerRadius = Math.min( 6, halfWidth, halfHeight );
			entry.bubble.setAttribute( 'd', buildBubblePathD( cx, cy, halfWidth, halfHeight, popover.bubblePolygon, cornerRadius ) );
			// popoverStrokeColor/Widthは文字の-webkit-text-stroke専用で、BODY自体の縁取りには
			// 使わない(labelと同じ)。ただしPopover BODYだけは、旧CSSの固定border: 1px solid
			// #ddd(popoverStrokeColorとは無関係。吹き出しON/OFFいずれでも同じ)を持っていたため、
			// Geometry.POPOVER_BORDER_COLOR/WIDTHの固定値をそのままstrokeへ使う(29節)。
			setAttrs( entry.bubble, {
				fill: popover.bgColor,
				stroke: Geometry ? Geometry.POPOVER_BORDER_COLOR : 'none',
				'stroke-width': Geometry ? Geometry.POPOVER_BORDER_WIDTH : 0
			} );
			setAttrs( entry.clipRect, {
				x: popover.left, y: popover.top, width: popover.width, height: popover.height
			} );
			var clampedOffset = Math.min( Math.max( 0, scrollOffset || 0 ), popover.scrollMaxOffset || 0 );
			entry.scrollGroup.setAttribute( 'transform', 'translate(0, ' + ( -clampedOffset ) + ')' );

			// pcBehavior==='click-link'のときだけ、説明文全体(text)が本物の<a href="#...">に
			// なる(旧PHP実装の$pc_needs_linkと同じ、説明文自体がジャンプ用リンクになる仕様。
			// 29節: 「リンクへSpace起動を後付けしない」と同じ理由で、手動role/keydownでは
			// なく本物の<a>を使う)。
			if ( popover.link ) {
				if ( ! entry.linkEl ) {
					entry.linkEl = ns( 'a' );
					entry.linkEl.setAttribute( 'class', 'ipb-popover-link' );
					entry.scrollGroup.insertBefore( entry.linkEl, entry.text );
				}
				if ( entry.text.parentNode !== entry.linkEl ) {
					entry.linkEl.appendChild( entry.text );
				}
				entry.linkEl.setAttributeNS( XLINK_NS, 'xlink:href', popover.link.href );
				entry.linkEl.setAttribute( 'href', popover.link.href );
			} else if ( entry.linkEl ) {
				if ( entry.text.parentNode === entry.linkEl ) {
					entry.scrollGroup.insertBefore( entry.text, entry.linkEl );
				}
				if ( entry.linkEl.parentNode ) {
					entry.linkEl.parentNode.removeChild( entry.linkEl );
				}
				entry.linkEl = null;
			}

			setAttrs( entry.text, {
				fill: popover.textColor,
				'font-family': popover.fontFamily,
				'font-size': popover.fontSize,
				'font-weight': popover.fontWeight,
				'font-style': popover.fontStyle,
				'letter-spacing': popover.letterSpacing,
				style: ( popover.strokeWidthPx > 0 )
					? ( '-webkit-text-stroke:' + popover.strokeWidthPx + 'px ' + popover.strokeColor + ';paint-order:stroke fill;' )
					: ''
			} );
			var textLeft = popover.left + popover.paddingX;
			var textTop = popover.top + popover.paddingY;
			renderTextLines( entry.text, popover.lines, textLeft, textTop, popover.lineHeight, 'start' );
		}

		// ─── createScene: 唯一の公開API ───
		function createScene( hostEl, options ) {
			options = options || {};
			var doc = hostEl.ownerDocument || document;

			while ( hostEl.firstChild ) {
				hostEl.removeChild( hostEl.firstChild );
			}

			var svg = ns( 'svg' );
			svg.setAttribute( 'class', 'ipb-scene' + ( options.className ? ' ' + options.className : '' ) );
			svg.setAttribute( 'preserveAspectRatio', 'xMidYMid meet' );
			svg.style.display = 'block';
			svg.style.width = '100%';
			// options.fillHost(既定false): hostElが固定サイズ・固定縦横比のletterbox窓
			// (Fullscreen EditorのPreview viewport・Lightboxのstage)のときだけtrueにする。
			// それ以外(Frontend本体・Editor静的キャンバス)は高さを明示せず、SVGルート自身の
			// intrinsic aspect ratio(viewBoxから決まる。<img width:100%;height:auto>と同じ
			// 挙動)に任せる。無条件でheight:100%にすると、明示的な高さを持たない
			// (幅だけレスポンシブな)親要素の下では高さ0に潰れてしまう(Frontendで実際に
			// 発生する構成)。
			if ( options.fillHost ) {
				svg.style.height = '100%';
			}
			svg.style.userSelect = 'none';
			svg.style.touchAction = 'none';

			var defs = ns( 'defs' );
			var mainImageLayer = ns( 'g' );
			mainImageLayer.setAttribute( 'data-layer', 'main-image' );
			var mainImageEl = ns( 'image' );
			mainImageEl.setAttribute( 'preserveAspectRatio', 'none' );
			mainImageLayer.appendChild( mainImageEl );

			var pinsLayer = ns( 'g' );
			pinsLayer.setAttribute( 'data-layer', 'pins' );
			var labelsLayer = ns( 'g' );
			labelsLayer.setAttribute( 'data-layer', 'labels' );
			var popoverLayer = ns( 'g' );
			popoverLayer.setAttribute( 'data-layer', 'popover' );
			var overlayLayer = ns( 'g' );
			overlayLayer.setAttribute( 'data-layer', 'interaction-overlay' );

			svg.appendChild( defs );
			svg.appendChild( mainImageLayer );
			svg.appendChild( pinsLayer );
			svg.appendChild( labelsLayer );
			svg.appendChild( popoverLayer );
			svg.appendChild( overlayLayer );
			hostEl.appendChild( svg );

			var popoverEntry = createPopoverEntry();
			popoverLayer.appendChild( popoverEntry.group );
			popoverEntry.group.style.display = 'none';

			// PC Popover BODYの固定影(旧CSSのbox-shadow: 0 2px 10px rgba(0,0,0,0.15)。
			// 吹き出しON/OFFいずれでも同じ、ユーザー設定不可のUI装飾。29節)。
			var popoverShadowId = 'ipb-popover-shadow-' + Math.random().toString( 36 ).slice( 2 );
			if ( Geometry ) {
				var popoverFilter = ns( 'filter' );
				setAttrs( popoverFilter, { id: popoverShadowId, x: '-50%', y: '-50%', width: '200%', height: '200%' } );
				var dropShadow = ns( 'feDropShadow' );
				setAttrs( dropShadow, {
					dx: 0,
					dy: Geometry.POPOVER_SHADOW_OFFSET_Y,
					stdDeviation: Geometry.POPOVER_SHADOW_BLUR / 2,
					'flood-color': Geometry.POPOVER_SHADOW_COLOR,
					'flood-opacity': Geometry.POPOVER_SHADOW_OPACITY
				} );
				popoverFilter.appendChild( dropShadow );
				defs.appendChild( popoverFilter );
				popoverEntry.bubble.setAttribute( 'filter', 'url(#' + popoverShadowId + ')' );
			}

			var pinEntries = {}; // pinId -> entry
			var currentModel = null;
			var currentCamera = null;
			var currentRenderState = { selectedPinId: null, openPopoverPinId: null, editorOverlay: false, focusedPinId: null, popoverScrollOffset: 0 };
			// scene-runtime.jsのrevision-gated pipelineが「このFrameはrevision Nの
			// 結果である」と分かるよう、setModel()に渡すResolvedSceneへ付けてもらう
			// 任意のrevision番号(付けなければ常に0のまま)。ready(N)は、
			// lastAppliedRevision >= N になった時点で解決するPromiseを返す
			// (実機/Node双方のE2Eテストが「特定のFrameが実際に描画された」ことを
			// 待てるようにするための、Renderer自身の最小限の同期ポイント。29節)。
			var lastAppliedRevision = 0;
			var pendingReadyWaiters = [];

			function flushReadyWaiters() {
				pendingReadyWaiters = pendingReadyWaiters.filter( function( waiter ) {
					if ( lastAppliedRevision >= waiter.revision ) {
						waiter.resolve( lastAppliedRevision );
						return false;
					}
					return true;
				} );
			}

			function findPinId( evt ) {
				var el = evt.target;
				if ( ! el || ! el.closest ) {
					return null;
				}
				var group = el.closest( '[data-pin-id]' );
				return group ? group.getAttribute( 'data-pin-id' ) : null;
			}

			function isWithin( evt, selector ) {
				return !! ( evt.target && evt.target.closest && evt.target.closest( selector ) );
			}

			function dispatchPointerDown( evt ) {
				var pinId = findPinId( evt );
				if ( pinId ) {
					if ( isWithin( evt, '.ipb-resize-handle' ) && options.onMarkerResizePointerDown ) {
						options.onMarkerResizePointerDown( pinId, evt );
						return;
					}
					if ( isWithin( evt, '.ipb-label' ) && options.onLabelPointerDown ) {
						options.onLabelPointerDown( pinId, evt );
						return;
					}
					if ( isWithin( evt, '.ipb-pin' ) && options.onPinPointerDown ) {
						options.onPinPointerDown( pinId, evt );
						return;
					}
				}
				if ( isWithin( evt, '[data-role="popover"]' ) ) {
					return; // Popover自身の上のpointerdownは背景操作として扱わない。
				}
				if ( options.onViewportPointerDown ) {
					options.onViewportPointerDown( evt );
				}
			}

			function dispatchDoubleClick( evt ) {
				var pinId = findPinId( evt );
				if ( pinId || isWithin( evt, '[data-role="popover"]' ) ) {
					return;
				}
				if ( options.onViewportDoubleClick ) {
					options.onViewportDoubleClick( evt );
				}
			}

			// Frontend/Lightbox用: 実際のジャンプ・Popover/Mobile Panel開閉は、ドラッグの
			// 概念が無いためpointerdownではなくclickで判定する(PC直接クリック・キーボード
			// Enterでの<a>/button両方のネイティブclickをここで一括して受け取れる)。
			// Popover自身の上のclickは背景クリック(全部閉じる)としては扱わない。
			function dispatchClick( evt ) {
				var pinId = findPinId( evt );
				if ( pinId && isWithin( evt, '.ipb-pin' ) && options.onPinClick ) {
					options.onPinClick( pinId, evt );
					return;
				}
				if ( isWithin( evt, '[data-role="popover"]' ) ) {
					return;
				}
				if ( options.onBackgroundClick ) {
					options.onBackgroundClick( evt );
				}
			}

			// PC hover-preview(pcBehavior==='hover-click')用の委譲hover検出。
			// mouseenter/mouseleaveはbubbleしないため、bubbleするmouseover/mouseoutを使い、
			// 「Pin本体とその開いているPopoverを合わせて1つの論理的なhover領域」として扱う
			// (data-pin-idを持つ要素はPinGroup・LabelGroup・resize handle・Popover自身の
			// すべてに付く。updatePopover参照)。この領域内での移動(Pin⇄Popover間の移動を
			// 含む)は「hoverの継続」として無視し、領域外へ出たときだけmouseleave相当を
			// 発火する。以前は`.ipb-pin`クラスに限定していたため、PinからPopoverへポインタが
			// 移動しただけでmouseleave扱いになり即座に閉じる不具合があった(Popover自身は
			// `.ipb-pin`クラスを持たないため)。
			function findPinIdFromElement( el ) {
				if ( ! el || ! el.closest ) {
					return null;
				}
				var group = el.closest( '[data-pin-id]' );
				return group ? group.getAttribute( 'data-pin-id' ) : null;
			}
			function dispatchMouseOver( evt ) {
				var pinId = findPinId( evt );
				if ( ! pinId ) {
					return;
				}
				var fromPinId = findPinIdFromElement( evt.relatedTarget );
				if ( fromPinId === pinId ) {
					return;
				}
				if ( options.onPinMouseEnter ) {
					options.onPinMouseEnter( pinId, evt );
				}
			}
			function dispatchMouseOut( evt ) {
				var pinId = findPinId( evt );
				if ( ! pinId ) {
					return;
				}
				var toPinId = findPinIdFromElement( evt.relatedTarget );
				if ( toPinId === pinId ) {
					return;
				}
				if ( options.onPinMouseLeave ) {
					options.onPinMouseLeave( pinId, evt );
				}
			}

			function dispatchWheel( evt ) {
				if ( isWithin( evt, '[data-role="popover"]' ) ) {
					if ( options.onPopoverWheel ) {
						options.onPopoverWheel( evt );
					}
					return;
				}
				if ( options.onViewportWheel ) {
					options.onViewportWheel( evt );
				}
			}

			function dispatchKeyDown( evt ) {
				var pinId = findPinId( evt );
				if ( isWithin( evt, '[data-role="popover"]' ) && options.onPopoverKeyDown ) {
					options.onPopoverKeyDown( evt );
					return;
				}
				if ( pinId && options.onPinKeyDown ) {
					options.onPinKeyDown( pinId, evt );
				}
			}

			function dispatchFocusIn( evt ) {
				var pinId = findPinId( evt );
				if ( pinId && options.onPinFocus ) {
					options.onPinFocus( pinId, evt );
				}
			}
			function dispatchFocusOut( evt ) {
				var pinId = findPinId( evt );
				if ( pinId && options.onPinBlur ) {
					options.onPinBlur( pinId, evt );
				}
			}

			svg.addEventListener( 'pointerdown', dispatchPointerDown );
			svg.addEventListener( 'dblclick', dispatchDoubleClick );
			svg.addEventListener( 'click', dispatchClick );
			svg.addEventListener( 'mouseover', dispatchMouseOver );
			svg.addEventListener( 'mouseout', dispatchMouseOut );
			svg.addEventListener( 'wheel', dispatchWheel, { passive: false } );
			svg.addEventListener( 'keydown', dispatchKeyDown );
			svg.addEventListener( 'focusin', dispatchFocusIn );
			svg.addEventListener( 'focusout', dispatchFocusOut );

			function ensurePinEntry( pinId ) {
				if ( ! pinEntries[ pinId ] ) {
					var entry = createPinEntry( pinId );
					pinsLayer.appendChild( entry.pinGroup );
					labelsLayer.appendChild( entry.labelGroup );
					pinEntries[ pinId ] = entry;
				}
				return pinEntries[ pinId ];
			}

			// direct-jump PinはSpaceキーをg要素へ手動で貼り付けるのではなく、本物の
			// <a href="#...">でネイティブのリンク・キーボード操作(role/フォーカス/
			// Enterでの遷移)を得る(29節: "リンクへSpace起動を後付けしない")。
			// visualEl(丸Pin/Marker画像)だけをlinkEl内へ移動し、resize handleは
			// 常にpinGroup直下に留める(Editor限定の操作用UIであり、Linkの一部ではない)。
			function applyA11y( entry, pin, renderState ) {
				var group = entry.pinGroup;
				var a11y = pin.a11y || { kind: 'none' };

				group.removeAttribute( 'role' );
				group.removeAttribute( 'tabindex' );
				group.removeAttribute( 'aria-label' );
				group.removeAttribute( 'aria-expanded' );
				group.removeAttribute( 'aria-controls' );

				if ( 'link' === a11y.kind ) {
					if ( ! entry.linkEl ) {
						entry.linkEl = ns( 'a' );
						entry.linkEl.setAttribute( 'class', 'ipb-pin-link' );
						group.insertBefore( entry.linkEl, group.firstChild );
					}
					if ( entry.visualEl && entry.visualEl.parentNode !== entry.linkEl ) {
						entry.linkEl.appendChild( entry.visualEl );
					}
					entry.contentHolder = entry.linkEl;
					entry.linkEl.setAttribute( 'aria-label', a11y.label || '' );
					if ( a11y.href ) {
						entry.linkEl.setAttributeNS( XLINK_NS, 'xlink:href', a11y.href );
						entry.linkEl.setAttribute( 'href', a11y.href );
					} else {
						entry.linkEl.removeAttributeNS( XLINK_NS, 'href' );
						entry.linkEl.removeAttribute( 'href' );
					}
				} else {
					if ( entry.linkEl ) {
						if ( entry.visualEl && entry.visualEl.parentNode === entry.linkEl ) {
							group.insertBefore( entry.visualEl, entry.linkEl );
						}
						if ( entry.linkEl.parentNode ) {
							entry.linkEl.parentNode.removeChild( entry.linkEl );
						}
						entry.linkEl = null;
					}
					entry.contentHolder = group;

					if ( 'button' === a11y.kind ) {
						group.setAttribute( 'role', 'button' );
						group.setAttribute( 'tabindex', '0' );
						group.setAttribute( 'aria-label', a11y.label || '' );
						group.setAttribute( 'aria-expanded', ( renderState.openPopoverPinId === pin.id ) ? 'true' : 'false' );
						if ( a11y.controlsId ) {
							group.setAttribute( 'aria-controls', a11y.controlsId );
						}
					}
				}
				group.setAttribute( 'class', 'ipb-pin' + ( 'none' === a11y.kind ? ' ipb-pin--inert' : '' ) );
			}

			function updateSelectionAndFocusRings( model, renderState ) {
				while ( overlayLayer.firstChild ) {
					overlayLayer.removeChild( overlayLayer.firstChild );
				}
				if ( ! renderState.editorOverlay ) {
					return;
				}
				model.pins.forEach( function( pin ) {
					var isSelected = ( renderState.selectedPinId === pin.id );
					var isFocused = ( renderState.focusedPinId === pin.id );
					if ( ! isSelected && ! isFocused ) {
						return;
					}
					var r = pin.hasMarker ? Math.max( pin.visual.width, pin.visual.height ) / 2 + 4 : pin.visual.diameter / 2 + 5;
					var ring = ns( 'circle' );
					setAttrs( ring, {
						cx: pin.cx, cy: pin.cy, r: r, fill: 'none',
						stroke: isSelected ? '#1e88e5' : '#1e88e5',
						'stroke-width': isSelected ? 2 : 1,
						'stroke-dasharray': isFocused && ! isSelected ? '3,2' : undefined,
						'pointer-events': 'none',
						'class': 'ipb-selection-ring'
					} );
					overlayLayer.appendChild( ring );
				} );
			}

			var controller = {
				setModel: function( resolvedScene ) {
					currentModel = resolvedScene;
					if ( ! resolvedScene ) {
						return;
					}
					if ( resolvedScene.image && resolvedScene.image.url ) {
						setAttrs( mainImageEl, {
							x: 0, y: 0, width: resolvedScene.image.width, height: resolvedScene.image.height
						} );
						mainImageEl.setAttributeNS( XLINK_NS, 'xlink:href', resolvedScene.image.url );
						mainImageEl.setAttribute( 'href', resolvedScene.image.url );
						// viewBoxはCamera(scene-camera.js)の専属責務(30節)。setModel()は
						// setModel()が繰り返し呼ばれるドラッグ中などにZoom/Panを毎回Fitへ
						// リセットしてしまわないよう、ここでは絶対にviewBoxへ触れない
						// (初期表示・Zoom/Pan変更の反映は、必ずcontroller.setViewBox()側で行う)。
					}
					var seenIds = {};
					resolvedScene.pins.forEach( function( pin ) {
						seenIds[ pin.id ] = true;
						var entry = ensurePinEntry( pin.id );
						updateVisual( entry, Object.assign( { cx: pin.cx, cy: pin.cy }, pin.visual ) );
						updateResizeHandle( entry, pin.resizeHandle ? Object.assign( { cx: pin.cx, cy: pin.cy }, pin.resizeHandle ) : null, !! ( pin.resizeHandle && currentRenderState.editorOverlay && currentRenderState.selectedPinId === pin.id ) );
						updateLabel( entry, pin.label );
						applyA11y( entry, pin, currentRenderState );
						// a11y.kind==='none'(target・Description共に無い)でもPointer/Clickの
						// 受付自体は常にautoにする(29節)。以前はここでpointer-events:noneに
						// していたため、Editorでの選択・ドラッグや、Descriptionを後から
						// 追加する前のPinがクリックを一切受け付けない不具合があった。
						// 「何もしない」判断自体は各Controller(editor.js/view.js)が
						// target/description不在時に安全にno-opする形で既に担っており、
						// Renderer側でpointer-eventsを止める必要はない。
						entry.pinGroup.style.pointerEvents = 'auto';
						entry.labelGroup.style.pointerEvents = currentRenderState.editorOverlay ? 'auto' : 'none';
					} );
					Object.keys( pinEntries ).forEach( function( pinId ) {
						if ( ! seenIds[ pinId ] ) {
							var entry = pinEntries[ pinId ];
							if ( entry.pinGroup.parentNode ) {
								entry.pinGroup.parentNode.removeChild( entry.pinGroup );
							}
							if ( entry.labelGroup.parentNode ) {
								entry.labelGroup.parentNode.removeChild( entry.labelGroup );
							}
							delete pinEntries[ pinId ];
						}
					} );
					updatePopover( popoverEntry, resolvedScene.popover, currentRenderState.popoverScrollOffset );
					popoverEntry.group.style.pointerEvents = resolvedScene.popover ? 'auto' : 'none';
					updateSelectionAndFocusRings( resolvedScene, currentRenderState );

					lastAppliedRevision = ( 'number' === typeof resolvedScene.revision ) ? resolvedScene.revision : lastAppliedRevision;
					flushReadyWaiters();
				},
				setRenderState: function( renderState ) {
					currentRenderState = Object.assign( {}, currentRenderState, renderState );
					if ( currentModel ) {
						controller.setModel( currentModel );
					}
				},
				// Camera(natural座標のzoomPercent/centerX/centerY。scene-camera.js)から
				// viewBoxを導出して反映する。唯一のviewBox変更経路(21節・30節: Geometry/
				// Rendererの他の部分は一切viewBoxに触れない。setModel()もこれを呼ばない)。
				setCamera: function( camera ) {
					currentCamera = camera;
					if ( ! currentModel || ! currentModel.image || ! SceneCamera ) {
						return;
					}
					var box = SceneCamera.getViewBox( currentModel.image.width, currentModel.image.height, camera.zoomPercent, camera.centerX, camera.centerY );
					svg.setAttribute( 'viewBox', SceneCamera.viewBoxToAttr( box ) );
				},
				// setCamera()を経由しない、生のviewBox属性を直接指定したい場合の低レベルAPI
				// (scene-runtime.js以外からは通常使わない)。
				setViewBox: function( viewBoxAttr ) {
					svg.setAttribute( 'viewBox', viewBoxAttr );
				},
				// revision番号Nの内容が実際にDOMへ反映済みになった時点で解決するPromiseを
				// 返す(すでに反映済みなら即解決)。setModel()に渡すResolvedSceneに
				// `revision`フィールドを付けた場合のみ意味を持つ(付けなければ常に0扱い)。
				ready: function( revision ) {
					var target = revision || 0;
					return new Promise( function( resolve ) {
						if ( lastAppliedRevision >= target ) {
							resolve( lastAppliedRevision );
							return;
						}
						pendingReadyWaiters.push( { revision: target, resolve: resolve } );
					} );
				},
				// 現在Renderer自身が保持している状態のsnapshot(テスト・デバッグ用。
				// この戻り値を書き換えてもRendererの内部状態には影響しない)。
				getSnapshot: function() {
					return {
						model: currentModel,
						renderState: Object.assign( {}, currentRenderState ),
						camera: currentCamera ? Object.assign( {}, currentCamera ) : null,
						lastAppliedRevision: lastAppliedRevision
					};
				},
				getSvgElement: function() {
					return svg;
				},
				getPopoverTextElement: function() {
					return popoverEntry.text;
				},
				dispose: function() {
					svg.removeEventListener( 'pointerdown', dispatchPointerDown );
					svg.removeEventListener( 'dblclick', dispatchDoubleClick );
					svg.removeEventListener( 'click', dispatchClick );
					svg.removeEventListener( 'mouseover', dispatchMouseOver );
					svg.removeEventListener( 'mouseout', dispatchMouseOut );
					svg.removeEventListener( 'wheel', dispatchWheel );
					svg.removeEventListener( 'keydown', dispatchKeyDown );
					svg.removeEventListener( 'focusin', dispatchFocusIn );
					svg.removeEventListener( 'focusout', dispatchFocusOut );
					pendingReadyWaiters = [];
					if ( svg.parentNode ) {
						svg.parentNode.removeChild( svg );
					}
					pinEntries = {};
				}
			};

			return controller;
		}

		return {
			createScene: createScene,
			buildBubblePathD: buildBubblePathD
		};
	}
);
