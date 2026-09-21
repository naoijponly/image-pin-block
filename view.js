/**
 * Image Pin Block — Viewer Controller。
 *
 * このファイルはもはやVisual(Pin/Marker/Label/Bubble/Popover)を一切生成しない
 * (単一Renderer原則。svg-renderer.jsが唯一のVisual生成箇所)。ここに残るのは、
 * JSON payloadの解析・Runtimeのmount・Viewer状態(選択なし・Popover開閉・
 * Mobile Panel・スクロール位置・Lightbox)・PC/Mobile操作の分岐だけ。
 *
 * Frontend本体・Lightboxのいずれも、scene-runtime.js の別インスタンスを
 * mountするだけで、Visual生成コード自体は複製しない(同じAttributes・
 * それぞれ独立したCamera/RenderState)。
 *
 * ─── 削除した旧実装(29節) ───
 * applyPinScale/applyMarkerSize/positionLabelForPin/positionPopover・
 * Bubble backdrop生成・cloneNode()ベースのLightbox機構は、いずれも
 * svg-renderer.js(Renderer)・scene-runtime.js(Runtime)・scene-camera.js
 * (Camera)へ責務が移り、このファイルには存在しない。
 */
( function( i18n, SceneRuntime ) {
	'use strict';

	var __ = i18n.__;

	// style.css の @media (max-width: 600px) と必ず一致させること。
	var MOBILE_BREAKPOINT = 600;
	// Lightbox内、画像ドラッグとタップ/クリックを区別するしきい値(px)。
	var LIGHTBOX_DRAG_THRESHOLD_PX = 8;
	// Lightboxのズーム倍率変更(ホイール/+−ボタン)1回あたりの係数。
	var LIGHTBOX_WHEEL_FACTOR = 1.1;
	var LIGHTBOX_BUTTON_FACTOR = 1.3;

	function isMobileViewport() {
		return window.matchMedia( '(max-width: ' + MOBILE_BREAKPOINT + 'px)' ).matches;
	}

	// 現在の表示スケール(natural 1単位あたりのscreen px)を、svg要素自身のCTMから求める
	// (editor.jsのgetScreenPxPerNatural()と同じ理由・同じ実装。letterboxを含めた
	// 実際の変換行列を使うことで、outer rectの幅/viewBox幅という単純な比では
	// letterbox発生時に誤ったスケールになる不具合を避ける)。
	function getScreenPxPerNatural( svgEl ) {
		var ctm = svgEl.getScreenCTM();
		return ( ctm && ctm.a ) ? ctm.a : 1;
	}

	function waitForReflow( callback ) {
		if ( ! window.requestAnimationFrame ) {
			callback();
			return;
		}
		window.requestAnimationFrame( function() {
			window.requestAnimationFrame( callback );
		} );
	}

	// 縁取りの太さ(列挙値)→pxの対応。geometry.js側の値と一致させること。
	var STROKE_WIDTH_PX = { none: 0, thin: 1, normal: 2, thick: 3 };

	// Mobile Panelは「PC Popoverと同じ4項目(背景不透明度・文字色・縁取り色・縁取り太さ)を
	// 見た目にも反映する」という既存仕様を引き続き満たす(旧実装のCSSカスタムプロパティ
	// (--ipb-popover-*)と同じ値・同じソース属性を使うが、PHPはもうこれらを計算済みの
	// カスタムプロパティとして出力しないため、ここでAttributesから直接、同じ結果になる
	// inline styleを組み立てる)。
	//
	// 重要: フォールバック値はPC Popoverと異なる(11節の確定仕様はPC Popover限定であり、
	// 「Mobile Panelは既存の別UIのまま、影響を受けない」ことが明記されている)。
	// - 背景色未設定時: #f9f9f9(PC Popoverの#fffとは異なる、Mobile Panel従来の既定値)。
	// - 文字色未設定時: 何も指定しない(CSSのcolor: inheritのまま。#1e1e1eへは変更しない)。
	function applyMobilePanelStyle( panelEl, attributes ) {
		if ( ! panelEl ) {
			return;
		}
		var bgRaw = attributes.popoverBackgroundColor || '#f9f9f9';
		var bgOpacity = ( 'number' === typeof attributes.popoverBackgroundOpacity ) ? attributes.popoverBackgroundOpacity : 100;
		panelEl.style.backgroundColor = SceneRuntime.applyOpacityToColor( bgRaw, bgOpacity );
		panelEl.style.color = attributes.popoverTextColor || '';
		var strokeWidthPx = STROKE_WIDTH_PX[ attributes.popoverStrokeWidth ] || 0;
		if ( strokeWidthPx > 0 ) {
			panelEl.style.webkitTextStroke = strokeWidthPx + 'px ' + ( attributes.popoverStrokeColor || '#ffffff' );
			panelEl.style.paintOrder = 'stroke fill';
		} else {
			panelEl.style.webkitTextStroke = '';
			panelEl.style.paintOrder = '';
		}
	}

	// ─── Mobile Description Panel(Scene-external HTML。既存の別UIとして維持する。
	// 29節: SVG Sceneの内側ではなく、常にこの独立したHTML要素として表示する) ───
	// pin: Scene Model相当のPin1件分({id, description, target, ...})。
	// mobileBehavior: 'tap-jump'|'tap-tap'|'tap-link'。
	function renderMobilePanelContent( pin, mobileBehavior ) {
		var frag = document.createDocumentFragment();
		var body = document.createElement( 'div' );
		body.className = 'image-pin-block__desc-body';
		if ( 'tap-link' === mobileBehavior && pin.target ) {
			// 旧PHP実装(image-pin-block.php)と同じ仕様: 説明文全体がジャンプ用リンクになる
			// (説明とは別に追加のリンク文言を出さない)。
			var a = document.createElement( 'a' );
			a.className = 'image-pin-block__desc-link';
			a.href = '#' + pin.target;
			a.textContent = pin.description || '';
			body.appendChild( a );
		} else {
			body.textContent = pin.description || '';
		}
		frag.appendChild( body );
		return frag;
	}

	// PC Popoverの本文(<div class="image-pin-block__desc-body">説明文</div>)。
	// Popover自身のVisualはsvg-renderer.jsが描くため、ここではMobile Panelと同じ
	// 「説明文のプレーンテキスト」を保持するためだけの非表示要素は不要
	// (Popoverの文字はSVG textとして直接描かれる。Mobile Panelだけがこの
	// HTML断片を必要とする)。

	// ─── Description Interactionの唯一の判断箇所 ───
	// 「Descriptionを開く条件・Hover開始/維持/終了・Click toggle・Enter/Spaceでの
	// 活性化・Popoverスクロール」の判断ロジックは、Frontend本体とLightboxのどちらも
	// 同じ意味・同じ責務を持つ(29節: 「Frontend/Lightboxは同じInteraction semanticsを
	// 共有する」)。以前はinitBlock()本体(Frontend用)とopenLightbox()内(Lightbox用)に
	// ほぼ同一のロジックが複製されていた(handlePinActivate/lbActivatePin等)。
	// この関数を、Frontend本体・Lightboxのどちらからも呼ぶ唯一の実装にする
	// (deps.runtime/deps.mobilePanelEl等だけが呼び出し側ごとに異なる。openPinId
	// (どのPinの説明が開いているか)は、Frontend本体とLightboxでそれぞれ独立した
	// RenderStateを持つ設計(29節)と一致させるため、この関数のクロージャ内部に
	// 呼び出しごとに閉じた状態として持つ)。
	//
	// deps: {
	//   runtime: Scene Runtime(Frontend本体またはLightbox、それぞれ別インスタンス),
	//   pins: Pin配列(payloadから解析済み、Frontend/Lightboxで共有する読み取り専用データ),
	//   pcBehavior, mobileBehavior: 共通のブロック設定,
	//   mobilePanelEl, mobilePanelBodyEl: 呼び出し元ごとのMobile Panel要素,
	//   scrollToTarget: 実際のジャンプ処理(Lightboxを閉じてからscrollIntoViewする、
	//     Frontend本体・Lightbox共有の唯一の実装。呼び出し側で注入する)
	// }
	function createDescriptionInteraction( deps ) {
		var openPinId = null;

		function findPin( pinId ) {
			return deps.pins.filter( function( p ) { return p.id === pinId; } )[ 0 ] || null;
		}

		function closePopover() {
			if ( openPinId && ! isMobileViewport() ) {
				deps.runtime.setRenderState( { openPopoverPinId: null, popoverScrollOffset: 0 } );
			}
			openPinId = null;
		}

		function closeMobilePanel() {
			if ( deps.mobilePanelEl ) {
				deps.mobilePanelEl.hidden = true;
			}
			openPinId = null;
		}

		function closeAll() {
			closePopover();
			closeMobilePanel();
		}

		function openPopoverForPin( pinId ) {
			var pin = findPin( pinId );
			if ( ! pin || ! pin.description ) {
				return;
			}
			deps.runtime.setRenderState( { openPopoverPinId: pinId, popoverScrollOffset: 0 } );
			openPinId = pinId;
		}

		function openMobilePanelForPin( pinId ) {
			var pin = findPin( pinId );
			if ( ! pin || ! pin.description || ! deps.mobilePanelEl || ! deps.mobilePanelBodyEl ) {
				return;
			}
			deps.mobilePanelBodyEl.textContent = '';
			deps.mobilePanelBodyEl.appendChild( renderMobilePanelContent( pin, deps.mobileBehavior ) );
			deps.mobilePanelEl.hidden = false;
			openPinId = pinId;
		}

		// hover-clickのPC hover-preview(mouseenter/focus)。29節: Popover内容は
		// キーボードフォーカスでも同等に到達可能にする。Descriptionの有無だけで判定し、
		// targetの有無では判定しない(targetが空でもHover Description自体は有効)。
		function hoverEnter( pinId ) {
			if ( isMobileViewport() || 'hover-click' !== deps.pcBehavior ) {
				return;
			}
			openPopoverForPin( pinId );
		}
		function hoverLeave( pinId ) {
			if ( isMobileViewport() || 'hover-click' !== deps.pcBehavior ) {
				return;
			}
			if ( openPinId === pinId ) {
				closePopover();
			}
		}

		// Descriptionが空のピンは、hover-preview/tap-tap等の「説明を開く」経路自体が
		// 意味を持たないため、その場合はtargetへの直接ジャンプにフォールバックする
		// (旧実装のtemplateExistsForPinガードと同じ意図)。
		function activatePin( pinId ) {
			var pin = findPin( pinId );
			if ( ! pin ) {
				return;
			}
			if ( isMobileViewport() ) {
				if ( 'tap-jump' === deps.mobileBehavior ) {
					deps.scrollToTarget( pin.target );
					return;
				}
				var hasDescription = !! pin.description;
				if ( 'tap-tap' === deps.mobileBehavior ) {
					if ( ! hasDescription ) {
						deps.scrollToTarget( pin.target );
						return;
					}
					if ( openPinId === pinId ) {
						closeMobilePanel();
						waitForReflow( function() { deps.scrollToTarget( pin.target ); } );
					} else {
						openMobilePanelForPin( pinId );
					}
					return;
				}
				if ( 'tap-link' === deps.mobileBehavior ) {
					if ( ! hasDescription ) {
						deps.scrollToTarget( pin.target );
						return;
					}
					openMobilePanelForPin( pinId );
					return;
				}
				return;
			}

			if ( 'hover-click' === deps.pcBehavior ) {
				deps.scrollToTarget( pin.target );
				return;
			}
			if ( 'click-link' === deps.pcBehavior ) {
				if ( ! pin.description ) {
					deps.scrollToTarget( pin.target );
					return;
				}
				if ( openPinId === pinId ) {
					closePopover();
				} else {
					openPopoverForPin( pinId );
				}
			}
		}

		function handleClick( pinId, evt ) {
			evt.stopPropagation();
			activatePin( pinId );
		}

		// button種別(Popover開閉)のPinへ、Enter/Spaceでの活性化を提供する
		// (link種別はブラウザのネイティブ<a>遷移に任せる。29節)。
		function handleKeyDown( pinId, evt ) {
			if ( 'Enter' !== evt.key && ' ' !== evt.key && 'Spacebar' !== evt.key ) {
				return;
			}
			evt.preventDefault();
			activatePin( pinId );
		}

		function handlePopoverWheel( evt ) {
			evt.preventDefault();
			var current = deps.runtime.getRenderState();
			var next = Math.max( 0, ( current.popoverScrollOffset || 0 ) + ( evt.deltaY > 0 ? 20 : -20 ) );
			deps.runtime.setRenderState( { popoverScrollOffset: next } );
		}

		return {
			handleClick: handleClick,
			hoverEnter: hoverEnter,
			hoverLeave: hoverLeave,
			handleKeyDown: handleKeyDown,
			handlePopoverWheel: handlePopoverWheel,
			closeAll: closeAll,
			closePopover: closePopover,
			closeMobilePanel: closeMobilePanel
		};
	}

	function initBlock( root, options ) {
		options = options || {};
		var payloadEl = root.querySelector( '.image-pin-block__payload' );
		if ( ! payloadEl ) {
			return function dispose() {};
		}
		var attributes;
		try {
			attributes = JSON.parse( payloadEl.textContent || '{}' );
		} catch ( e ) {
			return function dispose() {};
		}
		var pins = attributes.pins || [];
		var pcBehavior = attributes.pcBehavior || 'hover-click';
		var mobileBehavior = attributes.mobileBehavior || 'tap-tap';

		var sceneHost = root.querySelector( '.image-pin-block__scene-host' );
		if ( ! sceneHost ) {
			return function dispose() {};
		}
		var mobilePanelEl = root.querySelector( '.image-pin-block__mobile-panel' );
		var mobilePanelBodyEl = mobilePanelEl ? mobilePanelEl.querySelector( '.image-pin-block__mobile-panel-body' ) : null;
		applyMobilePanelStyle( mobilePanelEl, attributes );

		function scrollToTarget( targetId ) {
			if ( ! targetId ) {
				return;
			}
			var targetEl = document.getElementById( targetId );
			if ( ! targetEl ) {
				return;
			}
			closeLightbox();
			if ( targetEl.scrollIntoView ) {
				targetEl.scrollIntoView( { behavior: 'smooth', block: 'start' } );
			} else {
				window.location.hash = targetId;
			}
		}

		// interactionのコールバック(onPinClick等)はcreateRuntime()呼び出し時に固定される
		// (svg-renderer.jsのoptions参照はdispatch時に毎回読み直すため、変数への代入自体は
		// この後でも安全)。mainInteraction自体はruntime構築後でないと作れない
		// (deps.runtimeが要る)ため、ここでは「mainInteractionという変数を後で参照する」
		// 薄いwrapperだけ渡す。
		var mainInteraction;
		var runtime = SceneRuntime.createRuntime( sceneHost, {
			editorOverlay: false,
			rendererOptions: {
				onPinClick: function( pinId, evt ) { mainInteraction.handleClick( pinId, evt ); },
				onBackgroundClick: function() { mainInteraction.closeAll(); },
				onPinMouseEnter: function( pinId ) { mainInteraction.hoverEnter( pinId ); },
				onPinMouseLeave: function( pinId ) { mainInteraction.hoverLeave( pinId ); },
				onPinFocus: function( pinId ) { mainInteraction.hoverEnter( pinId ); },
				onPinBlur: function( pinId ) { mainInteraction.hoverLeave( pinId ); },
				onPopoverWheel: function( evt ) { mainInteraction.handlePopoverWheel( evt ); },
				onPinKeyDown: function( pinId, evt ) { mainInteraction.handleKeyDown( pinId, evt ); }
			}
		} );
		runtime.setAttributes( attributes );

		mainInteraction = createDescriptionInteraction( {
			runtime: runtime,
			pins: pins,
			pcBehavior: pcBehavior,
			mobileBehavior: mobileBehavior,
			mobilePanelEl: mobilePanelEl,
			mobilePanelBodyEl: mobilePanelBodyEl,
			scrollToTarget: scrollToTarget
		} );

		// 説明文内のリンク(click-link/tap-link時、説明文全体がジャンプ用リンクになる。
		// PC Popover側はSVG内の本物の<a>、Mobile Panel側はHTMLの<a>)がクリックされた
		// 場合、target側の要素を実際に見せるためLightboxを閉じつつ、ブラウザの
		// ネイティブなハッシュ遷移自体は妨げない。
		root.addEventListener( 'click', function( evt ) {
			var link = evt.target.closest ? evt.target.closest( '.image-pin-block__desc-link, .ipb-popover-link' ) : null;
			if ( link ) {
				closeLightbox();
			}
		} );

		function handleOutsideClick( evt ) {
			if ( root.contains( evt.target ) ) {
				return;
			}
			mainInteraction.closeAll();
		}
		document.addEventListener( 'click', handleOutsideClick );

		function handleEscape( evt ) {
			if ( 'Escape' === evt.key ) {
				mainInteraction.closeAll();
			}
		}
		document.addEventListener( 'keydown', handleEscape );

		// ─── 拡大表示(Lightbox)。cloneNode()は使わず、同じAttributesを新しいhostへ
		// 独立したCamera/RenderStateでmountするだけ(29節)。Visual DOM自体は複製しない。
		var lightboxState = null;

		function closeLightbox() {
			if ( ! lightboxState ) {
				return;
			}
			var lb = lightboxState;
			lightboxState = null;
			document.removeEventListener( 'keydown', lb.onKeyDown );
			lb.runtime.dispose();
			if ( lb.overlay.parentNode ) {
				lb.overlay.parentNode.removeChild( lb.overlay );
			}
			document.body.classList.remove( 'image-pin-block__zoom-open' );
		}

		function openLightbox() {
			closeLightbox();

			var overlay = document.createElement( 'div' );
			overlay.className = 'image-pin-block__zoom-overlay';
			overlay.setAttribute( 'role', 'dialog' );
			overlay.setAttribute( 'aria-modal', 'true' );

			var stage = document.createElement( 'div' );
			stage.className = 'image-pin-block__zoom-stage';

			var lbSceneHost = document.createElement( 'div' );
			lbSceneHost.className = 'image-pin-block__scene-host image-pin-block__zoom-scene-host';

			var lbMobilePanel = null;
			var lbMobilePanelBody = null;
			if ( mobilePanelEl ) {
				lbMobilePanel = document.createElement( 'div' );
				lbMobilePanel.className = 'image-pin-block__mobile-panel';
				lbMobilePanel.hidden = true;
				lbMobilePanelBody = document.createElement( 'div' );
				lbMobilePanelBody.className = 'image-pin-block__mobile-panel-body';
				lbMobilePanel.appendChild( lbMobilePanelBody );
				applyMobilePanelStyle( lbMobilePanel, attributes );
			}

			var controls = document.createElement( 'div' );
			controls.className = 'image-pin-block__zoom-controls';
			var zoomOutBtn = document.createElement( 'button' );
			zoomOutBtn.type = 'button';
			zoomOutBtn.className = 'image-pin-block__zoom-control';
			zoomOutBtn.setAttribute( 'aria-label', __( 'Zoom out', 'image-pin-block' ) );
			zoomOutBtn.textContent = '−';
			var zoomInBtn = document.createElement( 'button' );
			zoomInBtn.type = 'button';
			zoomInBtn.className = 'image-pin-block__zoom-control';
			zoomInBtn.setAttribute( 'aria-label', __( 'Zoom in', 'image-pin-block' ) );
			zoomInBtn.textContent = '+';
			var closeBtn = document.createElement( 'button' );
			closeBtn.type = 'button';
			closeBtn.className = 'image-pin-block__zoom-control image-pin-block__zoom-close';
			closeBtn.setAttribute( 'aria-label', __( 'Close', 'image-pin-block' ) );
			closeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><line x1="2" y1="2" x2="16" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="2" x2="2" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
			controls.appendChild( zoomOutBtn );
			controls.appendChild( zoomInBtn );
			controls.appendChild( closeBtn );

			stage.appendChild( lbSceneHost );
			overlay.appendChild( stage );
			if ( lbMobilePanel ) {
				overlay.appendChild( lbMobilePanel );
			}
			overlay.appendChild( controls );
			document.body.appendChild( overlay );
			document.body.classList.add( 'image-pin-block__zoom-open' );

			// Frontend本体と同じcreateDescriptionInteraction()を、Lightbox自身の
			// runtime/mobilePanel要素で別インスタンス化する(29節: 同じInteraction
			// semanticsを共有しつつ、Camera/RenderState(openPinId含む)はFrontend本体と
			// 独立させる。以前はlbActivatePin等としてロジックそのものを複製していた)。
			var lbInteraction;
			var lbRuntime = SceneRuntime.createRuntime( lbSceneHost, {
				editorOverlay: false,
				minZoom: 100,
				rendererOptions: {
					// Lightboxのstageは画面全体の暗転オーバーレイのため、SVG自身をhostへ
					// 明示的にfillさせ、letterbox(黒背景の見える余白)を出す(svg-renderer.js参照)。
					fillHost: true,
					onPinClick: function( pinId, evt ) { lbInteraction.handleClick( pinId, evt ); },
					onBackgroundClick: function() { lbInteraction.closeAll(); },
					onPinMouseEnter: function( pinId ) { lbInteraction.hoverEnter( pinId ); },
					onPinMouseLeave: function( pinId ) { lbInteraction.hoverLeave( pinId ); },
					onPinFocus: function( pinId ) { lbInteraction.hoverEnter( pinId ); },
					onPinBlur: function( pinId ) { lbInteraction.hoverLeave( pinId ); },
					onPopoverWheel: function( evt ) { lbInteraction.handlePopoverWheel( evt ); },
					onPinKeyDown: function( pinId, evt ) { lbInteraction.handleKeyDown( pinId, evt ); }
				}
			} );
			lbRuntime.setAttributes( attributes );
			lbRuntime.resetToFit();

			lbInteraction = createDescriptionInteraction( {
				runtime: lbRuntime,
				pins: pins,
				pcBehavior: pcBehavior,
				mobileBehavior: mobileBehavior,
				mobilePanelEl: lbMobilePanel,
				mobilePanelBodyEl: lbMobilePanelBody,
				scrollToTarget: scrollToTarget
			} );

			// 拡大率の上限: 元画像の実解像度で1:1になる時点(旧実装のnaturalRatio相当)。
			// Fit状態(zoomPercent=100)でのscreen-px-per-natural値を実測し、そこから
			// 「1:1になるzoomPercent」を逆算する(letterbox・viewport縦横比に関わらず
			// 常に正しい。29節)。
			var lbSvgEl = lbRuntime.getRenderer().getSvgElement();
			var scaleAtFit = getScreenPxPerNatural( lbSvgEl );
			var maxZoom = Math.max( 100, scaleAtFit > 0 ? ( 100 / scaleAtFit ) : 100 );

			function zoomBy( factor, clientX, clientY ) {
				var current = lbRuntime.getCamera();
				var nextZoom = Math.min( maxZoom, Math.max( 100, current.zoomPercent * factor ) );
				var anchor = ( 'number' === typeof clientX ) ? lbRuntime.clientToScene( clientX, clientY ) : null;
				lbRuntime.zoomTo( nextZoom, anchor ? anchor.x : undefined, anchor ? anchor.y : undefined );
			}

			zoomOutBtn.addEventListener( 'click', function( evt ) { evt.stopPropagation(); zoomBy( 1 / LIGHTBOX_BUTTON_FACTOR ); } );
			zoomInBtn.addEventListener( 'click', function( evt ) { evt.stopPropagation(); zoomBy( LIGHTBOX_BUTTON_FACTOR ); } );
			closeBtn.addEventListener( 'click', function( evt ) { evt.stopPropagation(); closeLightbox(); } );

			stage.addEventListener( 'wheel', function( evt ) {
				evt.preventDefault();
				zoomBy( evt.deltaY < 0 ? LIGHTBOX_WHEEL_FACTOR : ( 1 / LIGHTBOX_WHEEL_FACTOR ), evt.clientX, evt.clientY );
			}, { passive: false } );

			// 1本指ドラッグ/2本指ピンチによるPan/Zoom。natural座標系のdelta/anchorへ
			// 変換するため、editor.jsのhandleViewportPointerDown/handleMarkerResizePointerDown
			// と同じ「screenPxPerNatural(現在のCTMから実測)」パターンを使う(29節: 座標変換の
			// 実装を複製しない。共通APIはrt.clientToScene()/rt.zoomTo()/rt.panBy()経由)。
			var pointers = {};
			var pinchStartDist = null;
			var pinchStartZoom = null;
			var dragState = null;
			var justDragged = false;

			function pointerIds() { return Object.keys( pointers ); }
			function pointerDistance() {
				var ids = pointerIds();
				if ( ids.length < 2 ) { return null; }
				var a = pointers[ ids[ 0 ] ], b = pointers[ ids[ 1 ] ];
				return Math.sqrt( Math.pow( a.x - b.x, 2 ) + Math.pow( a.y - b.y, 2 ) );
			}
			function pointerMidpoint() {
				var ids = pointerIds();
				if ( ids.length < 2 ) { return null; }
				var a = pointers[ ids[ 0 ] ], b = pointers[ ids[ 1 ] ];
				return { x: ( a.x + b.x ) / 2, y: ( a.y + b.y ) / 2 };
			}

			stage.addEventListener( 'pointerdown', function( evt ) {
				if ( 'mouse' === evt.pointerType && 0 !== evt.button ) {
					return;
				}
				pointers[ evt.pointerId ] = { x: evt.clientX, y: evt.clientY };
				if ( stage.setPointerCapture ) {
					try { stage.setPointerCapture( evt.pointerId ); } catch ( e ) { /* 致命的ではないため無視 */ }
				}
				var ids = pointerIds();
				if ( ids.length >= 2 ) {
					dragState = null;
					pinchStartDist = pointerDistance();
					pinchStartZoom = lbRuntime.getCamera().zoomPercent;
					return;
				}
				evt.preventDefault();
				dragState = {
					pointerId: evt.pointerId,
					startClientX: evt.clientX,
					startClientY: evt.clientY,
					startCamera: lbRuntime.getCamera(),
					screenPxPerNatural: getScreenPxPerNatural( lbSvgEl ),
					moved: false
				};
			} );

			stage.addEventListener( 'pointermove', function( evt ) {
				if ( ! pointers[ evt.pointerId ] ) {
					return;
				}
				pointers[ evt.pointerId ] = { x: evt.clientX, y: evt.clientY };

				var ids = pointerIds();
				if ( ids.length >= 2 && pinchStartDist ) {
					var dist = pointerDistance();
					var mid = pointerMidpoint();
					if ( dist && mid ) {
						var nextZoom = Math.min( maxZoom, Math.max( 100, pinchStartZoom * ( dist / pinchStartDist ) ) );
						var anchor = lbRuntime.clientToScene( mid.x, mid.y );
						lbRuntime.zoomTo( nextZoom, anchor ? anchor.x : undefined, anchor ? anchor.y : undefined );
					}
					justDragged = true;
					return;
				}

				if ( ! dragState || evt.pointerId !== dragState.pointerId ) {
					return;
				}
				var dxScreen = evt.clientX - dragState.startClientX;
				var dyScreen = evt.clientY - dragState.startClientY;
				if ( ! dragState.moved && Math.sqrt( dxScreen * dxScreen + dyScreen * dyScreen ) < LIGHTBOX_DRAG_THRESHOLD_PX ) {
					return;
				}
				dragState.moved = true;
				if ( ! dragState.screenPxPerNatural ) {
					return;
				}
				var dxNatural = -dxScreen / dragState.screenPxPerNatural;
				var dyNatural = -dyScreen / dragState.screenPxPerNatural;
				var image = lbRuntime.getSnapshot().model && lbRuntime.getSnapshot().model.image;
				if ( ! image ) {
					return;
				}
				var nextCamera = window.ImagePinBlockSceneCamera.panBy( image.width, image.height, dragState.startCamera, dxNatural, dyNatural );
				lbRuntime.setCamera( nextCamera );
			} );

			function onPointerUpOrCancel( evt ) {
				delete pointers[ evt.pointerId ];
				if ( stage.hasPointerCapture && stage.hasPointerCapture( evt.pointerId ) ) {
					stage.releasePointerCapture( evt.pointerId );
				}
				if ( pointerIds().length < 2 ) {
					pinchStartDist = null;
					pinchStartZoom = null;
				}
				if ( dragState && evt.pointerId === dragState.pointerId ) {
					justDragged = dragState.moved;
					dragState = null;
				}
			}
			stage.addEventListener( 'pointerup', onPointerUpOrCancel );
			stage.addEventListener( 'pointercancel', onPointerUpOrCancel );

			// 直前のドラッグ/ピンチに起因するclick(ピンの誤操作・誤って閉じる)を抑止する。
			overlay.addEventListener( 'click', function( evt ) {
				if ( justDragged ) {
					justDragged = false;
					evt.stopPropagation();
					evt.preventDefault();
				}
			}, true );

			// 背景(画像の外)クリックで閉じる。Scene(画像・ピン)内のクリックは無視する。
			overlay.addEventListener( 'click', function( evt ) {
				if ( lbSceneHost.contains( evt.target ) || ( lbMobilePanel && lbMobilePanel.contains( evt.target ) ) ) {
					return;
				}
				closeLightbox();
			} );

			// 説明文内のリンクがクリックされたら、遷移先を見せるためLightboxを閉じる
			// (ネイティブの遷移処理を妨げないよう、click処理が終わった直後に遅延させる)。
			overlay.addEventListener( 'click', function( evt ) {
				var link = evt.target.closest ? evt.target.closest( '.image-pin-block__desc-link, .ipb-popover-link' ) : null;
				if ( link ) {
					setTimeout( closeLightbox, 0 );
				}
			} );

			function onKeyDown( evt ) {
				if ( 'Escape' === evt.key ) {
					closeLightbox();
				}
			}
			document.addEventListener( 'keydown', onKeyDown );

			lightboxState = { overlay: overlay, onKeyDown: onKeyDown, runtime: lbRuntime };
		}

		var zoomBtn = root.querySelector( '.image-pin-block__zoom-btn' );
		if ( zoomBtn ) {
			zoomBtn.addEventListener( 'click', function( evt ) {
				evt.stopPropagation();
				openLightbox();
			} );
		}

		return function dispose() {
			document.removeEventListener( 'click', handleOutsideClick );
			document.removeEventListener( 'keydown', handleEscape );
			closeLightbox();
			runtime.dispose();
		};
	}

	function init() {
		var roots = document.querySelectorAll( '.image-pin-block' );
		roots.forEach( function( root ) {
			initBlock( root );
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )( window.wp.i18n, window.ImagePinBlockSceneRuntime );
