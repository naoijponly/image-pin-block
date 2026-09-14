( function( i18n ) {
	'use strict';

	var __ = i18n.__;

	// style.css の @media (max-width: 600px) と必ず一致させること。
	var MOBILE_BREAKPOINT = 600;

	// data-label-font-size 属性が読めない場合の最終フォールバック値。
	// image-pin-block.php の $label_font_size_default と一致させること。
	var DEFAULT_LABEL_FONT_SIZE = 12;

	// data-popover-font-size 属性が読めない場合の最終フォールバック値。
	// image-pin-block.php の $popover_font_size_default と一致させること。
	var DEFAULT_POPOVER_FONT_SIZE = 12;

	// マーカー画像の表示幅は、本体画像(data-natural-width)に対してこの割合を上限とする。
	// editor.js / image-pin-block.php の同名比率と必ず一致させること。
	var MARKER_MAX_WIDTH_RATIO = 0.5;

	// Label位置(角丸矩形経路)関連の定数。editor.js の同名定数と必ず一致させること
	// (Editor/Frontendで見た目がずれないようにするため)。
	var LABEL_PATH_MARGIN = 6;
	var LABEL_PATH_RADIUS = 10;
	var LABEL_GAP = 6;

	function clampToRange( n, min, max ) {
		return Math.min( max, Math.max( min, n ) );
	}

	// ─── Label位置(角丸矩形の外周)用の純粋なジオメトリ計算 ───
	// editor.js の同名関数と実装を同一に保つこと(コードの共有機構が無いため複製している。
	// 詳細なコメントは editor.js 側を参照)。
	function buildRoundedRectPath( rect, radius ) {
		var w = Math.max( 0, rect.width );
		var h = Math.max( 0, rect.height );
		var r = Math.max( 0, Math.min( radius, w / 2, h / 2 ) );
		var left = rect.left;
		var top = rect.top;
		var right = left + w;
		var bottom = top + h;
		var straightW = Math.max( 0, w - 2 * r );
		var straightH = Math.max( 0, h - 2 * r );

		function lineSegment( tag, x0, y0, x1, y1, nx, ny ) {
			var len = Math.sqrt( ( x1 - x0 ) * ( x1 - x0 ) + ( y1 - y0 ) * ( y1 - y0 ) );
			return {
				tag: tag,
				length: len,
				pointAt: function( f ) {
					return { x: x0 + ( x1 - x0 ) * f, y: y0 + ( y1 - y0 ) * f, nx: nx, ny: ny };
				}
			};
		}

		function arcSegment( cx, cy, startAngle, endAngle ) {
			var sweep = endAngle - startAngle;
			var len = Math.abs( sweep ) * r;
			return {
				tag: 'corner',
				length: len,
				pointAt: function( f ) {
					var angle = startAngle + sweep * f;
					var nx = Math.cos( angle );
					var ny = Math.sin( angle );
					return { x: cx + r * nx, y: cy + r * ny, nx: nx, ny: ny };
				}
			};
		}

		var segments = [];
		if ( straightW > 0 ) {
			segments.push( lineSegment( 'top', left + r, top, right - r, top, 0, -1 ) );
		}
		if ( r > 0 ) {
			segments.push( arcSegment( right - r, top + r, -Math.PI / 2, 0 ) );
		}
		if ( straightH > 0 ) {
			segments.push( lineSegment( 'right', right, top + r, right, bottom - r, 1, 0 ) );
		}
		if ( r > 0 ) {
			segments.push( arcSegment( right - r, bottom - r, 0, Math.PI / 2 ) );
		}
		if ( straightW > 0 ) {
			segments.push( lineSegment( 'bottom', right - r, bottom, left + r, bottom, 0, 1 ) );
		}
		if ( r > 0 ) {
			segments.push( arcSegment( left + r, bottom - r, Math.PI / 2, Math.PI ) );
		}
		if ( straightH > 0 ) {
			segments.push( lineSegment( 'left', left, bottom - r, left, top + r, -1, 0 ) );
		}
		if ( r > 0 ) {
			segments.push( arcSegment( left + r, top + r, Math.PI, Math.PI * 1.5 ) );
		}

		var totalLength = segments.reduce( function( sum, seg ) { return sum + seg.length; }, 0 );
		return { segments: segments, totalLength: totalLength };
	}

	function pathPointAtT( path, t ) {
		if ( path.totalLength <= 0 || ! path.segments.length ) {
			return { x: 0, y: 0, nx: 0, ny: -1 };
		}
		var tt = ( ( t % 1 ) + 1 ) % 1;
		var s = tt * path.totalLength;
		var offset = 0;
		for ( var i = 0; i < path.segments.length; i++ ) {
			var seg = path.segments[ i ];
			var isLast = ( i === path.segments.length - 1 );
			if ( s <= offset + seg.length || isLast ) {
				var f = ( seg.length > 0 ) ? clampToRange( ( s - offset ) / seg.length, 0, 1 ) : 0;
				return seg.pointAt( f );
			}
			offset += seg.length;
		}
		return path.segments[ 0 ].pointAt( 0 );
	}

	function findSegmentMidpointT( path, tag ) {
		var offset = 0;
		for ( var i = 0; i < path.segments.length; i++ ) {
			var seg = path.segments[ i ];
			if ( seg.tag === tag ) {
				var s = offset + seg.length / 2;
				return ( path.totalLength > 0 ) ? ( s / path.totalLength ) : 0;
			}
			offset += seg.length;
		}
		return null;
	}

	// labelPositionRaw: data-label-position属性からparseFloatした値(無ければNaN)。
	// hasMarker: 画像マーカーかどうか(fallback方向の判定に使う。丸マーカーは右、
	// 画像マーカーは下。editor.js の resolveLabelPosition と同じ考え方)。
	function resolveLabelPosition( labelPositionRaw, hasMarker, path ) {
		if ( typeof labelPositionRaw === 'number' && isFinite( labelPositionRaw ) ) {
			var t = labelPositionRaw % 1;
			if ( t < 0 ) {
				t += 1;
			}
			return t;
		}
		var fallback = findSegmentMidpointT( path, hasMarker ? 'bottom' : 'right' );
		return ( fallback !== null ) ? fallback : 0;
	}

	// pinLocalRect: {centerX, centerY, width, height}。labelLocalSize: {width, height}。
	// すべて実際の表示px(Zoom等の追加transformが無いフロント側では、実測値をそのまま
	// ローカル単位として扱える)。
	function computeLabelCenter( labelPositionRaw, hasMarker, pinLocalRect, labelLocalSize ) {
		var pathRect = {
			left: pinLocalRect.centerX - pinLocalRect.width / 2 - LABEL_PATH_MARGIN,
			top: pinLocalRect.centerY - pinLocalRect.height / 2 - LABEL_PATH_MARGIN,
			width: pinLocalRect.width + LABEL_PATH_MARGIN * 2,
			height: pinLocalRect.height + LABEL_PATH_MARGIN * 2
		};
		var path = buildRoundedRectPath( pathRect, LABEL_PATH_RADIUS );
		var t = resolveLabelPosition( labelPositionRaw, hasMarker, path );
		var anchor = pathPointAtT( path, t );
		var support = Math.abs( anchor.nx ) * ( labelLocalSize.width / 2 ) + Math.abs( anchor.ny ) * ( labelLocalSize.height / 2 );
		var dist = support + LABEL_GAP;
		return { x: anchor.x + anchor.nx * dist, y: anchor.y + anchor.ny * dist };
	}

	// targetEl(実際に描画されたPin/Marker本体、またはLabel自身)の実表示矩形を、
	// wrapperEl基準のローカル座標へ変換する。フロント側にはEditorのようなZoom用
	// transformレイヤーが無いため、実測値(getBoundingClientRect())がそのまま
	// ローカル単位として使える(倍率変換は不要)。
	function measureRectRelativeTo( targetEl, wrapperEl ) {
		if ( ! targetEl || ! wrapperEl ) {
			return null;
		}
		var r = targetEl.getBoundingClientRect();
		var w = wrapperEl.getBoundingClientRect();
		if ( r.width <= 0 || r.height <= 0 ) {
			return null;
		}
		return {
			centerX: r.left + r.width / 2 - w.left,
			centerY: r.top + r.height / 2 - w.top,
			width: r.width,
			height: r.height
		};
	}

	// Labelをbutton(.image-pin-block__pin)の外へ切り離し、wrapperElの直接の子として
	// position: absoluteで独立配置する(Pin本体の周囲を自由な位置で回り込めるように
	// するため)。初回のみ実行し、以後は位置の再計算のみ行う(位置計算はPin本体自体を
	// 「Label無しの状態」で測れる必要があり、Label自身がbuttonの中にflexの一員として
	// 残ったままだと、Pin本体の実際の外形を正しく測れないため)。
	function detachLabelFromPin( labelEl, wrapperEl ) {
		if ( labelEl.parentNode === wrapperEl ) {
			return;
		}
		labelEl.classList.add( 'image-pin-block__pin-label--positioned' );
		wrapperEl.appendChild( labelEl );
	}

	// pinButtonEl(.image-pin-block__pin。この時点でLabelは既に外へ切り離し済みのため、
	// 中身はPin/Marker本体のみになっている)自身の実表示矩形をPin/Markerのローカル矩形
	// として使い、labelElを角丸矩形経路上の位置へ配置する。
	function positionLabelForPin( wrapperEl, pinButtonEl, labelEl ) {
		if ( ! wrapperEl || ! pinButtonEl || ! labelEl ) {
			return;
		}
		detachLabelFromPin( labelEl, wrapperEl );
		var pinRect = measureRectRelativeTo( pinButtonEl, wrapperEl );
		var labelRect = measureRectRelativeTo( labelEl, wrapperEl );
		if ( ! pinRect || ! labelRect ) {
			return;
		}
		var hasMarker = pinButtonEl.classList.contains( 'has-marker-image' );
		var labelPositionAttr = labelEl.getAttribute( 'data-label-position' );
		var labelPositionRaw = ( null !== labelPositionAttr ) ? parseFloat( labelPositionAttr ) : NaN;
		var center = computeLabelCenter( labelPositionRaw, hasMarker, pinRect, { width: labelRect.width, height: labelRect.height } );
		labelEl.style.left = center.x + 'px';
		labelEl.style.top = center.y + 'px';
	}

	function isMobileViewport() {
		return window.matchMedia( '(max-width: ' + MOBILE_BREAKPOINT + 'px)' ).matches;
	}

	function cssEscape( value ) {
		if ( window.CSS && window.CSS.escape ) {
			return window.CSS.escape( value );
		}
		return String( value ).replace( /[^a-zA-Z0-9_-]/g, '' );
	}

	// PHP 側で用意した <template> をノードごと複製して差し込む。
	// 文字列から innerHTML を組み立てないため、XSS のリスクを増やさない。
	function cloneTemplateContent( root, selector, pinId ) {
		var tpl = root.querySelector( selector + '[data-pin-id="' + cssEscape( pinId ) + '"]' );
		if ( ! tpl ) {
			return null;
		}
		return tpl.content.cloneNode( true );
	}

	// DOM変更(高さが変わるレイアウト変更など)の直後にスクロールを開始すると、
	// 変更前の高さを基準に着地位置が計算され、ずれることがある
	// (モバイルの「1回目タップで説明/2回目タップで遷移」で、説明エリアを閉じるのと
	// スクロールが同時に走ってずれていたのがこのケース)。requestAnimationFrame を
	// 二重にネストし、変更が確実に反映されたタイミングまで待ってから callback を呼ぶ。
	function waitForReflow( callback ) {
		if ( ! window.requestAnimationFrame ) {
			callback();
			return;
		}
		window.requestAnimationFrame( function() {
			window.requestAnimationFrame( callback );
		} );
	}

	function scrollToTarget( targetId ) {
		if ( ! targetId ) {
			return;
		}
		var targetEl = document.getElementById( targetId );
		if ( ! targetEl ) {
			return;
		}
		// 拡大表示中に遷移する場合は、遷移先が見えるよう先にオーバーレイを閉じる。
		// ズームが開いていなければ何もしない。
		closeZoom();
		if ( targetEl.scrollIntoView ) {
			targetEl.scrollIntoView( { behavior: 'smooth', block: 'start' } );
		} else {
			window.location.hash = targetId;
		}
	}

	// ピンの近くにポップオーバーを配置し、画像の端からはみ出す場合は反対側へ寄せる。
	function positionPopover( popoverEl, pinEl, wrapperEl ) {
		var gap = 10;

		popoverEl.hidden = false;
		popoverEl.style.visibility = 'hidden';

		var pinLeft = pinEl.offsetLeft;
		var pinTop = pinEl.offsetTop;
		var pinW = pinEl.offsetWidth;
		var pinH = pinEl.offsetHeight;
		var wrapperW = wrapperEl.clientWidth;
		var wrapperH = wrapperEl.clientHeight;

		var popW = popoverEl.offsetWidth;
		var popH = popoverEl.offsetHeight;

		var left = pinLeft + pinW / 2 + gap;
		var top = pinTop + pinH / 2 - popH / 2;

		if ( left + popW > wrapperW ) {
			left = pinLeft - pinW / 2 - gap - popW;
		}
		if ( left < 0 ) {
			left = Math.max( 0, Math.min( pinLeft, wrapperW - popW ) );
		}
		if ( top < 0 ) {
			top = 0;
		}
		if ( top + popH > wrapperH ) {
			top = Math.max( 0, wrapperH - popH );
		}

		popoverEl.style.left = left + 'px';
		popoverEl.style.top = top + 'px';
		popoverEl.style.visibility = 'visible';
	}

	// 拡大表示。テーマのLightboxには依存せず自前実装。
	// 現在ページ上に表示されているブロック全体(.image-pin-block)を丸ごとクローンして
	// オーバーレイに挿入し、initBlock() をクローンに対して再度呼び出すことで
	// ポップオーバー表示・PC/スマホの動作・リンク遷移をそのまま再利用する。
	// ラッパー1箇所に transform:scale() を掛けるだけで、内部のピン・マーカー・
	// ラベルもまとめて比例拡大される(個別の再計算が不要)。
	// 倍率変更: PCはマウスホイール、スマホは2本指ピンチ、共通で +/- ボタン。
	// 移動: 1本指ドラッグ/スワイプ。倍率変更時はカーソル/指の中点を中心に拡縮する。
	var activeZoom = null;

	function closeZoom() {
		if ( ! activeZoom ) {
			return;
		}
		var z = activeZoom;
		activeZoom = null;
		document.removeEventListener( 'keydown', z.onKeyDown );
		if ( z.disposeClone ) {
			z.disposeClone();
		}
		if ( z.overlay.parentNode ) {
			z.overlay.parentNode.removeChild( z.overlay );
		}
		document.body.classList.remove( 'image-pin-block__zoom-open' );
	}

	function openZoom( root ) {
		closeZoom();

		var imgEl = root.querySelector( '.image-pin-block__image' );
		if ( ! imgEl ) {
			return;
		}
		var displayedRect = imgEl.getBoundingClientRect();
		if ( displayedRect.width <= 0 || displayedRect.height <= 0 ) {
			return;
		}

		// naturalRatio = 元画像の実サイズ ÷ 現在ページ上での表示サイズ。
		// これを拡大率の「上限」の基準にする(＝元画像の解像度を超えて拡大しない。
		// それ以上はただの引き伸ばしでぼやけるだけのため)。
		var naturalWidth = imgEl.naturalWidth || displayedRect.width;
		var naturalRatio = naturalWidth / displayedRect.width;
		if ( ! isFinite( naturalRatio ) || naturalRatio <= 0 ) {
			naturalRatio = 1;
		}

		// fitRatio = 画像全体がビューポートに収まる倍率(fit-to-screen)。
		// 開いた直後はこの倍率にし、これを拡大率の「下限」にもする
		// (これより縮小すると画像が画面より小さくなってしまうため)。
		// PC・スマホともに同じ考え方で統一する。
		var fitRatio = Math.min( window.innerWidth / displayedRect.width, window.innerHeight / displayedRect.height );
		if ( ! isFinite( fitRatio ) || fitRatio <= 0 ) {
			fitRatio = 1;
		}

		// 倍率の下限・上限。
		// 下限: fit-to-screen(常にこれより縮小できない)。
		// 上限: 元画像の解像度(naturalRatio)。ただし、元画像が既に画面より小さく
		// fitRatioの方が大きくなる場合は、下限=上限=fitRatioにする(矛盾を避ける)。
		var MIN_RATIO = fitRatio;
		var MAX_RATIO = Math.max( naturalRatio, fitRatio );
		var ratio = fitRatio;

		var overlay = document.createElement( 'div' );
		overlay.className = 'image-pin-block__zoom-overlay';
		overlay.setAttribute( 'role', 'dialog' );
		overlay.setAttribute( 'aria-modal', 'true' );

		var stage = document.createElement( 'div' );
		stage.className = 'image-pin-block__zoom-stage';

		var clone = root.cloneNode( true );
		clone.classList.add( 'image-pin-block__zoom-clone' );

		var cloneZoomBtn = clone.querySelector( '.image-pin-block__zoom-btn' );
		if ( cloneZoomBtn && cloneZoomBtn.parentNode ) {
			cloneZoomBtn.parentNode.removeChild( cloneZoomBtn );
		}

		var cloneWrapper = clone.querySelector( '.image-pin-block__wrapper' );
		var panX = 0;
		var panY = 0;

		function bounds() {
			var scaledW = displayedRect.width * ratio;
			var scaledH = displayedRect.height * ratio;
			return {
				maxX: Math.max( 0, ( scaledW - window.innerWidth ) / 2 ),
				maxY: Math.max( 0, ( scaledH - window.innerHeight ) / 2 )
			};
		}

		function clampPan() {
			var b = bounds();
			panX = Math.min( b.maxX, Math.max( -b.maxX, panX ) );
			panY = Math.min( b.maxY, Math.max( -b.maxY, panY ) );
		}

		function applyTransform() {
			if ( cloneWrapper ) {
				cloneWrapper.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + ratio + ')';
			}
		}

		// 倍率を変更する。anchorX/Y(画面座標)を指定すると、その点を中心に拡縮する
		// (ホイール/ピンチの場合はカーソル・指の位置、指定が無ければ画面中央)。
		// 縮小して画像が画面に収まる大きさになった場合は clampPan() が移動量を0にする。
		function setRatio( nextRatio, anchorX, anchorY ) {
			nextRatio = Math.min( MAX_RATIO, Math.max( MIN_RATIO, nextRatio ) );
			if ( nextRatio === ratio ) {
				return;
			}
			var centerX = window.innerWidth / 2;
			var centerY = window.innerHeight / 2;
			var ax = ( typeof anchorX === 'number' ) ? anchorX : centerX;
			var ay = ( typeof anchorY === 'number' ) ? anchorY : centerY;
			var change = nextRatio / ratio;
			panX = ax - centerX - ( ax - centerX - panX ) * change;
			panY = ay - centerY - ( ay - centerY - panY ) * change;
			ratio = nextRatio;
			clampPan();
			applyTransform();
		}

		if ( cloneWrapper ) {
			// クローンを現在の表示サイズに固定してから scale() で拡大する。
			// (%位置・px指定のピンサイズは、この土台サイズを基準に計算済みのため、
			// 丸ごと scale() すれば位置関係・比率を保ったまま拡大できる)
			cloneWrapper.style.width = displayedRect.width + 'px';
			cloneWrapper.style.height = displayedRect.height + 'px';
			cloneWrapper.style.transformOrigin = 'center center';
			// クローン内の img はネイティブなドラッグ(画像の持ち出し)の対象にしない。
			// 左クリックドラッグでの移動と競合するため。
			var cloneImgs = clone.querySelectorAll( 'img' );
			cloneImgs.forEach( function( img ) {
				img.setAttribute( 'draggable', 'false' );
			} );
			applyTransform();
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

		// +/- ボタンはオーバーレイの「背景クリックで閉じる」対象にしない。
		zoomOutBtn.addEventListener( 'click', function( evt ) {
			evt.stopPropagation();
			setRatio( ratio / 1.3 );
		} );
		zoomInBtn.addEventListener( 'click', function( evt ) {
			evt.stopPropagation();
			setRatio( ratio * 1.3 );
		} );

		controls.appendChild( zoomOutBtn );
		controls.appendChild( zoomInBtn );
		controls.appendChild( closeBtn );

		stage.appendChild( clone );
		overlay.appendChild( stage );
		overlay.appendChild( controls );
		document.body.appendChild( overlay );
		document.body.classList.add( 'image-pin-block__zoom-open' );

		var disposeClone = initBlock( clone );

		// ズーム内で「説明内のリンク」(ネイティブなアンカー遷移)がクリックされたら、
		// 遷移先が隠れたままにならないようオーバーレイを閉じる。ネイティブの遷移処理を
		// 妨げないよう、DOMの変更は click イベントの処理が終わった直後に遅延させる。
		clone.addEventListener( 'click', function( evt ) {
			var link = evt.target.closest ? evt.target.closest( '.image-pin-block__desc-link' ) : null;
			if ( link ) {
				setTimeout( closeZoom, 0 );
			}
		} );

		var DRAG_THRESHOLD = 8;
		var dragState = null;
		var justDragged = false;

		// 2本指ピンチの状態(同時に押されている2点の距離・中点を追跡する)。
		var pointers = {};
		var pinchStartDist = null;
		var pinchStartRatio = null;

		function pointerIds() {
			return Object.keys( pointers );
		}

		function pointerDistance() {
			var ids = pointerIds();
			if ( ids.length < 2 ) {
				return null;
			}
			var a = pointers[ ids[ 0 ] ];
			var b = pointers[ ids[ 1 ] ];
			return Math.sqrt( Math.pow( a.x - b.x, 2 ) + Math.pow( a.y - b.y, 2 ) );
		}

		function pointerMidpoint() {
			var ids = pointerIds();
			if ( ids.length < 2 ) {
				return null;
			}
			var a = pointers[ ids[ 0 ] ];
			var b = pointers[ ids[ 1 ] ];
			return { x: ( a.x + b.x ) / 2, y: ( a.y + b.y ) / 2 };
		}

		function onPointerDown( evt ) {
			// 右クリック・中クリックは無視し、通常のコンテキストメニュー等に任せる。
			if ( evt.pointerType === 'mouse' && evt.button !== 0 ) {
				return;
			}

			pointers[ evt.pointerId ] = { x: evt.clientX, y: evt.clientY };
			if ( stage.setPointerCapture ) {
				try {
					stage.setPointerCapture( evt.pointerId );
				} catch ( e ) {
					// setPointerCapture が失敗しても致命的ではないため無視する。
				}
			}

			var ids = pointerIds();
			if ( ids.length >= 2 ) {
				// 2本目が触れた時点でピンチ開始。単一指ドラッグの状態は解除する。
				dragState = null;
				pinchStartDist = pointerDistance();
				pinchStartRatio = ratio;
				return;
			}

			// 左クリックドラッグ時、画像のネイティブなドラッグ(持ち出し)を抑止する。
			evt.preventDefault();
			dragState = {
				pointerId: evt.pointerId,
				startX: evt.clientX,
				startY: evt.clientY,
				startPanX: panX,
				startPanY: panY,
				moved: false
			};
		}

		function onPointerMove( evt ) {
			if ( ! pointers[ evt.pointerId ] ) {
				return;
			}
			pointers[ evt.pointerId ] = { x: evt.clientX, y: evt.clientY };

			var ids = pointerIds();
			if ( ids.length >= 2 && pinchStartDist ) {
				var dist = pointerDistance();
				var mid = pointerMidpoint();
				if ( dist && mid ) {
					setRatio( pinchStartRatio * ( dist / pinchStartDist ), mid.x, mid.y );
				}
				justDragged = true;
				return;
			}

			if ( ! dragState || evt.pointerId !== dragState.pointerId ) {
				return;
			}
			var dx = evt.clientX - dragState.startX;
			var dy = evt.clientY - dragState.startY;
			// 一定距離動くまでは「ドラッグ」と判定しない(ピンのクリック/タップを誤って邪魔しない)。
			if ( ! dragState.moved && Math.sqrt( dx * dx + dy * dy ) < DRAG_THRESHOLD ) {
				return;
			}
			dragState.moved = true;
			panX = dragState.startPanX + dx;
			panY = dragState.startPanY + dy;
			clampPan();
			applyTransform();
		}

		function onPointerUp( evt ) {
			delete pointers[ evt.pointerId ];
			if ( stage.hasPointerCapture && stage.hasPointerCapture( evt.pointerId ) ) {
				stage.releasePointerCapture( evt.pointerId );
			}
			if ( pointerIds().length < 2 ) {
				pinchStartDist = null;
				pinchStartRatio = null;
			}
			if ( dragState && evt.pointerId === dragState.pointerId ) {
				justDragged = dragState.moved;
				dragState = null;
			}
		}

		stage.addEventListener( 'pointerdown', onPointerDown );
		stage.addEventListener( 'pointermove', onPointerMove );
		stage.addEventListener( 'pointerup', onPointerUp );
		stage.addEventListener( 'pointercancel', onPointerUp );

		// PCのマウスホイールでの拡大・縮小(カーソル位置を中心にする)。
		stage.addEventListener( 'wheel', function( evt ) {
			evt.preventDefault();
			var factor = evt.deltaY < 0 ? 1.1 : ( 1 / 1.1 );
			setRatio( ratio * factor, evt.clientX, evt.clientY );
		}, { passive: false } );

		// 直前のドラッグ/ピンチに起因する click(ピンの誤操作・誤って閉じる)をキャプチャ段階で抑止する。
		overlay.addEventListener( 'click', function( evt ) {
			if ( justDragged ) {
				justDragged = false;
				evt.stopPropagation();
				evt.preventDefault();
			}
		}, true );

		// 背景(画像の外)クリックで閉じる。クローンの内側(画像・ピン)のクリックは無視する。
		overlay.addEventListener( 'click', function( evt ) {
			if ( clone.contains( evt.target ) ) {
				return;
			}
			closeZoom();
		} );

		function onKeyDown( evt ) {
			if ( evt.key === 'Escape' ) {
				closeZoom();
			}
		}
		document.addEventListener( 'keydown', onKeyDown );

		activeZoom = {
			overlay: overlay,
			onKeyDown: onKeyDown,
			disposeClone: disposeClone
		};
	}

	// pinSize/markerScale/フォントサイズ系はすべて画像の元解像度(data-natural-width)を
	// 基準にした値としてPHP側で出力されているため、実際の表示幅との比率をかけてから
	// 描画する。clientWidth はレイアウト上の幅で transform の影響を受けないため、
	// 拡大表示(transform: scale() でクローン全体を拡大する)の中で呼んでも二重に
	// 拡縮されない。applyPinScale() と openPopoverForPin() の両方から使うため
	// 共通化している。
	function getWidthRatio( wrapperEl ) {
		var naturalWidth = parseFloat( wrapperEl.getAttribute( 'data-natural-width' ) ) || 0;
		var currentWidth = wrapperEl.clientWidth;
		return ( naturalWidth > 0 && currentWidth > 0 ) ? ( currentWidth / naturalWidth ) : 1;
	}

	function applyPinScale( wrapperEl ) {
		if ( ! wrapperEl ) {
			return;
		}
		var ratio = getWidthRatio( wrapperEl );
		var labelFontSizeBase = parseFloat( wrapperEl.getAttribute( 'data-label-font-size' ) ) || DEFAULT_LABEL_FONT_SIZE;
		var naturalWidth = parseFloat( wrapperEl.getAttribute( 'data-natural-width' ) ) || 0;

		wrapperEl.querySelectorAll( '.image-pin-block__pin-dot' ).forEach( function( dot ) {
			var base = parseFloat( dot.getAttribute( 'data-pin-size' ) ) || 0;
			if ( base > 0 ) {
				var size = ( base * ratio ) + 'px';
				dot.style.width = size;
				dot.style.height = size;
			}
		} );

		// 丸マーカーのLabel位置。画像マーカー側(非同期になりうるnaturalWidth取得後)とは
		// 別に、ここでは丸マーカーの実サイズが確定済み(同期的)であるこの時点で位置を
		// 確定できる。
		wrapperEl.querySelectorAll( '.image-pin-block__pin:not(.has-marker-image)' ).forEach( function( pinButtonEl ) {
			var pinId = pinButtonEl.getAttribute( 'data-pin-id' );
			var labelEl = pinId ? wrapperEl.querySelector( '.image-pin-block__pin-label[data-pin-id="' + cssEscape( pinId ) + '"]' ) : null;
			if ( labelEl ) {
				positionLabelForPin( wrapperEl, pinButtonEl, labelEl );
			}
		} );

		// マーカー画像は、実寸(naturalWidth)に対する markerScale(%) を、本体画像の
		// MARKER_MAX_WIDTH_RATIO を上限としてクランプした実寸px幅で表示する。
		// transform: scale() だけに頼ると、レイアウト上のサイズ(=ボタン要素の当たり判定)が
		// 縮小前の原寸のまま残ってしまい、マーカー画像が本体画像と同等以上の解像度の場合に
		// ポインタイベントを奪ってしまうため(ドラッグ・他のピンの操作が破綻する不具合の原因だった)。
		wrapperEl.querySelectorAll( '.image-pin-block__pin-marker-image' ).forEach( function( img ) {
			function applyMarkerSize() {
				var markerNaturalWidth = img.naturalWidth || 0;
				if ( markerNaturalWidth <= 0 ) {
					return;
				}
				var basePct = parseFloat( img.getAttribute( 'data-marker-scale' ) );
				if ( isNaN( basePct ) ) {
					basePct = 100;
				}
				var idealWidth = markerNaturalWidth * ( basePct / 100 );
				var maxBaseWidth = naturalWidth * MARKER_MAX_WIDTH_RATIO;
				var baseWidth = ( maxBaseWidth > 0 ) ? Math.min( idealWidth, maxBaseWidth ) : idealWidth;
				img.style.width = ( baseWidth * ratio ) + 'px';
				img.style.height = 'auto';
				// PHP側の no-JS フォールバック用インラインスタイル(transform/max-width)を
				// 上記の実寸指定で完全に上書きする(二重に縮小・拡大されないようにするため)。
				img.style.transform = '';
				img.style.maxWidth = '';

				// 画像マーカーのLabel位置は、マーカー画像の最終サイズ(上記)が確定した
				// 直後(同期・非同期どちらの経路でも)に計算する。先にサイズを確定させないと、
				// Pin本体(button)自身の実測サイズがまだno-JSフォールバック時の値のままになる。
				var pinButtonEl = img.closest( '.image-pin-block__pin' );
				var pinId = pinButtonEl ? pinButtonEl.getAttribute( 'data-pin-id' ) : null;
				var labelEl = pinId ? wrapperEl.querySelector( '.image-pin-block__pin-label[data-pin-id="' + cssEscape( pinId ) + '"]' ) : null;
				if ( pinButtonEl && labelEl ) {
					positionLabelForPin( wrapperEl, pinButtonEl, labelEl );
				}
			}
			if ( img.complete && img.naturalWidth ) {
				applyMarkerSize();
			} else {
				img.addEventListener( 'load', applyMarkerSize, { once: true } );
			}
		} );

		wrapperEl.querySelectorAll( '.image-pin-block__pin-label' ).forEach( function( label ) {
			label.style.fontSize = ( labelFontSizeBase * ratio ) + 'px';
		} );
	}

	function initBlock( root ) {
		var pcBehavior = root.getAttribute( 'data-pc-behavior' ) || 'hover-click';
		var mobileBehavior = root.getAttribute( 'data-mobile-behavior' ) || 'tap-tap';

		var wrapperEl = root.querySelector( '.image-pin-block__wrapper' );
		var popoverEl = root.querySelector( '.image-pin-block__popover' );
		var popoverBodyEl = popoverEl ? popoverEl.querySelector( '.image-pin-block__popover-body' ) : null;
		var mobilePanelEl = root.querySelector( '.image-pin-block__mobile-panel' );
		var mobilePanelBodyEl = mobilePanelEl ? mobilePanelEl.querySelector( '.image-pin-block__mobile-panel-body' ) : null;
		var pinEls = root.querySelectorAll( '.image-pin-block__pin' );

		var openPinId = null;

		function closePopover() {
			if ( popoverEl ) {
				popoverEl.hidden = true;
			}
			openPinId = null;
		}

		function closeMobilePanel() {
			if ( mobilePanelEl ) {
				mobilePanelEl.hidden = true;
			}
			openPinId = null;
		}

		function closeAll() {
			closePopover();
			closeMobilePanel();
		}

		function openPopoverForPin( pinEl ) {
			if ( ! popoverEl || ! popoverBodyEl || ! wrapperEl ) {
				return;
			}
			var pinId = pinEl.getAttribute( 'data-pin-id' );
			var content = cloneTemplateContent( root, '.image-pin-block__tpl-pc', pinId );
			if ( ! content ) {
				return;
			}
			popoverBodyEl.textContent = '';
			popoverBodyEl.appendChild( content );
			// positionPopover() は popoverEl の offsetWidth/offsetHeight を実測して位置を
			// 決めるため、文字サイズは必ず先に確定させる(後から変えると、文字サイズによって
			// 変わる幅・高さ分だけ位置がずれる)。Mobile説明エリア(mobilePanelEl)は対象外
			// (現状どおり文字サイズを変更しない)。
			var popoverFontSizeBase = parseFloat( wrapperEl.getAttribute( 'data-popover-font-size' ) ) || DEFAULT_POPOVER_FONT_SIZE;
			popoverEl.style.fontSize = ( popoverFontSizeBase * getWidthRatio( wrapperEl ) ) + 'px';
			positionPopover( popoverEl, pinEl, wrapperEl );
			openPinId = pinId;
		}

		function openMobilePanelForPin( pinEl ) {
			if ( ! mobilePanelEl || ! mobilePanelBodyEl ) {
				return;
			}
			var pinId = pinEl.getAttribute( 'data-pin-id' );
			var content = cloneTemplateContent( root, '.image-pin-block__tpl-mobile', pinId );
			if ( ! content ) {
				return;
			}
			mobilePanelBodyEl.textContent = '';
			mobilePanelBodyEl.appendChild( content );
			mobilePanelEl.hidden = false;
			openPinId = pinId;
		}

		pinEls.forEach( function( pinEl ) {
			var pinId = pinEl.getAttribute( 'data-pin-id' );
			var targetId = pinEl.getAttribute( 'data-target' );

			pinEl.addEventListener( 'mouseenter', function() {
				if ( isMobileViewport() ) {
					return;
				}
				if ( pcBehavior === 'hover-click' ) {
					openPopoverForPin( pinEl );
				}
			} );

			pinEl.addEventListener( 'mouseleave', function() {
				if ( isMobileViewport() ) {
					return;
				}
				if ( pcBehavior === 'hover-click' && openPinId === pinId ) {
					closePopover();
				}
			} );

			pinEl.addEventListener( 'click', function( evt ) {
				evt.stopPropagation();

				if ( isMobileViewport() ) {
					if ( mobileBehavior === 'tap-jump' ) {
						scrollToTarget( targetId );
						return;
					}
					if ( mobileBehavior === 'tap-tap' ) {
						if ( openPinId === pinId ) {
							// 説明エリアを閉じるとページの高さが変わる(画像の直下に
							// ブロック要素として挿入されているため)。閉じるのとスクロールが
							// 同時に走ると、高さが変化している最中に着地位置が計算されて
							// ずれるので、レイアウトが確定してからスクロールを開始する。
							closeMobilePanel();
							waitForReflow( function() {
								scrollToTarget( targetId );
							} );
						} else {
							openMobilePanelForPin( pinEl );
						}
						return;
					}
					if ( mobileBehavior === 'tap-link' ) {
						openMobilePanelForPin( pinEl );
						return;
					}
					return;
				}

				if ( pcBehavior === 'hover-click' ) {
					scrollToTarget( targetId );
					return;
				}
				if ( pcBehavior === 'click-link' ) {
					if ( openPinId === pinId ) {
						closePopover();
					} else {
						openPopoverForPin( pinEl );
					}
					return;
				}
			} );
		} );

		var zoomBtn = root.querySelector( '.image-pin-block__zoom-btn' );
		if ( zoomBtn ) {
			zoomBtn.addEventListener( 'click', function( evt ) {
				evt.stopPropagation();
				openZoom( root );
			} );
		}

		function handleOutsideClick( evt ) {
			if ( root.contains( evt.target ) ) {
				return;
			}
			closeAll();
		}
		document.addEventListener( 'click', handleOutsideClick );

		applyPinScale( wrapperEl );
		var resizeObserver = null;
		if ( wrapperEl && window.ResizeObserver ) {
			resizeObserver = new window.ResizeObserver( function() {
				applyPinScale( wrapperEl );
			} );
			resizeObserver.observe( wrapperEl );
		}

		// 拡大表示用にクローンへ initBlock() を再度呼ぶ際、クローンが破棄されても
		// document のリスナーや ResizeObserver が残り続けないよう、後始末できる関数を返す。
		return function dispose() {
			document.removeEventListener( 'click', handleOutsideClick );
			if ( resizeObserver ) {
				resizeObserver.disconnect();
			}
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
} )( window.wp.i18n );
