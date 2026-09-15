( function( blocks, element, blockEditor, components, data, i18n ) {
	var el = element.createElement;
	var useState = element.useState;
	var useRef = element.useRef;
	var useEffect = element.useEffect;
	// Label位置の実測(DOM measurement)をペイント前に確定させ、誤った位置が一瞬
	// 見える(flash)のを防ぐために使う。無い環境(理論上ほぼ無い)ではuseEffectへ
	// フォールバックする(その場合、極めて稀に1フレームだけ古い位置が見える可能性がある
	// だけで、致命的な不具合にはならない)。
	var useLayoutEffect = element.useLayoutEffect || useEffect;
	var registerBlockType = blocks.registerBlockType;
	var useBlockProps = blockEditor.useBlockProps;
	var InspectorControls = blockEditor.InspectorControls;
	var MediaUpload = blockEditor.MediaUpload;
	var MediaUploadCheck = blockEditor.MediaUploadCheck;
	var PanelColorSettings = blockEditor.PanelColorSettings;
	var PanelBody = components.PanelBody;
	var Modal = components.Modal;
	var Button = components.Button;
	var TextControl = components.TextControl;
	var TextareaControl = components.TextareaControl;
	var SelectControl = components.SelectControl;
	var CheckboxControl = components.CheckboxControl;
	var RangeControl = components.RangeControl;
	var Tooltip = components.Tooltip;
	var Dropdown = components.Dropdown;
	var ColorPicker = components.ColorPicker;
	var useSelect = data.useSelect;
	var __ = i18n.__;

	var DEFAULT_MARKER_SCALE = 100;
	// block.json の attributes.default、および image-pin-block.php の同名の
	// 上限・下限と必ず一致させること(フロント側と編集画面のプレビューがずれないように)。
	var MARKER_SCALE_MIN = 1;
	var MARKER_SCALE_MAX = 500;
	// pinSize/labelFontSize が無効な場合の最終フォールバック値(値が壊れている場合のみ使用)。
	// 通常は画像選択時に imageWidth を基準に自動計算された値が使われる(下記 AUTO_RATIO 参照)。
	var DEFAULT_PIN_SIZE = 24;
	var PIN_SIZE_MIN = 4;
	var PIN_SIZE_MAX = 300;
	// 画像選択時、pinSize が未設定(0)であれば imageWidth のこの割合を初期値にする。
	var PIN_SIZE_AUTO_RATIO = 0.025;
	var DEFAULT_PIN_COLOR = '#e63946';
	var DEFAULT_LABEL_BG_COLOR = 'rgba(255,255,255,0.9)';
	var DEFAULT_LABEL_TEXT_COLOR = '#1e1e1e';
	// ラベルの文字サイズ(px、画像の元解像度を基準とした値)。block.json の
	// attributes.default、および image-pin-block.php の同名の上限・下限と必ず一致させること。
	var DEFAULT_LABEL_FONT_SIZE = 12;
	var LABEL_FONT_SIZE_MIN = 6;
	var LABEL_FONT_SIZE_MAX = 200;
	// 画像選択時、labelFontSize が未設定(0)であれば imageWidth のこの割合を初期値にする。
	var LABEL_FONT_SIZE_AUTO_RATIO = 0.015;
	// ポップオーバーの文字サイズ(px、画像の元解像度を基準とした値)。ラベルとは独立して
	// 将来調整できるよう、値はラベルと同一(初期値)でも定数名はPopover専用にする。
	// block.json の attributes.default、および image-pin-block.php の同名の
	// 上限・下限と必ず一致させること。
	var DEFAULT_POPOVER_FONT_SIZE = 12;
	var POPOVER_FONT_SIZE_MIN = 6;
	var POPOVER_FONT_SIZE_MAX = 200;
	// 画像選択時、popoverFontSize が未設定(0)であれば imageWidth のこの割合を初期値にする。
	var POPOVER_FONT_SIZE_AUTO_RATIO = 0.015;
	// マーカー画像の表示幅は、本体画像(imageWidth)に対してこの割合を上限とする。
	// markerScale(%)がどんな値でも、最終的な表示幅がこれを超えないようクランプする。
	// image-pin-block.php / view.js の同名比率と必ず一致させること。
	var MARKER_MAX_WIDTH_RATIO = 0.5;
	// マーカー画像のドラッグリサイズ時、表示幅(px、画面上の実サイズ)がこれより
	// 小さくならないようにする下限(v0.1.x系から復元)。
	var MARKER_MIN_DISPLAY_WIDTH_PX = 20;
	// リサイズハンドルの一辺の長さ(px)。マーカー画像の表示幅の40%を目安にしつつ、
	// 「小さすぎて掴めない」(下限8px)/「マーカー画像より目立って大きい」(上限18px)の
	// 両方を避けるようクランプする(v0.1.x系から復元)。
	var MARKER_RESIZE_HANDLE_RATIO = 0.4;
	var MARKER_RESIZE_HANDLE_MIN_PX = 8;
	var MARKER_RESIZE_HANDLE_MAX_PX = 18;
	// モーダル内Preview viewportの表示倍率(見た目のズームのみ。保存される値には影響しない)。
	// 100%は「元画像の原寸」ではなく「Preview viewportへ画像全体を最大Fitした状態」を指す。
	// 100%未満への縮小はできない(Fit状態が最低表示倍率)。
	var MODAL_ZOOM_MIN = 100;
	var MODAL_ZOOM_MAX = 200;
	var MODAL_ZOOM_DEFAULT = 100;
	// Preview viewport自体の縦横比。今回は16:9固定。将来的に選択可能にする可能性を
	// 見込み、この比率をロジックから独立した定数として持つ(block属性化はしない)。
	var MODAL_PREVIEW_ASPECT_RATIO = 16 / 9;
	// 画像クリックとPreview内ドラッグ(Pan)を区別するしきい値(px)。この量未満の
	// pointer移動はクリック(ピン追加)、以上の移動はPan操作とみなす。
	var PAN_CLICK_THRESHOLD_PX = 5;
	// 新規ピンを複製したとき、元のピンと重ならないようにずらす量(%)。
	var DUPLICATE_OFFSET_PERCENT = 4;
	// Label位置(Pin/Marker+Label寸法込みの「安全矩形」を小さく角丸化した軌道)関連。
	// すべてローカル単位(Fit適用後・Zoom適用前のpx。Zoomはimage wrapper自体への
	// transform: scale()で別途掛かるため、ここに含めない)。
	// 経緯: 260914 角丸矩形(弧長ベース) → 260915 Pin/Marker外接円(角度ベース。
	// ただしLabel自身のサイズを角度依存のsupport distanceとして加算していたため、
	// 真円上を移動する際に数か所で外側へ「ぽこっ」と膨らんで見えた) → 260916 真円化
	// (support distanceを角度非依存の一定値labelRadiusへ置き換えたが、今度は横長の
	// Labelで上下方向に必要以上へ離れてしまう問題が残った) → 260917 現在の方式
	// (Label寸法を最初から「安全矩形」自体に含め、その矩形を小さく角丸化した軌道へ
	// angle方向のrayを当てて交点を求める。位置決定後にsupport distance等でさらに
	// 外側へ押し出す処理は行わない)。labelPositionの保存形式・意味
	// (0以上1未満の一周する連続値。0=右, 0.25=下, 0.5=左, 0.75=上)は最初から変更していない。
	// LABEL_GAP: 安全矩形自体に含める、Pin/MarkerとLabelの間の追加の余白。
	var LABEL_GAP = 6;
	// LABEL_SAFE_CORNER_RADIUS_*: 安全矩形の角を丸めるための半径。あくまで90度の
	// 方向転換を見た目上滑らかにするためだけの小さい値であり、Pin/MarkerやLabelの
	// 寸法(特にlabelWidth)からは意図的に算出しない(横長Labelでも角丸が巨大化しない
	// ようにするため)。labelHeightを基準にした小さい比率+min/maxクランプとする。
	// 値の調整はここ1箇所で行う。
	var LABEL_SAFE_CORNER_RADIUS_RATIO = 0.22;
	var LABEL_SAFE_CORNER_RADIUS_MIN = 4;
	var LABEL_SAFE_CORNER_RADIUS_MAX = 14;
	// labelPositionが未設定の既存ピンのfallback位置(角度をlabelPositionと同じ
	// 0〜1の値で表したもの。0=右、0.25=下、0.5=左、0.75=上)。丸マーカーは右、
	// 画像マーカーは下、という以前からの見た目に合わせている。
	var LABEL_POSITION_FALLBACK_ROUND = 0;
	var LABEL_POSITION_FALLBACK_MARKER = 0.25;

	// ラベル背景の不透明度(0〜100)。デフォルト100(=変更なし)。
	var DEFAULT_BG_OPACITY = 100;
	// 縁取り色のデフォルト。太さが 'none' のときは実際には使われない。
	var DEFAULT_STROKE_COLOR = '#ffffff';
	var STROKE_WIDTHS = [ 'none', 'thin', 'normal', 'thick' ];
	var DEFAULT_STROKE_WIDTH = 'none';
	// 縁取りの太さ(列挙値)→px の対応。image-pin-block.php / style.css の
	// data-label-stroke-width / data-popover-stroke-width の対応表と必ず一致させること。
	var STROKE_WIDTH_PX = { none: 0, thin: 1, normal: 2, thick: 3 };
	// ポップオーバーの背景色が未設定のときに、不透明度の計算に使う実効的な基準色。
	// style.css の .image-pin-block__popover の既定背景(#fff)と必ず一致させること。
	var DEFAULT_POPOVER_BG_BASE = '#ffffff';

	function clampToRange( n, min, max ) {
		return Math.min( max, Math.max( min, n ) );
	}

	// ─── モーダルのPreview/Zoom/Pan用の純粋なジオメトリ計算 ───
	// イベントハンドラへ式をベタ書きせず、Fit/Pan/当たり判定の責務をここに分離する。

	// 利用可能な領域(hostWidth × hostHeight)へ、aspectRatio(幅÷高さ)のPreview
	// viewportを最大containしたサイズを返す。viewport自体の比率は常に一定に保たれる
	// (画像を変形するのではなく、viewportの外形サイズをhostへ収める)。
	function fitAspectRatioIntoRect( hostWidth, hostHeight, aspectRatio ) {
		if ( hostWidth <= 0 || hostHeight <= 0 || aspectRatio <= 0 ) {
			return { width: 0, height: 0 };
		}
		if ( hostWidth / hostHeight >= aspectRatio ) {
			return { width: hostHeight * aspectRatio, height: hostHeight };
		}
		return { width: hostWidth, height: hostWidth / aspectRatio };
	}

	// viewport(px)へ画像(natural size)全体を最大Fitさせる倍率。1.0で上限クランプは
	// 行わない(Previewより小さい画像も、Previewに合わせて拡大する)。
	function calculateImageFitRatio( viewportWidth, viewportHeight, naturalWidth, naturalHeight ) {
		if ( viewportWidth <= 0 || viewportHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0 ) {
			return 1;
		}
		return Math.min( viewportWidth / naturalWidth, viewportHeight / naturalHeight );
	}

	// 現在の表示サイズ(Zoom適用後)とviewportのサイズから、Pan可能な最大量(中心から
	// 片側への量)を軸ごとに計算する。表示サイズがviewport以下の軸は0になり、その軸は
	// 中心固定(Pan不可)になる。
	function calculatePanBounds( displayWidth, displayHeight, viewportWidth, viewportHeight ) {
		return {
			maxPanX: Math.max( 0, ( displayWidth - viewportWidth ) / 2 ),
			maxPanY: Math.max( 0, ( displayHeight - viewportHeight ) / 2 )
		};
	}

	// Pan位置をboundsの範囲(-max〜+max)へ軸ごとにクランプする。
	function clampPan( pan, bounds ) {
		return {
			x: clampToRange( pan.x, -bounds.maxPanX, bounds.maxPanX ),
			y: clampToRange( pan.y, -bounds.maxPanY, bounds.maxPanY )
		};
	}

	// client座標(ビューポート基準px)が、指定した矩形(getBoundingClientRect()の
	// 結果)の内部(境界含む)かどうかを判定する。黒いletterbox部分でのピン追加を
	// 防ぐために、実際の画像の矩形との内外判定に使う(0〜100%へのクランプでは
	// 「画像の外」を「画像の端」に丸めてしまい、判定できないため)。
	function isPointInsideRect( clientX, clientY, rect ) {
		return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
	}

	// ─── Label位置(Label寸法込みの「安全矩形」を小さく角丸化した軌道)用の
	// 純粋なジオメトリ計算 ───
	// Pin/Markerの周囲を「辺」「角」で場合分けしない、連続した軌道上の位置として扱う。
	// editor.js・view.js の両方で同じロジックを使う(コードの共有機構が無いため、
	// 内容を同一に保ったまま複製している。変更する場合は両方に同じ修正を適用すること)。
	//
	// labelPosition(0以上1未満)をそのまま「角度」として解釈する(角度自体の意味は
	// 260914の角丸矩形方式のときから一貫して変更していない: angle = labelPosition * 2π。
	// 角度0を基準(右)とし、角度が増える向きはスクリーン座標系(y下向き)で時計回りに
	// なる(右→下→左→上→右))。
	//
	// 軌道の決め方(260917〜): Pin/Marker中心を原点として、
	//   safeHalfX = targetWidth/2 + labelWidth/2 + LABEL_GAP
	//   safeHalfY = targetHeight/2 + labelHeight/2 + LABEL_GAP
	// という「これより内側にLabel中心が入るとPin/Markerと重なる」半径(安全矩形。
	// 2つの軸並行矩形の非重なり条件からそのまま導かれる)を求め、この安全矩形を
	// 半径LABEL_SAFE_CORNER_RADIUSの円でMinkowski和的に外側へ丸めた形の境界を、
	// angle方向のrayとの交点として最終的なLabel中心を求める(roundedBoxRayDistance)。
	// Label自身の寸法は最初から安全矩形の定義(safeHalfX/safeHalfY)に含まれているため、
	// 軌道決定後にsupport distance等でさらに外側へ押し出す処理は行わない(行うと
	// 260915〜260916で見られた「ぽこっ」の再発・過剰な距離の原因になる)。

	// pinオブジェクトのlabelPositionを0以上1未満へ正規化して返す。無効/未設定の
	// 場合は、pinの種類(丸マーカー/画像マーカー)ごとのfallback位置を返す。
	function resolveLabelPosition( pin ) {
		if ( typeof pin.labelPosition === 'number' && isFinite( pin.labelPosition ) ) {
			var t = pin.labelPosition % 1;
			if ( t < 0 ) {
				t += 1;
			}
			return t;
		}
		return pin.markerImageUrl ? LABEL_POSITION_FALLBACK_MARKER : LABEL_POSITION_FALLBACK_ROUND;
	}

	// 原点中心・半径(halfWidth, halfHeight)の軸並行矩形を、半径radiusの円で外側へ
	// 丸めた形の符号付き距離関数(signed distance function)。0が境界、負が内側、
	// 正が外側(標準的なrounded-box SDF)。
	function roundedBoxSdf( x, y, halfWidth, halfHeight, radius ) {
		var qx = Math.abs( x ) - halfWidth;
		var qy = Math.abs( y ) - halfHeight;
		var ox = Math.max( qx, 0 );
		var oy = Math.max( qy, 0 );
		return Math.sqrt( ox * ox + oy * oy ) + Math.min( Math.max( qx, qy ), 0 ) - radius;
	}

	// 原点(Pin/Marker中心)からangle方向へ伸ばしたrayが、上記のrounded-box境界と
	// 交わる距離を二分探索で求める。side/corner等の場合分けをせず、SDFが0になる点を
	// 数値的に探すだけの単純な処理のため、角での状態切り替え(ジャンプ・震えの原因)が
	// 原理的に発生しない。30回の反復で十分な精度(範囲/2^30)に収束する
	// (Pin数は通常少数のため、この程度の軽量な反復は実用上問題にならない)。
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

	// Pin/Markerの実表示矩形(targetWidth/targetHeight)とLabel自身の実表示サイズ
	// (labelSize.width/height)から、Label中心の「Pin/Marker中心からのオフセット」を
	// 求める。
	function calculateLabelOffset( targetWidth, targetHeight, labelPosition, labelSize ) {
		var angle = labelPosition * Math.PI * 2;
		var safeHalfX = targetWidth / 2 + labelSize.width / 2 + LABEL_GAP;
		var safeHalfY = targetHeight / 2 + labelSize.height / 2 + LABEL_GAP;
		var cornerRadius = clampToRange( labelSize.height * LABEL_SAFE_CORNER_RADIUS_RATIO, LABEL_SAFE_CORNER_RADIUS_MIN, LABEL_SAFE_CORNER_RADIUS_MAX );
		var distance = findRoundedBoxRayDistance( angle, safeHalfX, safeHalfY, cornerRadius );
		return { x: Math.cos( angle ) * distance, y: Math.sin( angle ) * distance };
	}

	// Pin/Markerのローカル矩形(pinLocalRect: centerX, centerY, width, height)と、
	// Label自身のローカルサイズ(labelLocalSize: width, height)から、Labelの
	// 中心座標(ローカル単位)を求める。pin: labelPosition解決のfallback判定
	// (markerImageUrlの有無)に使う。
	function computeLabelCenter( pin, pinLocalRect, labelLocalSize ) {
		var t = resolveLabelPosition( pin );
		var offset = calculateLabelOffset( pinLocalRect.width, pinLocalRect.height, t, labelLocalSize );
		return { x: pinLocalRect.centerX + offset.x, y: pinLocalRect.centerY + offset.y, t: t };
	}

	// DOM要素(el)の実際の表示矩形(getBoundingClientRect())を、wrapperEl基準の
	// ローカル座標(zoomScaleで実画面px→ローカルpxへ変換したもの)に変換する。
	// ローカル座標系は、wrapperEl自身の(transform適用前の)座標系(pin.x%/y%が
	// percentFromClientPoint()等で使っているのと同じ空間)。zoomScaleは呼び出し側の
	// 表示倍率(モーダルではmodalZoom/100、Zoomの無い文脈では1)。要素が未測定
	// (レイアウト前・DOM未接続等)の場合はnullを返す(呼び出し側で安全にフォールバックする)。
	function measureLocalRectRelativeTo( targetEl, wrapperEl, zoomScale ) {
		if ( ! targetEl || ! wrapperEl ) {
			return null;
		}
		var r = targetEl.getBoundingClientRect();
		var w = wrapperEl.getBoundingClientRect();
		if ( r.width <= 0 || r.height <= 0 ) {
			return null;
		}
		var scale = ( zoomScale && zoomScale > 0 ) ? zoomScale : 1;
		return {
			centerX: ( r.left + r.width / 2 - w.left ) / scale,
			centerY: ( r.top + r.height / 2 - w.top ) / scale,
			width: r.width / scale,
			height: r.height / scale
		};
	}

	// markerScale が範囲外/未設定の場合のデフォルトへのフォールバックを一箇所にまとめる。
	function resolveMarkerScale( pin ) {
		return ( pin.markerScale && pin.markerScale >= MARKER_SCALE_MIN && pin.markerScale <= MARKER_SCALE_MAX )
			? pin.markerScale
			: DEFAULT_MARKER_SCALE;
	}

	// 色(hex/rgb/rgba/hsl/hsla/CSS標準色名のいずれでもよい)に不透明度(0〜100)を
	// 掛け合わせた最終的な色を返す。image-pin-block.php の image_pin_block_apply_opacity()
	// と同じ考え方: color-mix(in srgb, color pct%, transparent) で color を pct% だけ
	// transparent と混ぜる。相対カラー構文(rgb(from ...))は対応ブラウザが狭く
	// (Firefox 128+ 必須)、未対応環境で宣言ごと無効になり背景が消えてしまうため不採用。
	// opacityPct が100(既定・変更なし)のときは color をそのまま返す(color-mixで包まない)。
	function applyOpacityToColor( color, opacityPct ) {
		var pct = clampToRange( opacityPct, 0, 100 );
		if ( 100 === pct ) {
			return color;
		}
		var pctStr = pct.toFixed( 3 );
		return 'color-mix(in srgb, ' + color + ' ' + pctStr + '%, transparent)';
	}

	// 縁取りの太さ・色から、テキストの縁取り用インラインstyleを組み立てる。
	// 太さが 'none'(=0px)のときは何もプロパティを含まないオブジェクトを返す
	// (-webkit-text-stroke を一切出力しない)。paint-order は必ず併記する
	// (省略すると縁取りが字の内側に食い込み、細い書体の字形が潰れるため)。
	function buildStrokeStyle( widthKey, colorValue ) {
		var px = STROKE_WIDTH_PX[ widthKey ] || 0;
		if ( px <= 0 ) {
			return {};
		}
		return {
			WebkitTextStroke: px + 'px ' + colorValue,
			paintOrder: 'stroke fill'
		};
	}

	function generatePinId( pins ) {
		var existingIds = pins.map( function( p ) { return p.id; } );
		var n = pins.length + 1;
		var id = 'pin-' + n;
		while ( existingIds.indexOf( id ) !== -1 ) {
			n++;
			id = 'pin-' + n;
		}
		return id;
	}

	// 見出しブロックの content(HTML)からプルダウン表示用のテキストだけを取り出す。
	// 編集画面内でのみ使用し、フロントには出力しない。
	// innerHTML は使わない(DOMに追加しなくても img の onerror 等は発火し得るため)。
	// タグを正規表現で除去し、代表的なHTML実体参照だけ手作業で戻す。
	var HTML_ENTITIES = {
		'&amp;': '&',
		'&lt;': '<',
		'&gt;': '>',
		'&quot;': '"',
		'&#039;': "'",
		'&apos;': "'",
		'&nbsp;': ' '
	};
	function stripTags( html ) {
		var text = String( html ).replace( /<[^>]*>/g, '' );
		return text.replace( /&amp;|&lt;|&gt;|&quot;|&#039;|&apos;|&nbsp;/g, function( match ) {
			return HTML_ENTITIES[ match ];
		} );
	}

	// 見出しブロックの配列(core/heading のみ)から、HTMLアンカーが設定されているものだけを
	// プルダウンの選択肢に変換する。アンカー未設定の見出しは(ジャンプ先IDが無いため)候補に含めない。
	function buildHeadingOptions( headingBlocks ) {
		var options = [];
		headingBlocks.forEach( function( block ) {
			var anchor = block.attributes && block.attributes.anchor ? block.attributes.anchor : '';
			if ( '' === anchor ) {
				return;
			}
			var rawContent = ( block.attributes && block.attributes.content ) ? block.attributes.content : '';
			var text = stripTags( String( rawContent ) );
			options.push( {
				value: anchor,
				label: ( text || __( '(Untitled heading)', 'image-pin-block' ) ) + ' (#' + anchor + ')'
			} );
		} );
		return options;
	}

	// 生の投稿データを直接編集して0〜100の範囲外のx/yが入っていた場合でも、
	// 編集画面のプレビューがフロント側(PHP側で同様にクランプ済み)とずれないようにする。
	function clampPercent( n ) {
		return Math.min( 100, Math.max( 0, n ) );
	}

	// client座標(ビューポート基準px)を、wrapperの矩形(rect)を基準にした%座標に変換する。
	// 0〜100の範囲にクランプするため、rect の外を指す座標を渡しても安全。
	function percentFromClientPoint( clientX, clientY, rect ) {
		var x = ( ( clientX - rect.left ) / rect.width ) * 100;
		var y = ( ( clientY - rect.top ) / rect.height ) * 100;
		x = Math.min( 100, Math.max( 0, x ) );
		y = Math.min( 100, Math.max( 0, y ) );
		return {
			x: Math.round( x * 10 ) / 10,
			y: Math.round( y * 10 ) / 10
		};
	}

	function pointFromEvent( evt, wrapperEl ) {
		if ( ! wrapperEl ) {
			return null;
		}
		return percentFromClientPoint( evt.clientX, evt.clientY, wrapperEl.getBoundingClientRect() );
	}

	// ラベルのインラインstyle(背景色+不透明度・文字色・文字サイズ・縁取り)。
	// ブロック自身のキャンバス・モーダルの両方で、独立配置されたLabel要素(下記
	// 「Label位置」関連の描画)に使う共通処理。
	function buildLabelStyle( display ) {
		var ratio = display.widthRatio || 1;
		return Object.assign(
			{
				backgroundColor: applyOpacityToColor( display.labelBackgroundColor, display.labelBackgroundOpacity ),
				color: display.labelTextColor,
				fontSize: ( display.labelFontSize * ratio ) + 'px'
			},
			buildStrokeStyle( display.labelStrokeWidth, display.labelStrokeColor )
		);
	}

	// Pin/Markerの実際の外形(丸マーカーのドット、または画像マーカー+選択中なら
	// リサイズハンドル)だけを組み立てる(ラベルを含まない)。編集画面用(ブロック自身の
	// 表示専用キャンバス・モーダルの両方で共通に使う)。フロント側の見た目は
	// image-pin-block.php 側で同じ構造を出力する。
	// display: { pinSize, pinColor, mainImageWidth, markerNaturalWidths, onMarkerImageLoad,
	//            registerMarkerImageRef, onMarkerResizePointerDown, widthRatio }
	// (ブロック単位の見た目設定)。registerMarkerImageRef/onMarkerResizePointerDownは、
	// モーダル内の画像編集エリアでのドラッグ移動・リサイズに使うためのもの(不要な
	// 呼び出し側では省略可)。isSelected: 画像マーカーのリサイズハンドルを表示するか
	// どうか(表示専用キャンバス側では常にfalseを渡す)。ピンのサイズ・色は丸マーカーの
	// みに適用する。Labelは独立した要素として別途配置する(下記「Label位置」参照。
	// buildLabelStyle()で見た目を組み立て、computeLabelCenter()で位置を計算する)。
	function buildPinVisualOnly( pin, display, isSelected ) {
		var ratio = display.widthRatio || 1;

		if ( pin.markerImageUrl ) {
			var scale = resolveMarkerScale( pin );
			var naturalW = ( display.markerNaturalWidths && display.markerNaturalWidths[ pin.id ] ) || 0;
			var markerStyle;
			var displayWidthPx = 0;
			if ( naturalW > 0 ) {
				var idealWidth = naturalW * ( scale / 100 );
				var maxBaseWidth = ( display.mainImageWidth || 0 ) * MARKER_MAX_WIDTH_RATIO;
				var baseWidth = ( maxBaseWidth > 0 ) ? Math.min( idealWidth, maxBaseWidth ) : idealWidth;
				displayWidthPx = baseWidth * ratio;
				markerStyle = { width: displayWidthPx + 'px', height: 'auto' };
			} else {
				markerStyle = { transform: 'scale(' + ( ( scale / 100 ) * ratio ) + ')' };
			}

			var markerImageEl = el( 'img', {
				key: 'marker-image',
				className: 'image-pin-block-editor__pin-marker-image',
				src: pin.markerImageUrl,
				alt: '',
				style: markerStyle,
				ref: function( node ) {
					if ( display.registerMarkerImageRef ) {
						display.registerMarkerImageRef( pin.id, node );
					}
				},
				onLoad: function( evt ) {
					if ( display.onMarkerImageLoad ) {
						display.onMarkerImageLoad( pin.id, evt.target.naturalWidth || 0 );
					}
				}
			} );

			var handleEl = null;
			if ( isSelected && naturalW > 0 ) {
				var handleSize = clampToRange( displayWidthPx * MARKER_RESIZE_HANDLE_RATIO, MARKER_RESIZE_HANDLE_MIN_PX, MARKER_RESIZE_HANDLE_MAX_PX );
				handleEl = el( 'span', {
					key: 'marker-resize-handle',
					className: 'image-pin-block-editor__marker-resize-handle',
					style: { width: handleSize + 'px', height: handleSize + 'px' },
					title: __( 'Drag to resize', 'image-pin-block' ),
					onPointerDown: function( evt ) {
						evt.stopPropagation();
						if ( display.onMarkerResizePointerDown ) {
							display.onMarkerResizePointerDown( pin.id, evt );
						}
					},
					onClick: function( evt ) { evt.stopPropagation(); },
					onDoubleClick: function( evt ) { evt.stopPropagation(); }
				} );
			}

			return el(
				'span',
				{ className: 'image-pin-block-editor__marker-wrap' },
				markerImageEl,
				handleEl
			);
		}

		var dotStyle = {
			width: ( display.pinSize * ratio ) + 'px',
			height: ( display.pinSize * ratio ) + 'px',
			backgroundColor: display.pinColor
		};
		return el( 'span', { className: 'image-pin-block-editor__pin-dot', style: dotStyle, 'aria-hidden': 'true' } );
	}

	// ラベル横に付ける「?」ヘルプアイコン。ホバー/フォーカスしたときだけ Tooltip で
	// 文言を表示する(常時表示だと長いヘルプ文が個別設定エリアの高さを圧迫するため、
	// v0.2.0でこの形にした)。tabIndexを付け、キーボード操作でもフォーカスして
	// 内容を確認できるようにする。
	function HelpTooltip( props ) {
		return el(
			Tooltip,
			{ text: props.text },
			el( 'span', {
				className: 'image-pin-block-editor__help-icon',
				tabIndex: 0,
				role: 'img',
				'aria-label': props.text
			}, '?' )
		);
	}

	// TextControl/SelectControl の label は文字列だけでなく要素も渡せるため、
	// 「ラベル文字列 + ヘルプアイコン」をまとめた1要素をlabelプロパティに渡す。
	function buildLabelWithHelp( label, helpText ) {
		return el(
			'span',
			{ className: 'image-pin-block-editor__label-with-help' },
			label,
			el( HelpTooltip, { text: helpText } )
		);
	}

	// 数値入力欄: 入力中はバリデーションしない下書き状態を保持し、blur/Enterで確定する。
	// 確定時、空文字なら defaultValue に戻し、範囲外ならデフォルトに戻さず範囲内にクランプする。
	// (入力途中の値を都度検証すると、既存の値を消して打ち直す通常の操作ができなくなるため)
	function ClampedNumberControl( props ) {
		var draftState = useState( String( props.value ) );
		var draft = draftState[ 0 ];
		var setDraft = draftState[ 1 ];

		function commit() {
			var trimmed = draft.trim();
			var next;
			if ( '' === trimmed ) {
				next = props.defaultValue;
			} else {
				var n = parseFloat( trimmed );
				next = isNaN( n ) ? props.defaultValue : Math.min( props.max, Math.max( props.min, n ) );
			}
			setDraft( String( next ) );
			props.onCommit( next );
		}

		return el( TextControl, {
			label: props.label,
			type: 'number',
			value: draft,
			onChange: function( value ) { setDraft( value ); },
			onBlur: commit,
			onKeyDown: function( evt ) {
				if ( evt.key === 'Enter' ) {
					evt.preventDefault();
					commit();
				}
			}
		} );
	}

	// 縁取りの太さの選択肢。image-pin-block.php / style.css の列挙値と必ず一致させること。
	var STROKE_WIDTH_OPTIONS = [
		{ value: 'none', label: __( 'None', 'image-pin-block' ) },
		{ value: 'thin', label: __( 'Thin', 'image-pin-block' ) },
		{ value: 'normal', label: __( 'Normal', 'image-pin-block' ) },
		{ value: 'thick', label: __( 'Thick', 'image-pin-block' ) }
	];

	// Dropdown の中身(ColorPicker本体)。Dropdownが開いている間だけマウントされる。
	//
	// ColorPicker の onChange はドラッグ中(グラデーション/色相バーの操作中)に高頻度で
	// 発火する。これを毎回 setAttributes に伝えると、ドラッグ1回で undo 履歴が
	// 100件以上積まれ、Ctrl+Z が実質使えなくなる。そのため setAttributes は
	// 「適用」ボタンを押した時点に1回だけ呼ぶ(操作中はプレビューのみ更新する)。
	//
	// ColorPicker 自身の color プロパティには、確定済みの値(props.value)だけを渡し、
	// 操作中は一切変更しない。ColorPicker は内部で自身の操作状態を保持して
	// 滑らかに追従するため、外側から色を追従させ直す必要はない。
	// (経緯: @wordpress/components の ColorPicker(react-colorful ベース)は、
	// 内部の useColorManipulation フックが持つ2つの useEffect が、キャッシュと
	// hsva ステートの更新タイミングの食い違いにより、外部から色を再注入していなくても
	// 自己完結した値の往復を起こしうる不具合がある。setAttributes を「適用」ボタン
	// クリック時の1回に絞ることで、color プロパティ自体が操作中に変化しなくなるため、
	// この不具合の発生条件(繰り返しの外部からの色変更)が生じなくなる。詳細は
	// docs/DATA_LAYOUT.md の「カラーピッカーの往復不具合」参照)
	//
	// 操作中の値は onPreview で都度報告し(setAttributesは呼ばない)、キャンバス上の
	// ライブプレビューにのみ反映する。「適用」ボタンでonCommitを呼んで確定し、
	// Dropdownを閉じる。「閉じる」ボタンはonCommitを呼ばずDropdownを閉じるだけで、
	// 未適用の変更は破棄される(呼び出し側のonClose経由でプレビューも確定値へ戻る。
	// ColorInputRow参照)。
	function ColorPickerField( props ) {
		// 「適用」時にコミットすべき最新値。onChangeのたびに更新するが、再レンダリングは
		// 起こさない(setStateではなくrefにする理由: これ自体はUIに表示する値ではなく、
		// 適用時に読み出すためだけの値のため)。
		var latestValueRef = useRef( props.value );

		function handleChange( color ) {
			latestValueRef.current = color;
			if ( props.onPreview ) {
				props.onPreview( color );
			}
		}

		function handleApply() {
			if ( latestValueRef.current !== props.value && props.onCommit ) {
				props.onCommit( latestValueRef.current );
			}
			if ( props.onRequestClose ) {
				props.onRequestClose();
			}
		}

		function handleClose() {
			if ( props.onRequestClose ) {
				props.onRequestClose();
			}
		}

		return el(
			'div',
			{ className: 'image-pin-block-editor__color-picker-commit-wrap' },
			el( ColorPicker, {
				color: props.value || undefined,
				onChange: handleChange,
				enableAlpha: !! props.enableAlpha
			} ),
			el(
				'div',
				{ className: 'image-pin-block-editor__color-picker-actions' },
				el( Button, { variant: 'primary', onClick: handleApply }, __( 'Apply', 'image-pin-block' ) ),
				el( Button, { variant: 'tertiary', onClick: handleClose }, __( 'Close', 'image-pin-block' ) )
			)
		);
	}

	// 色1つ分の設定行: スウォッチボタン(クリックでカラーピッカーをポップオーバー表示)+ラベル。
	// labelBackgroundColor 等、既存の rgba() 値を保持し得る属性にも対応するため、
	// (PanelColorSettings ではなく)フルの ColorPicker を Dropdown に包んで使う
	// (ネイティブの <input type="color"> は hex専用で rgba() を表示できないため不採用)。
	// value は常に確定済みの属性値(committed value)を渡すこと。ドラッグ中のプレビューを
	// 表示したい場合は、呼び出し側で別途 previewColors を使ってキャンバス側に反映する
	// (ColorInputRow/ColorPicker自体には、往復不具合を再発させないため反映しない)。
	// allowEmpty: true の場合、値が空でなければ「リセット」ボタンで空文字に戻せる
	// (popoverBackgroundColor/popoverTextColor の「未設定=継承」に戻すため)。
	function ColorInputRow( props ) {
		var currentColor = props.value || '';

		function handleReset() {
			props.onCommit( '' );
			if ( props.onPreviewClear ) {
				props.onPreviewClear();
			}
		}

		return el(
			'div',
			{ className: 'image-pin-block-editor__color-row' },
			el( Dropdown, {
				className: 'image-pin-block-editor__color-dropdown',
				contentClassName: 'image-pin-block-editor__color-dropdown-content',
				// Dropdownが閉じる経路(「閉じる」ボタン・外側クリック・Escapeのいずれでも)は
				// すべてこの1箇所を通る。「適用」を押さずに閉じた場合、プレビュー値
				// (previewColors)を消して確定済みの値へ戻す(未適用の変更を破棄する)。
				// 「適用」を押した場合もonCommit側で同じ処理を行うため、二重に呼ばれても
				// 副作用は無い(clearColorPreviewは対象keyが無ければ何もしない)。
				onClose: function() {
					if ( props.onPreviewClear ) {
						props.onPreviewClear();
					}
				},
				renderToggle: function( toggleProps ) {
					return el(
						Button,
						{
							onClick: toggleProps.onToggle,
							'aria-expanded': toggleProps.isOpen,
							className: 'image-pin-block-editor__color-swatch-button'
						},
						el( 'span', {
							className: 'image-pin-block-editor__color-swatch',
							style: { backgroundColor: currentColor || 'transparent' }
						} ),
						props.label
					);
				},
				renderContent: function( contentProps ) {
					return el( ColorPickerField, {
						value: props.value,
						enableAlpha: props.enableAlpha,
						onPreview: props.onPreview,
						onCommit: function( color ) {
							props.onCommit( color );
							if ( props.onPreviewClear ) {
								props.onPreviewClear();
							}
						},
						onRequestClose: contentProps.onClose
					} );
				}
			} ),
			( props.allowEmpty && currentColor )
				? el( Button, { variant: 'link', onClick: handleReset }, __( 'Reset', 'image-pin-block' ) )
				: null
		);
	}

	// モーダル内で編集中のピンの実際の説明文を、現在の「ポップオーバー」設定
	// (背景の不透明度・文字色・縁取り)を適用して、モーダル内の画像編集エリアの実画像の
	// 上に表示する(v0.2.0でモーダル化。以前はブロック自身のキャンバスに表示していた)。
	// 「背景を透過させたときに実画像の上でどう見えるか」を確認する目的のため、パネル内の
	// 静的な見本ではなく、実際のポップオーバーと同じ考え方で描画する(こちらはエディタ
	// 限定の表示で、render_callback の出力には一切影響しない)。
	// 260918: PopoverはDescriptionのみを表示する(画像上のLabelと重複表示していた不具合を
	// 修正。Labelは画像上にのみ表示する役割へ整理した。image-pin-block.php側の
	// PC/Mobile templateも同様にLabel出力を削除済み)。説明文が空のときは何も表示しない
	// (下記参照)。
	function CanvasPopoverPreview( props ) {
		var pin = props.pin;
		var s = props.popoverSettings;
		// ratio: Preview viewportへのFit倍率(modalFitRatio)。呼び出し元の image wrapper
		// 自体がZoom(transform: scale())の対象であり、このプレビューはその内側に描画される
		// ため、ここでZoom倍率まで掛けると二重に拡大されてしまう(buildLabelStyleの
		// labelFontSizeと同じ考え方)。
		var hasDescriptionText = !! ( pin.description && '' !== pin.description );

		// 説明文が空のピンは、フロント側(image-pin-block.php)がポップオーバーの
		// <template>自体を出力しないのと同じ扱いで、プレビューも何も表示しない。
		if ( ! hasDescriptionText ) {
			return null;
		}

		var bgBase = s.backgroundColor || DEFAULT_POPOVER_BG_BASE;
		var ratio = props.ratio || 1;

		// 位置計算はview.jsのpositionPopover()と同じ基本ルール(まずPin右側→入らなければ
		// 左側→左右とも不足なら画像内へclamp。縦方向はPin中央付近→上下からはみ出す場合は
		// clamp)を使い、pin.x > 60 のような単純な閾値では決めない。実際のwrapper・popover
		// サイズをgetBoundingClientRect()で実測する(モーダルのZoom(transform: scale())は
		// このコンポーネント自体も含めて掛かるため、実測値はzoomScaleで割ってローカル単位へ
		// 戻す。詳細はcomputeLabelCenter付近のコメント参照)。
		var popoverRef = useRef( null );
		var positionState = useState( { left: 0, top: 0 } );
		var position = positionState[ 0 ];
		var setPosition = positionState[ 1 ];

		useLayoutEffect( function() {
			var wrapperEl = props.wrapperRef && props.wrapperRef.current;
			var popoverEl = popoverRef.current;
			if ( ! wrapperEl || ! popoverEl ) {
				return;
			}
			var zoomScale = props.zoomScale || 1;
			var wrapperRect = wrapperEl.getBoundingClientRect();
			var wrapperLocalWidth = wrapperRect.width / zoomScale;
			var wrapperLocalHeight = wrapperRect.height / zoomScale;
			var popRect = popoverEl.getBoundingClientRect();
			var popW = popRect.width / zoomScale;
			var popH = popRect.height / zoomScale;

			var gap = 10;
			var pinLeft = ( clampPercent( pin.x ) / 100 ) * wrapperLocalWidth;
			var pinTop = ( clampPercent( pin.y ) / 100 ) * wrapperLocalHeight;

			var left = pinLeft + gap;
			var top = pinTop - popH / 2;

			if ( left + popW > wrapperLocalWidth ) {
				left = pinLeft - gap - popW;
			}
			if ( left < 0 ) {
				left = Math.max( 0, Math.min( pinLeft, wrapperLocalWidth - popW ) );
			}
			if ( top < 0 ) {
				top = 0;
			}
			if ( top + popH > wrapperLocalHeight ) {
				top = Math.max( 0, wrapperLocalHeight - popH );
			}

			setPosition( function( prev ) {
				if ( Math.abs( prev.left - left ) < 0.5 && Math.abs( prev.top - top ) < 0.5 ) {
					return prev;
				}
				return { left: left, top: top };
			} );
		} );

		var boxStyle = Object.assign(
			{
				backgroundColor: applyOpacityToColor( bgBase, s.backgroundOpacity ),
				color: s.textColor || undefined,
				fontSize: ( s.fontSize * ratio ) + 'px',
				left: position.left + 'px',
				top: position.top + 'px'
			},
			buildStrokeStyle( s.strokeWidth, s.strokeColor )
		);

		return el(
			'div',
			{
				className: 'image-pin-block-editor__canvas-popover',
				style: boxStyle,
				// popoverRef: 自分自身の位置計算(上記useLayoutEffect)専用。
				// props.outerRef: 呼び出し側(Edit)がPopoverの矩形をダブルクリック判定
				// に使うための追加ref(260920〜。表示・位置計算ロジック自体には影響しない)。
				ref: function( node ) {
					popoverRef.current = node;
					if ( props.outerRef ) {
						props.outerRef.current = node;
					}
				}
			},
			el( 'div', { className: 'image-pin-block-editor__canvas-popover-body' }, pin.description || '' )
		);
	}

	// ─── 「画像として保存」(PNG書き出し) ───
	// 対象は Editor Preview のスクリーンショットではなく、元画像(natural dimensions)に
	// 保存済みのPin/Marker/Label(公開時に常時見える要素のみ)を合成したもの。Popover・
	// 16:9のletterbox・Zoom/Pan・選択枠・リサイズハンドル・「ここにピンを追加」等の
	// Editor限定のUIは一切含めない。出力解像度は常に imageWidth × imageHeight
	// (Editor上のZoom/Panの状態に関わらず、常に元画像全体を等倍で書き出す)。

	// crossOrigin='anonymous'を指定して画像を読み込む。同一オリジンのWordPress
	// メディアであれば通常どおり動作する。異なるオリジンでサーバー側がCORSを許可して
	// いない場合、読み込み自体は成功してもCanvasが「汚染」され、後続のtoBlob()が
	// 失敗する(呼び出し側でエラー表示する)。
	function loadImageForExport( url ) {
		return new Promise( function( resolve, reject ) {
			var img = new window.Image();
			img.crossOrigin = 'anonymous';
			img.onload = function() { resolve( img ); };
			img.onerror = function() { reject( new Error( 'image load failed: ' + url ) ); };
			img.src = url;
		} );
	}

	// Canvas 2DでLabelを描画したときの実際のサイズをmeasureText()で見積もる。
	// DOM(ブラウザの実際のフォントレンダリング)と完全一致はしないが、安全マージンを
	// 加えて広めに見積もることで、「Pinへ重ならないこと」を優先する(仕様の優先順位どおり)。
	var PNG_LABEL_PADDING_X = 12;
	var PNG_LABEL_PADDING_Y = 6;
	var PNG_LABEL_SAFETY_MARGIN = 2;
	function measurePngLabelSize( ctx, text, fontSizePx ) {
		ctx.font = fontSizePx + 'px sans-serif';
		var metrics = ctx.measureText( text );
		return {
			width: metrics.width + PNG_LABEL_PADDING_X + PNG_LABEL_SAFETY_MARGIN,
			height: fontSizePx * 1.4 + PNG_LABEL_PADDING_Y + PNG_LABEL_SAFETY_MARGIN
		};
	}

	// 角丸矩形の背景+テキスト(縁取り→塗りの順。paint-order: stroke fill と同じ考え方)を描画する。
	function drawPngLabel( ctx, text, centerX, centerY, boxWidth, boxHeight, fontSizePx, style ) {
		var left = centerX - boxWidth / 2;
		var top = centerY - boxHeight / 2;
		var radius = Math.min( 3, boxWidth / 2, boxHeight / 2 );
		ctx.save();
		ctx.beginPath();
		ctx.moveTo( left + radius, top );
		ctx.arcTo( left + boxWidth, top, left + boxWidth, top + boxHeight, radius );
		ctx.arcTo( left + boxWidth, top + boxHeight, left, top + boxHeight, radius );
		ctx.arcTo( left, top + boxHeight, left, top, radius );
		ctx.arcTo( left, top, left + boxWidth, top, radius );
		ctx.closePath();
		ctx.fillStyle = style.backgroundColor;
		ctx.fill();

		ctx.font = fontSizePx + 'px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		if ( style.strokeWidthPx > 0 ) {
			ctx.lineWidth = style.strokeWidthPx;
			ctx.strokeStyle = style.strokeColor;
			ctx.strokeText( text, centerX, centerY );
		}
		ctx.fillStyle = style.textColor;
		ctx.fillText( text, centerX, centerY );
		ctx.restore();
	}

	// 1件のピンを、元画像のnatural座標系(ctx.canvas.width/heightが既にimageWidth/Height)
	// へ描画する。display: Edit()のdisplaySettingsと同じ形(pinSize/pinColor/
	// labelBackgroundColor等)。pinSize/labelFontSizeは「imageWidthを基準にした値」と
	// して保存されているため、書き出しは常に等倍(ratio=1相当)でよい
	// (docs/DATA_LAYOUT.mdの「pinSize / labelFontSize の自動計算」参照)。
	function drawPinForExport( ctx, pin, markerImagesByUrl, mainImageWidth, display ) {
		var x = ( clampPercent( pin.x ) / 100 ) * ctx.canvas.width;
		var y = ( clampPercent( pin.y ) / 100 ) * ctx.canvas.height;
		var hasLabelText = !! ( pin.label && '' !== pin.label );
		var pinRect = null;

		if ( pin.markerImageUrl ) {
			var markerImg = markerImagesByUrl[ pin.markerImageUrl ];
			var naturalW = markerImg ? ( markerImg.naturalWidth || 0 ) : 0;
			var naturalH = markerImg ? ( markerImg.naturalHeight || 0 ) : 0;
			if ( markerImg && naturalW > 0 && naturalH > 0 ) {
				var scale = resolveMarkerScale( pin );
				var idealWidth = naturalW * ( scale / 100 );
				var maxBaseWidth = mainImageWidth * MARKER_MAX_WIDTH_RATIO;
				var baseWidth = Math.min( idealWidth, maxBaseWidth );
				var baseHeight = baseWidth * ( naturalH / naturalW );
				ctx.drawImage( markerImg, x - baseWidth / 2, y - baseHeight / 2, baseWidth, baseHeight );
				pinRect = { centerX: x, centerY: y, width: baseWidth, height: baseHeight };
			}
		} else {
			var pinSize = display.pinSize;
			ctx.save();
			ctx.beginPath();
			ctx.arc( x, y, pinSize / 2, 0, Math.PI * 2 );
			ctx.fillStyle = display.pinColor;
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#ffffff';
			ctx.stroke();
			ctx.restore();
			pinRect = { centerX: x, centerY: y, width: pinSize, height: pinSize };
		}

		if ( ! pinRect ) {
			return;
		}

		var showLabel = pin.markerImageUrl ? ( pin.showLabel !== false && hasLabelText ) : hasLabelText;
		if ( ! showLabel ) {
			return;
		}

		var fontSizePx = display.labelFontSize;
		var textSize = measurePngLabelSize( ctx, pin.label, fontSizePx );
		var center = computeLabelCenter( pin, pinRect, textSize );
		var strokePx = STROKE_WIDTH_PX[ display.labelStrokeWidth ] || 0;
		drawPngLabel( ctx, pin.label, center.x, center.y, textSize.width, textSize.height, fontSizePx, {
			backgroundColor: applyOpacityToColor( display.labelBackgroundColor, display.labelBackgroundOpacity ),
			textColor: display.labelTextColor,
			strokeColor: display.labelStrokeColor,
			strokeWidthPx: strokePx
		} );
	}

	// PNG Blobを生成する(元画像・マーカー画像の読み込み→Canvas描画→toBlob)。
	// 生成の失敗(画像読み込み失敗・Canvas 2D非対応・CORS等によるtoBlob失敗)は
	// Promiseのrejectとして呼び出し側へ伝える(呼び出し側でエラー表示する)。
	// この関数自体は画像読み込みを含むため非同期(=ユーザー操作からの時間が空きうる)
	// であり、showSaveFilePicker()より後に呼ぶ(先に呼ぶとtransient user activationを
	// 失う可能性があるため)。
	function generatePngBlob( imageUrl, exportWidth, exportHeight, pins, display ) {
		var markerUrls = [];
		pins.forEach( function( pin ) {
			if ( pin.markerImageUrl && markerUrls.indexOf( pin.markerImageUrl ) === -1 ) {
				markerUrls.push( pin.markerImageUrl );
			}
		} );

		var loadPromises = [ loadImageForExport( imageUrl ) ].concat(
			markerUrls.map( function( url ) { return loadImageForExport( url ); } )
		);

		return Promise.all( loadPromises ).then( function( images ) {
			var mainImg = images[ 0 ];
			var markerImagesByUrl = {};
			markerUrls.forEach( function( url, index ) {
				markerImagesByUrl[ url ] = images[ index + 1 ];
			} );

			var canvas = document.createElement( 'canvas' );
			canvas.width = exportWidth;
			canvas.height = exportHeight;
			var ctx = canvas.getContext( '2d' );
			if ( ! ctx ) {
				return Promise.reject( new Error( 'canvas-2d-not-supported' ) );
			}
			ctx.drawImage( mainImg, 0, 0, exportWidth, exportHeight );

			pins.forEach( function( pin ) {
				drawPinForExport( ctx, pin, markerImagesByUrl, exportWidth, display );
			} );

			return new Promise( function( resolve, reject ) {
				try {
					canvas.toBlob( function( resultBlob ) {
						if ( ! resultBlob ) {
							reject( new Error( 'png-blob-generation-failed' ) );
							return;
						}
						resolve( resultBlob );
					} );
				} catch ( err ) {
					reject( err );
				}
			} );
		} );
	}

	// 生成したBlobをファイルとして保存させる(Blob URL + 一時的な<a download>要素)。
	// showSaveFilePicker() が使えない環境でのfallback、および対応環境でユーザーが
	// キャンセルしなかった場合の実際の書き込み経路以外(=フォールバック専用)として使う。
	function triggerPngDownload( blob, fileName ) {
		var url = window.URL.createObjectURL( blob );
		var a = document.createElement( 'a' );
		a.href = url;
		a.download = fileName;
		document.body.appendChild( a );
		a.click();
		document.body.removeChild( a );
		window.setTimeout( function() { window.URL.revokeObjectURL( url ); }, 1000 );
	}

	// 元画像のURLからPNG保存用のファイル名を組み立てる(例: .../photo.jpg → photo-pins.png)。
	// URLの形式が想定外で取得できない場合は分かりやすい既定値にフォールバックする。
	function buildExportFileName( imageUrl ) {
		var fallback = 'image-pin-block.png';
		if ( ! imageUrl ) {
			return fallback;
		}
		try {
			var withoutQuery = imageUrl.split( '?' )[ 0 ].split( '#' )[ 0 ];
			var segments = withoutQuery.split( '/' );
			var last = segments[ segments.length - 1 ] || '';
			var dot = last.lastIndexOf( '.' );
			var base = ( dot > 0 ) ? last.substring( 0, dot ) : last;
			base = base.replace( /[^A-Za-z0-9_-]+/g, '-' ).replace( /^-+|-+$/g, '' );
			return base ? ( base + '-pins.png' ) : fallback;
		} catch ( err ) {
			return fallback;
		}
	}

	// FileSystemFileHandleへBlobを書き込む(createWritable→write→close)。呼び出し側が
	// PNG生成(generatePngBlob)を先に成功させてから呼ぶことで、生成に失敗した場合に
	// 空ファイル・書きかけファイルを残さないようにしている。
	function writeBlobToFileHandle( handle, blob ) {
		return handle.createWritable().then( function( writable ) {
			return writable.write( blob ).then( function() {
				return writable.close();
			} );
		} );
	}

	function Edit( props ) {
		var attributes = props.attributes;
		var setAttributes = props.setAttributes;
		var pins = attributes.pins || [];

		// ピンの見た目設定(ブロック単位)。既存ブロックに属性が無い場合のフォールバックも兼ねる。
		var displaySettings = {
			pinSize: ( attributes.pinSize && attributes.pinSize >= PIN_SIZE_MIN && attributes.pinSize <= PIN_SIZE_MAX )
				? attributes.pinSize
				: DEFAULT_PIN_SIZE,
			pinColor: attributes.pinColor || DEFAULT_PIN_COLOR,
			labelBackgroundColor: attributes.labelBackgroundColor || DEFAULT_LABEL_BG_COLOR,
			labelTextColor: attributes.labelTextColor || DEFAULT_LABEL_TEXT_COLOR,
			labelFontSize: ( attributes.labelFontSize && attributes.labelFontSize >= LABEL_FONT_SIZE_MIN && attributes.labelFontSize <= LABEL_FONT_SIZE_MAX )
				? attributes.labelFontSize
				: DEFAULT_LABEL_FONT_SIZE,
			labelBackgroundOpacity: ( typeof attributes.labelBackgroundOpacity === 'number' && attributes.labelBackgroundOpacity >= 0 && attributes.labelBackgroundOpacity <= 100 )
				? attributes.labelBackgroundOpacity
				: DEFAULT_BG_OPACITY,
			labelStrokeColor: attributes.labelStrokeColor || DEFAULT_STROKE_COLOR,
			labelStrokeWidth: ( STROKE_WIDTHS.indexOf( attributes.labelStrokeWidth ) !== -1 )
				? attributes.labelStrokeWidth
				: DEFAULT_STROKE_WIDTH,
			mainImageWidth: attributes.imageWidth || 0
		};

		// ポップオーバー(PC用吹き出し・スマホの説明エリア共通)の見た目設定。
		// backgroundColor/textColor は空文字が「未設定=継承」を表すセンチネル値
		// (image-pin-block.php と同じ扱い)。
		var popoverSettings = {
			fontSize: ( attributes.popoverFontSize && attributes.popoverFontSize >= POPOVER_FONT_SIZE_MIN && attributes.popoverFontSize <= POPOVER_FONT_SIZE_MAX )
				? attributes.popoverFontSize
				: DEFAULT_POPOVER_FONT_SIZE,
			backgroundColor: attributes.popoverBackgroundColor || '',
			backgroundOpacity: ( typeof attributes.popoverBackgroundOpacity === 'number' && attributes.popoverBackgroundOpacity >= 0 && attributes.popoverBackgroundOpacity <= 100 )
				? attributes.popoverBackgroundOpacity
				: DEFAULT_BG_OPACITY,
			textColor: attributes.popoverTextColor || '',
			strokeColor: attributes.popoverStrokeColor || DEFAULT_STROKE_COLOR,
			strokeWidth: ( STROKE_WIDTHS.indexOf( attributes.popoverStrokeWidth ) !== -1 )
				? attributes.popoverStrokeWidth
				: DEFAULT_STROKE_WIDTH
		};

		// ドラッグ中のカラーピッカーのライブプレビュー値。setAttributesはドラッグ確定時
		// (ColorPickerField参照)にしか呼ばないため、キャンバス上の表示(ラベル・
		// ポップオーバープレビュー)をドラッグに追従させるには、この一時的な値を使う。
		// キー: labelBackgroundColor/labelTextColor/labelStrokeColor/
		// popoverBackgroundColor/popoverTextColor/popoverStrokeColor。
		// ColorInputRowのスウォッチ・ColorPicker自体のcolorプロパティには使わない
		// (往復不具合の再発を避けるため。詳細はColorPickerField付近のコメント参照)。
		var previewColorsState = useState( {} );
		var previewColors = previewColorsState[ 0 ];
		var setPreviewColors = previewColorsState[ 1 ];

		function setColorPreview( key, color ) {
			setPreviewColors( function( prev ) {
				var next = Object.assign( {}, prev );
				next[ key ] = color;
				return next;
			} );
		}

		function clearColorPreview( key ) {
			setPreviewColors( function( prev ) {
				if ( ! ( key in prev ) ) {
					return prev;
				}
				var next = Object.assign( {}, prev );
				delete next[ key ];
				return next;
			} );
		}

		function resolveColorPreview( key, committedValue ) {
			return ( key in previewColors ) ? previewColors[ key ] : committedValue;
		}

		var selectedState = useState( null );
		var selectedPinId = selectedState[ 0 ];
		var setSelectedPinId = selectedState[ 1 ];

		// v0.2.0で編集UIをモーダルに集約した。true の間、全画面モーダルを表示する
		// (サイドバーの「ピンを編集」ボタンで開く)。
		var isModalOpenState = useState( false );
		var isModalOpen = isModalOpenState[ 0 ];
		var setIsModalOpen = isModalOpenState[ 1 ];

		// モーダル内Preview viewportの表示倍率(100〜200%、表示のみ。保存される値には
		// 影響しない)。モーダルを閉じるたびに100%(Fit)・Pan位置0へ戻す。
		var modalZoomState = useState( MODAL_ZOOM_DEFAULT );
		var modalZoom = modalZoomState[ 0 ];
		var setModalZoom = modalZoomState[ 1 ];

		// Pan位置(px、Preview viewportの中心を基準)。保存属性ではなく編集UI限定の
		// ローカル状態。Pan操作中もsetAttributesは一切呼ばない(記事データではないため)。
		var modalPanState = useState( { x: 0, y: 0 } );
		var modalPan = modalPanState[ 0 ];
		var setModalPan = modalPanState[ 1 ];

		// 「ここにピンを追加」確認メニュー(v0.1.x系のpendingMenuを、Preview上のUI
		// overlayとして復元したもの)。null のとき非表示。
		// { x, y }: 追加時に使う%座標(画像上の位置)。
		// { left, top }: メニュー自体の表示位置(px、Preview viewport基準。Pan layer/
		// Image wrapperのtransform(Zoom・Pan)の外側に描画するため、Zoom/Panで
		// メニュー自体が拡大・移動することはない)。
		var pendingMenuState = useState( null );
		var pendingMenu = pendingMenuState[ 0 ];
		var setPendingMenu = pendingMenuState[ 1 ];

		// Popoverの開閉状態(260919〜)。選択状態(selectedPinId)とは独立した別概念として
		// 扱う(「Pinが選択されている」= 「Popoverが開いている」ではない)。null のとき
		// 非表示。値が入っているときは、そのIDのPinのPopoverを表示する
		// (modalPopoverElement参照)。Pin/Marker本体をクリック確定(ドラッグではない)した
		// 時点でトグルする(handleModalPinPointerDown参照)。Fullscreen Editorを開いた
		// 直後・Pin削除後の自動選択後は、いずれもPopoverを自動で開かない(常にnullのまま)。
		var openPopoverPinIdState = useState( null );
		var openPopoverPinId = openPopoverPinIdState[ 0 ];
		var setOpenPopoverPinId = openPopoverPinIdState[ 1 ];

		// 右側「ブロック全体の設定」のDrawer(狭い画面用)の開閉状態。
		var isSettingsDrawerOpenState = useState( false );
		var isSettingsDrawerOpen = isSettingsDrawerOpenState[ 0 ];
		var setIsSettingsDrawerOpen = isSettingsDrawerOpenState[ 1 ];

		function closeModal() {
			setIsModalOpen( false );
			setModalZoom( MODAL_ZOOM_DEFAULT );
			setModalPan( { x: 0, y: 0 } );
			setIsSettingsDrawerOpen( false );
			setPendingMenu( null );
			setOpenPopoverPinId( null );
		}

		var wrapperRef = useRef( null );
		var blockProps = useBlockProps();

		// pinSize/markerScale は「画像の元解像度(imageWidth)を基準にした値」として扱い、
		// 実際の表示幅との比率(widthRatio)を掛けてから描画する。これにより、画像が
		// レスポンシブに縮小されてもピンが画像に対して同じ比率のまま拡縮する。
		// 編集画面・フロントの両方で同じ考え方を使うことで見た目を一致させている。
		// キャンバス(表示専用)とモーダル内の画像編集エリアは別々のDOM要素・別々の表示幅を
		// 持つため、widthRatioもそれぞれ独立して計算する(モーダル側はmodalFitRatio参照)。
		var widthRatioState = useState( 1 );
		var widthRatio = widthRatioState[ 0 ];
		var setWidthRatio = widthRatioState[ 1 ];

		useEffect( function() {
			var wrapperEl = wrapperRef.current;
			if ( ! wrapperEl || ! attributes.imageUrl ) {
				return;
			}

			function recalc() {
				var naturalWidth = attributes.imageWidth || 0;
				var currentWidth = wrapperEl.clientWidth;
				var nextRatio = ( naturalWidth > 0 && currentWidth > 0 ) ? ( currentWidth / naturalWidth ) : 1;
				setWidthRatio( nextRatio );
			}

			recalc();

			if ( ! window.ResizeObserver ) {
				return;
			}
			var ro = new window.ResizeObserver( recalc );
			ro.observe( wrapperEl );
			return function() { ro.disconnect(); };
		}, [ attributes.imageUrl, attributes.imageWidth ] );

		displaySettings.widthRatio = widthRatio;

		// 静的キャンバス(表示専用。モーダルを閉じた通常のGutenbergブロック表示)専用の
		// Label位置。モーダルと同じcomputeLabelCenter()(Pin/Markerを囲む円周上の位置)を
		// 使うが、キャンバス自体にはZoom用のtransformが無いため、実測値をそのまま
		// ローカル単位として使える(zoomScale=1固定)。ドラッグ操作は持たない(表示のみ。
		// 編集はFullscreen Editor側でのみ行う)。
		var staticPinAnchorRefsRef = useRef( {} );
		function registerStaticPinAnchorRef( pinId, node ) {
			if ( node ) {
				staticPinAnchorRefsRef.current[ pinId ] = node;
			} else {
				delete staticPinAnchorRefsRef.current[ pinId ];
			}
		}
		var staticLabelRefsRef = useRef( {} );
		function registerStaticLabelRef( pinId, node ) {
			if ( node ) {
				staticLabelRefsRef.current[ pinId ] = node;
			} else {
				delete staticLabelRefsRef.current[ pinId ];
			}
		}

		var staticLabelRenderPositionsState = useState( {} );
		var staticLabelRenderPositions = staticLabelRenderPositionsState[ 0 ];
		var setStaticLabelRenderPositions = staticLabelRenderPositionsState[ 1 ];

		useLayoutEffect( function() {
			var wrapperEl = wrapperRef.current;
			if ( ! wrapperEl ) {
				return;
			}
			var next = {};
			var changed = false;
			pins.forEach( function( pin ) {
				var anchorEl = staticPinAnchorRefsRef.current[ pin.id ];
				var labelEl = staticLabelRefsRef.current[ pin.id ];
				if ( ! anchorEl || ! labelEl ) {
					return;
				}
				var pinRect = measureLocalRectRelativeTo( anchorEl, wrapperEl, 1 );
				var labelRect = measureLocalRectRelativeTo( labelEl, wrapperEl, 1 );
				if ( ! pinRect || ! labelRect ) {
					return;
				}
				var center = computeLabelCenter( pin, pinRect, { width: labelRect.width, height: labelRect.height } );
				next[ pin.id ] = { x: center.x, y: center.y };
				var prev = staticLabelRenderPositions[ pin.id ];
				if ( ! prev || Math.abs( prev.x - center.x ) > 0.5 || Math.abs( prev.y - center.y ) > 0.5 ) {
					changed = true;
				}
			} );
			if ( ! changed && Object.keys( next ).length !== Object.keys( staticLabelRenderPositions ).length ) {
				changed = true;
			}
			if ( changed ) {
				setStaticLabelRenderPositions( next );
			}
		} );

		// modalPreviewHostRef: Preview viewport(16:9)を最大containする、利用可能な
		// 領域(ズーム行・ピン一覧・個別設定を除いた残り)。modalWrapperRef: 実際に
		// 画像・ピンを描画する要素(Image wrapper)。Fit状態の実寸px(width/height)を
		// 明示的に持ち、Zoomはこの要素へのtransform: scale()、Panは親(Pan layer)への
		// transform: translate()として適用する(inline-blockの自動サイズには頼らない。
		// 理由: getBoundingClientRect()が常に「実際に画面上に表示されている画像の矩形」
		// と一致している必要があるため。詳細はdocs/DATA_LAYOUT.md参照)。
		var modalPreviewHostRef = useRef( null );
		var modalWrapperRef = useRef( null );
		// modalPreviewViewportRef: Preview viewport自体(16:9固定の窓)。マウスホイールに
		// よるZoom操作を、passiveではないaddEventListenerで登録するために使う
		// (React合成イベントのonWheelはpassive化されることがあり、preventDefault()が
		// 効かない場合があるため)。
		var modalPreviewViewportRef = useRef( null );
		// pendingMenuRef: 「ここにピンを追加」確認メニューのDOM要素(260920〜)。
		// メニュー表示中に、メニュー自身以外の場所がpointerdownされたら閉じる
		// (outside click dismiss)ための判定に使う。
		var pendingMenuRef = useRef( null );
		// openPopoverElRef: 現在開いているPopoverのDOM要素(260920〜)。Popoverは
		// pointer-events: none のため、その見た目の上でダブルクリックすると背後の
		// Preview viewportへdblclickが素通りしてしまう。「ここにピンを追加」の
		// 誤表示を防ぐため、handleViewportDoubleClick側でこの矩形内かどうかを判定する
		// (Popover自体の表示・操作設計は変更しない)。
		var openPopoverElRef = useRef( null );

		// Preview viewport自体の実サイズ(px)。利用可能な領域(host)へ、
		// MODAL_PREVIEW_ASPECT_RATIO(16:9)を最大containしたサイズ。
		// モーダルは開いている間だけDOMが存在するため、isModalOpenを依存配列に含めて
		// 開いた時点で測り直す。
		var modalPreviewSizeState = useState( { width: 0, height: 0 } );
		var modalPreviewSize = modalPreviewSizeState[ 0 ];
		var setModalPreviewSize = modalPreviewSizeState[ 1 ];

		useEffect( function() {
			var hostEl = modalPreviewHostRef.current;
			if ( ! isModalOpen || ! hostEl ) {
				return;
			}

			function recalc() {
				setModalPreviewSize( fitAspectRatioIntoRect( hostEl.clientWidth, hostEl.clientHeight, MODAL_PREVIEW_ASPECT_RATIO ) );
			}

			recalc();

			if ( ! window.ResizeObserver ) {
				return;
			}
			var ro = new window.ResizeObserver( recalc );
			ro.observe( hostEl );
			return function() { ro.disconnect(); };
		}, [ isModalOpen ] );

		// 画像をPreview viewportへ最大Fitさせる倍率(1.0で上限クランプしない。
		// Previewより小さい画像も拡大する)。host/viewportのサイズが変わるたびに
		// 再計算されるderived valueのため、専用のstate/effectは持たない。
		var modalFitRatio = calculateImageFitRatio( modalPreviewSize.width, modalPreviewSize.height, attributes.imageWidth || 0, attributes.imageHeight || 0 );
		// Fit状態(Zoom 100%)での画像の実表示サイズ(px)。Zoomはこれに対する
		// transform: scale()として適用するため、この値自体はZoom倍率を含まない。
		var modalBaseWidth = ( attributes.imageWidth || 0 ) * modalFitRatio;
		var modalBaseHeight = ( attributes.imageHeight || 0 ) * modalFitRatio;
		// 現在のZoom倍率を適用した、見た目上の実際の表示サイズ(Pan可能量の計算に使う)。
		var modalDisplayWidth = modalBaseWidth * ( modalZoom / 100 );
		var modalDisplayHeight = modalBaseHeight * ( modalZoom / 100 );

		// Zoom・Preview viewportのサイズが変わるたびに、新しいgeometryに合わせて
		// Pan位置を再clampする。100%(Fit)まで戻したときは必ずPan位置も0へ戻す
		// (100%ではPan可能量が常に0になるため、実質的にclampと同じ結果にはなるが、
		// 明示的にリセットすることで意図を明確にしている)。
		useEffect( function() {
			if ( ! isModalOpen ) {
				return;
			}
			if ( modalZoom <= MODAL_ZOOM_MIN ) {
				setModalPan( { x: 0, y: 0 } );
				return;
			}
			var bounds = calculatePanBounds( modalDisplayWidth, modalDisplayHeight, modalPreviewSize.width, modalPreviewSize.height );
			setModalPan( function( prev ) {
				return clampPan( prev, bounds );
			} );
		}, [ isModalOpen, modalZoom, modalDisplayWidth, modalDisplayHeight, modalPreviewSize.width, modalPreviewSize.height ] );

		// 「全体を表示する」: 現在のPreview viewportの実寸・画像のnatural sizeに対して
		// Fit状態(画像全体が最大サイズで収まる状態)へ再計算する。「Zoomを100%へ戻す」
		// という固定操作ではない点に注意: modalFitRatio自体がmodalPreviewSize(Preview
		// viewportの実寸。ResizeObserverで常に最新化される)とattributes.imageWidth/Height
		// から毎レンダリング再計算される値であり、Zoom=MODAL_ZOOM_DEFAULT(=Fit状態を表す
		// 100)・Pan=(0,0)は「その時点の再計算結果を採用する」という意味になる。将来
		// MODAL_PREVIEW_ASPECT_RATIO(現在16:9)を差し替えても、この関数自体は変更不要。
		function resetToFit() {
			setModalZoom( MODAL_ZOOM_DEFAULT );
			setModalPan( { x: 0, y: 0 } );
		}

		// 「画像として保存」(PNG書き出し)。元画像(natural dimensions)へ、保存済みの
		// pins[]・見た目設定からPin/Marker/Labelを一から合成する(Editor Previewの
		// スクリーンショットではない。詳細はdrawPinForExport等のコメント参照)。
		//
		// showSaveFilePicker()が使える環境では、このクリックハンドラから**直接**
		// (画像読み込み等の非同期処理を挟む前に)呼ぶ。showSaveFilePicker()は
		// transient user activationを必要とし、間に非同期処理(画像読み込み・Canvas
		// 描画等、時間がかかりうる)を挟むと、Picker表示時には失効している可能性が
		// あるため。保存先が決まった**あとで**PNGを生成し(generatePngBlob)、生成に
		// 成功した場合のみ実ファイルへの書き込み(writeBlobToFileHandle→
		// createWritable/write/close)を開始する(生成に失敗した場合、書き込み自体を
		// 一切始めないため、空ファイル・書きかけファイルを残さない)。
		function handleSaveAsImage() {
			if ( ! attributes.imageUrl || ! attributes.imageWidth || ! attributes.imageHeight ) {
				return;
			}
			var exportWidth = attributes.imageWidth;
			var exportHeight = attributes.imageHeight;
			var fileName = buildExportFileName( attributes.imageUrl );

			function reportGenerationError() {
				window.alert( __( 'Unable to save the image due to restrictions on an external image.', 'image-pin-block' ) );
			}

			if ( typeof window.showSaveFilePicker === 'function' ) {
				window.showSaveFilePicker( {
					suggestedName: fileName,
					types: [ {
						description: 'PNG image',
						accept: { 'image/png': [ '.png' ] }
					} ]
				} ).then( function( handle ) {
					return generatePngBlob( attributes.imageUrl, exportWidth, exportHeight, pins, displaySettings ).then( function( blob ) {
						return writeBlobToFileHandle( handle, blob );
					} );
				} ).catch( function( err ) {
					// ユーザーによるキャンセル(AbortError)は正常終了として扱う
					// (エラー表示しない・何も保存せず終了する)。
					if ( err && 'AbortError' === err.name ) {
						return;
					}
					reportGenerationError();
				} );
				return;
			}

			// showSaveFilePicker非対応環境: 従来どおりPNG生成後にBlob URL + <a download>
			// で(ブラウザ既定のダウンロード先へ)保存する。
			generatePngBlob( attributes.imageUrl, exportWidth, exportHeight, pins, displaySettings ).then( function( blob ) {
				triggerPngDownload( blob, fileName );
			} ).catch( function() {
				reportGenerationError();
			} );
		}

		// 「ここにピンを追加」確認メニューは、画像上の特定の位置に紐づくUIのため、
		// Zoom変更やPreviewのサイズ変更(ブラウザのリサイズ等)があった場合は候補位置の
		// 意味が薄れるため閉じる(メニュー自体はZoom/Panの対象にしていないため見た目上は
		// 動かないが、位置がずれた状態で「追加」を押せるままにしないための措置)。
		useEffect( function() {
			setPendingMenu( null );
		}, [ modalZoom, modalPreviewSize.width, modalPreviewSize.height ] );

		// Preview viewport上のマウスホイールで、既存のZoom(modalZoom)を5%刻みで操作する
		// (260919〜)。カーソル位置を中心にした補正は行わない(単純にZoom値を更新する
		// だけ)。React合成イベントのonWheelは環境によりpassive指定されることがあり
		// preventDefault()が効かない場合があるため、素のaddEventListenerで
		// {passive:false}を明示して登録する(既存のPointerイベント処理と同じ、素の
		// DOM APIを使うパターンに揃えている)。Preview viewport上でのwheelだけを対象にし、
		// document/window全体のscrollには一切手を加えない。Zoom値が実際に変わった場合、
		// 既存のuseEffect([modalZoom, ...])がPan位置の再clamp・pendingMenuのクローズを
		// 自動的に行う(このためだけの専用処理は不要)。
		useEffect( function() {
			if ( ! isModalOpen ) {
				return;
			}
			var viewportEl = modalPreviewViewportRef.current;
			if ( ! viewportEl ) {
				return;
			}

			function handleWheel( evt ) {
				// 横方向のみのホイール/トラックパッド操作ではZoomしない。
				if ( ! evt.deltaY ) {
					return;
				}
				evt.preventDefault();
				// deltaYの大きさ(マウス/トラックパッドで大きく異なりうる)を倍率には
				// 使わず、1回のwheelイベントにつき常に5%だけ動かす(暴走防止)。
				var step = ( evt.deltaY < 0 ) ? 5 : -5;
				setModalZoom( function( prev ) {
					return clampToRange( prev + step, MODAL_ZOOM_MIN, MODAL_ZOOM_MAX );
				} );
			}

			viewportEl.addEventListener( 'wheel', handleWheel, { passive: false } );
			return function() {
				viewportEl.removeEventListener( 'wheel', handleWheel );
			};
		}, [ isModalOpen ] );

		// 「ここにピンを追加」確認メニュー表示中、メニュー自身以外の場所がpointerdown
		// されたら閉じる(260920〜。対象: 画像の別の空き部分・Pin・Marker・Label・
		// Previewの別位置・右側設定欄・＋ボタン・その他Editor UI)。selectedPinIdには
		// 一切触れない(pendingMenuを閉じることと選択状態を変えることは別の関心事。
		// 画像の空き部分を単クリックした場合の選択解除は、既存どおり
		// handleViewportPointerDown側で個別に行う)。
		// capture フェーズ(第3引数 true)で登録することで、各要素が個別に持つ
		// onPointerDown の stopPropagation() の影響を受けずに、確実にこの判定を先に
		// 実行できるようにしている(bubbleフェーズだと、Pin/Marker/Label等の
		// stopPropagationでdocumentまで届かなくなってしまう)。
		useEffect( function() {
			if ( ! isModalOpen || pendingMenu === null ) {
				return;
			}

			function handleDocPointerDown( evt ) {
				var menuEl = pendingMenuRef.current;
				if ( menuEl && menuEl.contains( evt.target ) ) {
					return;
				}
				setPendingMenu( null );
			}

			document.addEventListener( 'pointerdown', handleDocPointerDown, true );
			return function() {
				document.removeEventListener( 'pointerdown', handleDocPointerDown, true );
			};
		}, [ isModalOpen, pendingMenu ] );

		// マーカー画像の実寸(naturalWidth、px)をピンIDごとにキャッシュする。
		// <img> の読み込み完了(onLoad)時に記録し、buildPinVisualOnly() が上限クランプの
		// 計算に使う(MARKER_MAX_WIDTH_RATIO 参照)。
		var markerNaturalWidthsState = useState( {} );
		var markerNaturalWidths = markerNaturalWidthsState[ 0 ];
		var setMarkerNaturalWidths = markerNaturalWidthsState[ 1 ];

		function handleMarkerImageLoad( pinId, naturalWidth ) {
			if ( ! naturalWidth || markerNaturalWidths[ pinId ] === naturalWidth ) {
				return;
			}
			var patch = {};
			patch[ pinId ] = naturalWidth;
			setMarkerNaturalWidths( function( prev ) {
				return Object.assign( {}, prev, patch );
			} );
		}

		displaySettings.markerNaturalWidths = markerNaturalWidths;
		displaySettings.onMarkerImageLoad = handleMarkerImageLoad;

		// マーカー画像の実際のDOM要素(<img>)をピンIDごとに保持する。再レンダリングを
		// 発生させる必要が無いデータなので state ではなく ref で持つ。モーダル内でのドラッグ
		// 移動時に getBoundingClientRect() で実際の描画位置・サイズを測定し、「マーカー画像の
		// 外形が本体画像の内側に収まる」よう移動範囲を制限するために使う(flexboxの中央寄せや
		// ラベルの有無による見た目上の位置ずれを、数式で再現せず実測することで正確に扱う)。
		// v0.2.0でモーダル化してからは、モーダル内の画像編集エリアの描画にのみ使う
		// (表示専用のキャンバス側では登録しない。displaySettingsではなくmodalDisplaySettings
		// 経由でbuildPinVisualOnlyに渡す)。
		var markerImageRefsRef = useRef( {} );
		function registerMarkerImageRef( pinId, node ) {
			if ( node ) {
				markerImageRefsRef.current[ pinId ] = node;
			} else {
				delete markerImageRefsRef.current[ pinId ];
			}
		}

		// Label位置(角丸矩形経路上のドラッグ配置)用のDOM参照。モーダル専用
		// (registerMarkerImageRef等と同じ理由でキャンバス側では登録しない)。
		// modalPinAnchorRefsRef: Pin/Marker本体(buildPinVisualOnlyが描画するコンテナ)。
		// modalLabelRefsRef: Label要素自体。どちらもgetBoundingClientRect()で実測し、
		// 数式で再現せず実際の描画結果からLabel位置を計算する(既存のマーカー移動範囲
		// 制限と同じ考え方)。
		var modalPinAnchorRefsRef = useRef( {} );
		function registerPinAnchorRef( pinId, node ) {
			if ( node ) {
				modalPinAnchorRefsRef.current[ pinId ] = node;
			} else {
				delete modalPinAnchorRefsRef.current[ pinId ];
			}
		}
		var modalLabelRefsRef = useRef( {} );
		function registerLabelRef( pinId, node ) {
			if ( node ) {
				modalLabelRefsRef.current[ pinId ] = node;
			} else {
				delete modalLabelRefsRef.current[ pinId ];
			}
		}

		// 各PinのLabelの実際の描画位置(ローカル単位のx/y中心座標)。ドラッグ中はhandleMove
		// 側でlabelPosition(保存属性)を直接更新するため、ここは「保存済みのlabelPositionと
		// 実際のPin/Marker・Labelのサイズから、画面に描画する座標を計算する」側だけを担当する。
		// Label文字列・Font Size・縁取り太さ・選択状態・Marker Resize・Preview resize等、
		// Label矩形やPin/Marker矩形のサイズへ影響しうるものが変わるたびに再計算が必要なため、
		// 依存配列を列挙する代わりに「毎レンダリング後に実測し、値が変わったときだけ
		// setStateする」方式にする(実測値が収束すればsetStateが起きなくなるため、
		// ResizeObserver等と同様の無限ループにはならない)。
		var labelRenderPositionsState = useState( {} );
		var labelRenderPositions = labelRenderPositionsState[ 0 ];
		var setLabelRenderPositions = labelRenderPositionsState[ 1 ];

		useLayoutEffect( function() {
			if ( ! isModalOpen ) {
				return;
			}
			var wrapperEl = modalWrapperRef.current;
			if ( ! wrapperEl ) {
				return;
			}
			var zoomScale = modalZoom / 100;
			var next = {};
			var changed = false;
			pins.forEach( function( pin ) {
				var anchorEl = modalPinAnchorRefsRef.current[ pin.id ];
				var labelEl = modalLabelRefsRef.current[ pin.id ];
				if ( ! anchorEl || ! labelEl ) {
					return;
				}
				var pinRect = measureLocalRectRelativeTo( anchorEl, wrapperEl, zoomScale );
				var labelRect = measureLocalRectRelativeTo( labelEl, wrapperEl, zoomScale );
				if ( ! pinRect || ! labelRect ) {
					return;
				}
				var center = computeLabelCenter( pin, pinRect, { width: labelRect.width, height: labelRect.height } );
				next[ pin.id ] = { x: center.x, y: center.y };
				var prev = labelRenderPositions[ pin.id ];
				if ( ! prev || Math.abs( prev.x - center.x ) > 0.5 || Math.abs( prev.y - center.y ) > 0.5 ) {
					changed = true;
				}
			} );
			// 既存のposition一覧に無いピン(削除された等)を残さないよう、キー数の違いも
			// 変化として扱う。
			if ( ! changed && Object.keys( next ).length !== Object.keys( labelRenderPositions ).length ) {
				changed = true;
			}
			if ( changed ) {
				setLabelRenderPositions( next );
			}
		} );

		// Labelを直接ドラッグして、Pin/Markerを囲む円周上の任意の位置へ配置する。
		// Pin/Marker中心は、ドラッグ開始時点で一度だけ実測する(位置移動そのものでは
		// Pin/Markerの大きさは変わらないため)。marker resize等と同様、ドラッグ中は
		// pins配列を直接更新し、pointerup時にまとめて確定するのではなく毎回commitする
		// 方式に揃える。理由はhandleModalPinPointerDown/handleMarkerResizePointerDownの
		// コメント参照)。
		function handleLabelDragPointerDown( pinId, evt ) {
			evt.stopPropagation();
			evt.preventDefault();
			// Labelクリックも、そのLabelが属するPinをクリックしたのと同じ扱いにする
			// (260920〜。非selectedなPinのLabelは選択のみ、既にselectedなPinのLabelは
			// 再クリックでPopover toggle)。Label drag自体(labelPositionの更新)は
			// この判定と無関係に、常にこれまでどおりpointer移動へ1px単位で追従させる。
			var wasSelectedAtStart = ( selectedPinId === pinId );
			var startClientX = evt.clientX;
			var startClientY = evt.clientY;
			var movedForPopover = false;
			setPendingMenu( null );
			setSelectedPinId( pinId );

			var wrapperEl = modalWrapperRef.current;
			var anchorEl = modalPinAnchorRefsRef.current[ pinId ];
			var labelEl = evt.currentTarget;
			if ( ! wrapperEl || ! anchorEl || ! labelEl ) {
				return;
			}

			var zoomScale = modalZoom / 100;
			var pin = pins.filter( function( p ) { return p.id === pinId; } )[ 0 ];
			if ( ! pin ) {
				return;
			}
			var pinRect = measureLocalRectRelativeTo( anchorEl, wrapperEl, zoomScale );
			if ( ! pinRect ) {
				return;
			}
			var centerX = pinRect.centerX;
			var centerY = pinRect.centerY;

			var pointerId = evt.pointerId;
			if ( labelEl.setPointerCapture ) {
				labelEl.setPointerCapture( pointerId );
			}

			// Pointer位置とPin/Marker中心からatan2で角度を求め、0以上1未満へ正規化する
			// だけの単純な計算(side/corner判定・最近傍点探索は不要)。atan2は
			// -π〜+πの境界(ちょうど中心の左側)を跨ぐと戻り値が不連続に変わるが、
			// 最終的な表示位置はcos/sin(周期関数)経由で決まるため、この境界を
			// 跨いでも見た目上のLabel位置がジャンプすることはない。
			function handleMove( moveEvt ) {
				if ( moveEvt.pointerId !== pointerId ) {
					return;
				}
				moveEvt.stopPropagation();

				if ( ! movedForPopover ) {
					var dx0 = moveEvt.clientX - startClientX;
					var dy0 = moveEvt.clientY - startClientY;
					if ( Math.sqrt( dx0 * dx0 + dy0 * dy0 ) >= PAN_CLICK_THRESHOLD_PX ) {
						movedForPopover = true;
					}
				}

				if ( zoomScale <= 0 ) {
					return;
				}
				var wRect = wrapperEl.getBoundingClientRect();
				var localX = ( moveEvt.clientX - wRect.left ) / zoomScale;
				var localY = ( moveEvt.clientY - wRect.top ) / zoomScale;
				var dx = localX - centerX;
				var dy = localY - centerY;
				var t = Math.atan2( dy, dx ) / ( Math.PI * 2 );
				t = ( ( t % 1 ) + 1 ) % 1;
				updatePins(
					pins.map( function( p ) {
						if ( p.id !== pinId ) {
							return p;
						}
						return Object.assign( {}, p, { labelPosition: t } );
					} )
				);
			}

			function endDrag( endEvt ) {
				if ( endEvt && endEvt.pointerId !== pointerId ) {
					return;
				}
				if ( endEvt ) {
					endEvt.stopPropagation();
				}
				if ( labelEl.hasPointerCapture && labelEl.hasPointerCapture( pointerId ) ) {
					labelEl.releasePointerCapture( pointerId );
				}
				labelEl.removeEventListener( 'pointermove', handleMove );
				labelEl.removeEventListener( 'pointerup', endDrag );
				labelEl.removeEventListener( 'pointercancel', endDrag );

				// Pin/Markerと同じtoggleルール(handleModalPinPointerDown参照)。
				if ( ! movedForPopover && endEvt && endEvt.type !== 'pointercancel' ) {
					if ( wasSelectedAtStart ) {
						setOpenPopoverPinId( function( prev ) {
							return ( prev === pinId ) ? null : pinId;
						} );
					} else {
						setOpenPopoverPinId( null );
					}
				}
			}

			labelEl.addEventListener( 'pointermove', handleMove );
			labelEl.addEventListener( 'pointerup', endDrag );
			labelEl.addEventListener( 'pointercancel', endDrag );
		}

		// getBlocksByName() はブロックエディタのストアが保持する索引を使うため、
		// 投稿内の全ブロックを毎回手動で走査する(旧実装)より効率的で、記事のブロック数が
		// 多いほど差が大きい。以前の実装は依存配列を渡さずレンダリングのたびに
		// getClientIdsWithDescendants()+全ブロック走査をしており、これ自体が独立した
		// パフォーマンス上の問題だった(記事が大きいほど編集画面全体が重くなる)ため、
		// getBlocksByName() を使う形に修正し、依存配列(空配列 = このセレクタはどの
		// ローカル変数にも依存しないため安定している)も渡すようにした。
		// getBlocksByName() 非対応の古い環境向けに、手動走査へのフォールバックを残す。
		var headingBlocks = useSelect( function( select ) {
			var editorSelect = select( 'core/block-editor' );
			if ( ! editorSelect || ! editorSelect.getBlock ) {
				return [];
			}
			var headingClientIds;
			if ( editorSelect.getBlocksByName ) {
				headingClientIds = editorSelect.getBlocksByName( 'core/heading' );
			} else if ( editorSelect.getClientIdsWithDescendants ) {
				headingClientIds = editorSelect.getClientIdsWithDescendants().filter( function( clientId ) {
					var block = editorSelect.getBlock( clientId );
					return block && block.name === 'core/heading';
				} );
			} else {
				headingClientIds = [];
			}
			return headingClientIds
				.map( function( clientId ) { return editorSelect.getBlock( clientId ); } )
				.filter( Boolean );
		}, [] );

		var targetOptions = [ { value: '', label: __( '(None selected)', 'image-pin-block' ) } ]
			.concat( buildHeadingOptions( headingBlocks || [] ) );

		// selectedPinIdが指すピンが(Undo等で)存在しなくなった場合にのみnullへ戻す。
		// 「他のピンが存在するから代わりに先頭を選ぶ」といった代理選択はしない
		// (未選択はあくまで未選択のまま。selectedPin自体が既にpins.forEachで
		// 見つからなければnullになる防御的な作りだが、selectedPinId自体も無効な値を
		// 持ち続けないよう明示的に揃えている)。
		useEffect( function() {
			if ( selectedPinId === null ) {
				return;
			}
			var exists = pins.some( function( p ) { return p.id === selectedPinId; } );
			if ( ! exists ) {
				setSelectedPinId( null );
			}
		}, [ pins, selectedPinId ] );

		// openPopoverPinIdについても同じ防御(Undo等で該当ピンが消えた場合にのみ閉じる)。
		useEffect( function() {
			if ( openPopoverPinId === null ) {
				return;
			}
			var existsForPopover = pins.some( function( p ) { return p.id === openPopoverPinId; } );
			if ( ! existsForPopover ) {
				setOpenPopoverPinId( null );
			}
		}, [ pins, openPopoverPinId ] );

		function updatePins( nextPins ) {
			setAttributes( { pins: nextPins } );
		}

		// pinSize/labelFontSize/popoverFontSize が未設定(0)の場合のみ、新しい画像の幅から自動計算する。
		// 一度でも値が設定されていれば(ユーザーの調整、または過去の自動計算のいずれでも)、
		// 以後の画像変更で上書きしない(ユーザーが調整した値を尊重するため)。
		function handleSelectImage( media ) {
			var newImageWidth = media.width || 0;
			var updates = {
				imageId: media.id,
				imageUrl: media.url,
				imageWidth: newImageWidth,
				imageHeight: media.height || 0
			};
			if ( ! attributes.pinSize && newImageWidth > 0 ) {
				updates.pinSize = clampToRange( Math.round( newImageWidth * PIN_SIZE_AUTO_RATIO ), PIN_SIZE_MIN, PIN_SIZE_MAX );
			}
			if ( ! attributes.labelFontSize && newImageWidth > 0 ) {
				updates.labelFontSize = clampToRange( Math.round( newImageWidth * LABEL_FONT_SIZE_AUTO_RATIO ), LABEL_FONT_SIZE_MIN, LABEL_FONT_SIZE_MAX );
			}
			if ( ! attributes.popoverFontSize && newImageWidth > 0 ) {
				updates.popoverFontSize = clampToRange( Math.round( newImageWidth * POPOVER_FONT_SIZE_AUTO_RATIO ), POPOVER_FONT_SIZE_MIN, POPOVER_FONT_SIZE_MAX );
			}
			setAttributes( updates );
		}

		// キャンバス(表示専用)をダブルクリックすると編集モーダルを開く。
		function handleCanvasDoubleClick() {
			setIsModalOpen( true );
		}

		// 新規ピンを%座標(x, y)の位置に追加し、選択状態にする。
		// モーダル内の画像クリック(handleViewportPointerDown)・「+」ボタン
		// (addPinAtCenter)の両方から使う共通処理。
		function createPinAt( x, y ) {
			var newPin = {
				id: generatePinId( pins ),
				x: x,
				y: y,
				label: '',
				description: '',
				target: '',
				markerImageId: 0,
				markerImageUrl: '',
				markerScale: DEFAULT_MARKER_SCALE,
				showLabel: true
			};
			updatePins( pins.concat( [ newPin ] ) );
			setSelectedPinId( newPin.id );
			// 新規作成したピンのPopoverは開かない(念のための明示。260920〜)。
			setOpenPopoverPinId( null );
		}

		// モーダル内、Preview viewport(画像・黒いletterbox部分の両方を含む)での
		// pointerdown。ピン自体のpointerdownは stopPropagation されているため、
		// ここに来るのは常に「ピン操作ではない」背景操作。
		//
		// クリック(選択解除)とドラッグ(Pan)は、pointer移動距離で区別する
		// (PAN_CLICK_THRESHOLD_PX未満ならクリック、以上ならPan。手ブレでPan扱いに
		// ならないよう4〜6px程度を目安にしている)。260919〜: 単クリックでは
		// Pin追加候補を出さず、選択解除・Popoverを閉じるだけの操作にした
		// (「ここにピンを追加」の表示はhandleViewportDoubleClick=ダブルクリックへ移した。
		// 既存のpendingMenu/addPinFromMenu/createPinAtの仕組み自体は変更していない)。
		//
		// Zoom > 100% で画像がPreviewより大きい軸は、letterbox部分からドラッグを
		// 開始してもPanできる(黒い余白も含めて「画面」全体をドラッグする感覚のため)。
		// Panが始まった時点(moved=true)でpendingMenuを閉じる(候補位置とドラッグ後の
		// 見た目がずれるのを避けるため)。
		function handleViewportPointerDown( evt ) {
			// ブラウザ既定の画像ドラッグ(ゴースト表示)を防ぐ。既存のピンドラッグ
			// (handleModalPinPointerDown)と同じ考え方。
			evt.preventDefault();
			var viewportEl = evt.currentTarget;
			var pointerId = evt.pointerId;
			var startClientX = evt.clientX;
			var startClientY = evt.clientY;
			var startPan = modalPan;
			var moved = false;

			if ( viewportEl.setPointerCapture ) {
				viewportEl.setPointerCapture( pointerId );
			}

			function handleMove( moveEvt ) {
				if ( moveEvt.pointerId !== pointerId ) {
					return;
				}
				var dx = moveEvt.clientX - startClientX;
				var dy = moveEvt.clientY - startClientY;
				if ( ! moved && Math.sqrt( dx * dx + dy * dy ) >= PAN_CLICK_THRESHOLD_PX ) {
					moved = true;
					setPendingMenu( null );
				}
				if ( ! moved ) {
					return;
				}
				var bounds = calculatePanBounds( modalDisplayWidth, modalDisplayHeight, modalPreviewSize.width, modalPreviewSize.height );
				setModalPan( clampPan( { x: startPan.x + dx, y: startPan.y + dy }, bounds ) );
			}

			function endDrag( endEvt ) {
				if ( endEvt && endEvt.pointerId !== pointerId ) {
					return;
				}
				if ( viewportEl.hasPointerCapture && viewportEl.hasPointerCapture( pointerId ) ) {
					viewportEl.releasePointerCapture( pointerId );
				}
				viewportEl.removeEventListener( 'pointermove', handleMove );
				viewportEl.removeEventListener( 'pointerup', endDrag );
				viewportEl.removeEventListener( 'pointercancel', endDrag );

				// pointercancelは、ブラウザがジェスチャーを中断した場合(コンテキスト
				// メニュー表示・マルチタッチ等)に発火し、座標が信頼できないため
				// クリック扱いにはしない。後片付けのみ行う。
				if ( moved || ! endEvt || endEvt.type === 'pointercancel' ) {
					return;
				}
				// 単クリック確定: 選択解除・Popoverを閉じるだけ(Pin追加候補は出さない。
				// letterbox・実画像どちらのクリックでも同じ扱いでよい。選択解除自体は
				// 画像の矩形内外を問わず安全な操作のため、isPointInsideRectでの絞り込みは
				// 行わない)。
				setSelectedPinId( null );
				setOpenPopoverPinId( null );
			}

			viewportEl.addEventListener( 'pointermove', handleMove );
			viewportEl.addEventListener( 'pointerup', endDrag );
			viewportEl.addEventListener( 'pointercancel', endDrag );
		}

		// 画像の空いている部分(実画像の矩形内)をダブルクリックした場合だけ、その位置へ
		// 「ここにピンを追加」確認メニューを表示する(即座にPinを作成するのではなく、
		// 既存のpendingMenu/addPinFromMenu/createPinAtの確認フローをそのまま使う)。
		// Pin・Marker・Label・Popover・リサイズハンドル・pendingMenu自身は、それぞれ
		// onDoubleClickでstopPropagationしているため、これらをダブルクリックしても
		// ここには到達しない(背景への誤伝播を防ぐ)。letterbox部分(実画像の矩形外)の
		// ダブルクリックも無視する。
		function handleViewportDoubleClick( evt ) {
			var wrapperEl = modalWrapperRef.current;
			var viewportEl = evt.currentTarget;
			if ( ! wrapperEl ) {
				return;
			}
			// Popoverは pointer-events: none のため、その見た目の上でダブルクリック
			// すると背後のこのハンドラへdblclickが素通りしてしまう。開いているPopoverの
			// 矩形内であれば「ここにピンを追加」を出さずに無視する(260920〜。Popover自体の
			// 表示・操作設計・pointer-eventsの指定は変更しない、最小限のguard)。
			var openPopoverEl = openPopoverElRef.current;
			if ( openPopoverEl && isPointInsideRect( evt.clientX, evt.clientY, openPopoverEl.getBoundingClientRect() ) ) {
				return;
			}
			var imageRect = wrapperEl.getBoundingClientRect();
			if ( ! isPointInsideRect( evt.clientX, evt.clientY, imageRect ) ) {
				return;
			}
			var point = percentFromClientPoint( evt.clientX, evt.clientY, imageRect );
			// メニュー自体の表示位置はviewport基準のpx(Zoom/Panのtransformの外側に
			// 描画するため、Zoom/Panで一緒に拡大・移動しない)。
			var viewportRect = viewportEl.getBoundingClientRect();
			setSelectedPinId( null );
			setOpenPopoverPinId( null );
			setPendingMenu( {
				x: point.x,
				y: point.y,
				left: evt.clientX - viewportRect.left,
				top: evt.clientY - viewportRect.top
			} );
		}

		// 「ここにピンを追加」ボタン。pendingMenuのx/yで新規ピンを作成し、選択状態にして
		// メニューを閉じる。
		function addPinFromMenu() {
			if ( ! pendingMenu ) {
				return;
			}
			createPinAt( pendingMenu.x, pendingMenu.y );
			setPendingMenu( null );
		}

		// モーダル内、「ピン一覧」の「+」ボタン。画像中央に新規ピンを追加する
		// (「ここにピンを追加」の確認menuとは別の、明示的な追加手段。確認menuが
		// 開いていた場合は候補位置の意味が無くなるため閉じる)。
		function addPinAtCenter() {
			setPendingMenu( null );
			createPinAt( 50, 50 );
		}

		// 選択中のピンを複製する。位置が完全に重なると掴みにくいため、少しずらして配置する。
		function duplicateSelectedPin() {
			if ( ! selectedPin ) {
				return;
			}
			setPendingMenu( null );
			var newPin = Object.assign( {}, selectedPin, {
				id: generatePinId( pins ),
				x: clampPercent( selectedPin.x + DUPLICATE_OFFSET_PERCENT ),
				y: clampPercent( selectedPin.y + DUPLICATE_OFFSET_PERCENT )
			} );
			updatePins( pins.concat( [ newPin ] ) );
			setSelectedPinId( newPin.id );
			// 複製元のPopoverが開いていた場合に備え、複製後のピンのPopoverは
			// 自動で開かない(260920〜。選択とPopover open stateの分離を徹底する)。
			setOpenPopoverPinId( null );
		}

		// モーダル内、画像編集エリアでのピンのドラッグ移動。ポインタダウンした時点でそのピンを
		// 選択状態にする(クリックのみで移動しない場合も、これにより選択が切り替わる)。
		// v0.1.x系ではブロック自身のキャンバス(wrapperRef)に対して行っていたが、v0.2.0で
		// モーダル内の画像編集エリア(modalWrapperRef)に置き換えた。ズーム(modalZoom)は
		// transform: scale() で見た目だけを拡大縮小しており、getBoundingClientRect() は
		// 常に画面上の実際の見た目のサイズ・位置を返すため、ズーム倍率に関わらずこの関数は
		// 変更なしで正しく動作する。260919〜: ドラッグではなくクリックとして完了した
		// 場合(movedForPopover参照)に限り、そのピンのPopoverをトグルする(pointerdown
		// 自体ではトグルしない。ドラッグのたびにPopoverが開閉すると邪魔になるため)。
		// 丸マーカー・画像マーカーどちらもこの同じ関数で処理するため、操作体系は共通。
		function handleModalPinPointerDown( pinId, evt ) {
			evt.stopPropagation();
			evt.preventDefault();
			// このPin/Markerが、この操作が始まる前から既にselected状態だったかどうか
			// (260920〜)。Popover toggleの可否はこれで決める(下記endDrag参照。
			// setSelectedPinIdを呼んだ後でも、このクロージャ内のselectedPinId自体は
			// 今回のrenderの値のまま変わらないため、ここで読んでも下で読んでも同じ)。
			var wasSelectedAtStart = ( selectedPinId === pinId );
			setPendingMenu( null );
			setSelectedPinId( pinId );

			var wrapperEl = modalWrapperRef.current;
			if ( ! wrapperEl ) {
				return;
			}

			var pointerId = evt.pointerId;
			var pinEl = evt.currentTarget;
			var startClientX = evt.clientX;
			var startClientY = evt.clientY;
			// クリック確定(ドラッグではない)時のみPopoverをtoggleするための判定
			// (260919〜)。ピン移動自体は既存どおり1px単位で追従させたまま、Popover
			// toggleの可否だけをPAN_CLICK_THRESHOLD_PXベースで別途判定する
			// (handleViewportPointerDownのmoved判定と同じ考え方)。
			var movedForPopover = false;

			// setPointerCapture で以降の pointermove/pointerup をこのピン要素に固定する。
			// これが無いと、ドラッグ中にポインタが画像側へ出た瞬間の click が
			// 画像側(新規ピン追加ハンドラ)に発火してしまう。
			if ( pinEl.setPointerCapture ) {
				pinEl.setPointerCapture( pointerId );
			}

			// マーカー画像を持つピンは、その外形が本体画像の内側に収まるよう移動範囲を
			// 制限する(丸マーカーは対象外。詳細は docs/DATA_LAYOUT.md の
			// 「マーカー画像の移動範囲の制限」参照)。
			// flexboxの中央寄せ・ラベルの有無による見た目上のオフセットを数式で再現する代わりに、
			// ドラッグ開始時点で実際に描画されたマーカー画像の位置を getBoundingClientRect() で
			// 測定し、アンカー点(x%,y%が指す位置)からの相対オフセットとして保持する。
			// このオフセットとサイズは、位置移動だけでは(リサイズを伴わないため)変化しない。
			var pinForDrag = pins.filter( function( p ) { return p.id === pinId; } )[ 0 ];
			var moveContainment = null;
			if ( pinForDrag && pinForDrag.markerImageUrl ) {
				var markerImgElForMove = markerImageRefsRef.current[ pinId ];
				if ( markerImgElForMove ) {
					var wRectForMove = wrapperEl.getBoundingClientRect();
					var imgRectForMove = markerImgElForMove.getBoundingClientRect();
					var anchorClientX = wRectForMove.left + ( clampPercent( pinForDrag.x ) / 100 ) * wRectForMove.width;
					var anchorClientY = wRectForMove.top + ( clampPercent( pinForDrag.y ) / 100 ) * wRectForMove.height;
					moveContainment = {
						offsetX: imgRectForMove.left - anchorClientX,
						offsetY: imgRectForMove.top - anchorClientY,
						width: imgRectForMove.width,
						height: imgRectForMove.height
					};
				}
			}

			function handleMove( moveEvt ) {
				if ( moveEvt.pointerId !== pointerId ) {
					return;
				}
				moveEvt.stopPropagation();

				if ( ! movedForPopover ) {
					var dx0 = moveEvt.clientX - startClientX;
					var dy0 = moveEvt.clientY - startClientY;
					if ( Math.sqrt( dx0 * dx0 + dy0 * dy0 ) >= PAN_CLICK_THRESHOLD_PX ) {
						movedForPopover = true;
					}
				}

				var clientX = moveEvt.clientX;
				var clientY = moveEvt.clientY;
				var wRect = wrapperEl.getBoundingClientRect();

				if ( moveContainment ) {
					var minAnchorX = wRect.left - moveContainment.offsetX;
					var maxAnchorX = wRect.right - moveContainment.offsetX - moveContainment.width;
					var minAnchorY = wRect.top - moveContainment.offsetY;
					var maxAnchorY = wRect.bottom - moveContainment.offsetY - moveContainment.height;
					// マーカー画像が本体画像より大きく、どこに置いても収まりきらない場合は
					// (通常は上限クランプにより起こらないが念のため)、中央寄せで妥協する。
					clientX = ( minAnchorX <= maxAnchorX ) ? clampToRange( clientX, minAnchorX, maxAnchorX ) : ( minAnchorX + maxAnchorX ) / 2;
					clientY = ( minAnchorY <= maxAnchorY ) ? clampToRange( clientY, minAnchorY, maxAnchorY ) : ( minAnchorY + maxAnchorY ) / 2;
				}

				var point = percentFromClientPoint( clientX, clientY, wRect );
				updatePins(
					pins.map( function( p ) {
						if ( p.id !== pinId ) {
							return p;
						}
						return Object.assign( {}, p, { x: point.x, y: point.y } );
					} )
				);
			}

			function endDrag( endEvt ) {
				if ( endEvt && endEvt.pointerId !== pointerId ) {
					return;
				}
				if ( endEvt ) {
					endEvt.stopPropagation();
				}
				if ( pinEl.hasPointerCapture && pinEl.hasPointerCapture( pointerId ) ) {
					pinEl.releasePointerCapture( pointerId );
				}
				pinEl.removeEventListener( 'pointermove', handleMove );
				pinEl.removeEventListener( 'pointerup', endDrag );
				pinEl.removeEventListener( 'pointercancel', endDrag );
				setSelectedPinId( pinId );

				// ドラッグ(movedForPopover)でもpointercancel(座標が信頼できない中断)でも
				// なく、クリックとして完了した場合のみPopoverの状態を変える。pointerdown
				// 自体ではtoggleしない(ドラッグのたびにPopoverが開閉してしまうため)。
				// 260920〜: 「非selectedだったPinの1回目クリックは選択のみ(Popoverは
				// 閉じる)、既にselectedだったPinの再クリックだけがPopoverをtoggleする」
				// という仕様に変更(以前はselected済みかどうかを問わず常にtoggleしていた)。
				if ( ! movedForPopover && endEvt && endEvt.type !== 'pointercancel' ) {
					if ( wasSelectedAtStart ) {
						setOpenPopoverPinId( function( prev ) {
							return ( prev === pinId ) ? null : pinId;
						} );
					} else {
						setOpenPopoverPinId( null );
					}
				}
			}

			pinEl.addEventListener( 'pointermove', handleMove );
			pinEl.addEventListener( 'pointerup', endDrag );
			pinEl.addEventListener( 'pointercancel', endDrag );
		}

		// 画像マーカーのドラッグリサイズ(v0.1.x系から復元)。選択中のマーカー画像ピンにのみ
		// ハンドルが表示されるため、常に「選択中かつ画像マーカーを持つピン」に対して呼ばれる。
		// handleModalPinPointerDown(位置移動)と同様、setPointerCapture でハンドル要素自身に
		// 以降の pointermove/pointerup を固定する(handleEl 側で stopPropagation 済みのため
		// ピン本体側の位置移動ハンドラとは競合しない)。
		// v0.1.x系との違いは ratio の扱いのみ: v0.1.x系はモーダルが無くwidthRatioのみで
		// 画面上サイズが決まっていたが、v0.2.0のモーダルはFit(modalFitRatio)適用後の
		// image wrapperにさらにZoom(modalZoom)をCSS transform: scale()で掛けているため、
		// 実際の画面上サイズへ変換するには両方を掛け合わせた実効比率が必要になる。
		// getBoundingClientRect() は常にこの実効比率適用後の実際の見た目を返すため、
		// containment(はみ出し防止)の測定自体はv0.1.x系から変更していない。
		function handleMarkerResizePointerDown( pinId, evt ) {
			evt.preventDefault();
			var pin = pins.filter( function( p ) { return p.id === pinId; } )[ 0 ];
			var naturalW = markerNaturalWidths[ pinId ] || 0;
			var wrapperEl = modalWrapperRef.current;
			if ( ! pin || naturalW <= 0 || ! wrapperEl ) {
				return;
			}

			var ratio = ( modalFitRatio || 1 ) * ( modalZoom / 100 );
			var mainWidth = attributes.imageWidth || 0;
			// 本体画像の幅が不明な場合は、markerScale の上限(MARKER_SCALE_MAX)自体を上限とする
			// (MARKER_MAX_WIDTH_RATIO による追加の上限は適用しない)。
			var maxBaseWidthFromRatio = ( mainWidth > 0 ) ? ( mainWidth * MARKER_MAX_WIDTH_RATIO ) : ( naturalW * MARKER_SCALE_MAX / 100 );

			// マーカー画像の外形が本体画像の内側に収まるよう、表示幅にもう一つ上限を設ける。
			// flexboxの中央寄せにより、マーカー画像はラベルの有無・高さに関わらず「自分自身の
			// 中心点」を軸に拡大縮小される(位置は変わらない)ため、ドラッグ開始時点で測定した
			// その中心点と本体画像の四辺との距離のうち、最も小さいものが拡大できる限度になる。
			var markerImgEl = markerImageRefsRef.current[ pinId ];
			var maxDisplayWidthFromContainment = Number.POSITIVE_INFINITY;
			if ( markerImgEl ) {
				var imgRect0 = markerImgEl.getBoundingClientRect();
				if ( imgRect0.width > 0 && imgRect0.height > 0 ) {
					var aspectRatio = imgRect0.width / imgRect0.height;
					var imageCenterX = imgRect0.left + imgRect0.width / 2;
					var imageCenterY = imgRect0.top + imgRect0.height / 2;
					var wRect0 = wrapperEl.getBoundingClientRect();
					var maxWidthFromLeft = 2 * ( imageCenterX - wRect0.left );
					var maxWidthFromRight = 2 * ( wRect0.right - imageCenterX );
					var maxWidthFromTop = 2 * ( imageCenterY - wRect0.top ) * aspectRatio;
					var maxWidthFromBottom = 2 * ( wRect0.bottom - imageCenterY ) * aspectRatio;
					maxDisplayWidthFromContainment = Math.max( 0, Math.min( maxWidthFromLeft, maxWidthFromRight, maxWidthFromTop, maxWidthFromBottom ) );
				}
			}

			// 上記2つの上限(本体画像幅の50%、画像内に収まる範囲)のうち、より厳しい方を採用する。
			var maxDisplayWidth = Math.min( maxBaseWidthFromRatio * ratio, maxDisplayWidthFromContainment );
			var maxBaseWidth = maxDisplayWidth / ratio;

			// ドラッグで到達できる markerScale の実効範囲。表示幅の上限・下限(px)を
			// markerScale(%)に換算し、既存の 1〜500% の範囲内に収める。
			var effectiveMaxScale = clampToRange( ( maxBaseWidth / naturalW ) * 100, MARKER_SCALE_MIN, MARKER_SCALE_MAX );
			var minScaleForFloor = ( MARKER_MIN_DISPLAY_WIDTH_PX / ratio / naturalW ) * 100;
			var effectiveMinScale = clampToRange( minScaleForFloor, MARKER_SCALE_MIN, effectiveMaxScale );

			var startScale = resolveMarkerScale( pin );
			var startBaseWidth = Math.min( naturalW * ( startScale / 100 ), maxBaseWidth );
			var startDisplayWidth = startBaseWidth * ratio;

			var pointerId = evt.pointerId;
			var handleEl = evt.currentTarget;
			var startClientX = evt.clientX;

			if ( handleEl.setPointerCapture ) {
				handleEl.setPointerCapture( pointerId );
			}

			function handleMove( moveEvt ) {
				if ( moveEvt.pointerId !== pointerId ) {
					return;
				}
				moveEvt.stopPropagation();
				var deltaX = moveEvt.clientX - startClientX;
				var newDisplayWidth = clampToRange( startDisplayWidth + deltaX, MARKER_MIN_DISPLAY_WIDTH_PX, maxDisplayWidth );
				var newScale = ( newDisplayWidth / ratio / naturalW ) * 100;
				newScale = clampToRange( newScale, effectiveMinScale, effectiveMaxScale );
				newScale = Math.round( newScale * 10 ) / 10;
				updatePins(
					pins.map( function( p ) {
						if ( p.id !== pinId ) {
							return p;
						}
						return Object.assign( {}, p, { markerScale: newScale } );
					} )
				);
			}

			function endDrag( endEvt ) {
				if ( endEvt && endEvt.pointerId !== pointerId ) {
					return;
				}
				if ( endEvt ) {
					endEvt.stopPropagation();
				}
				if ( handleEl.hasPointerCapture && handleEl.hasPointerCapture( pointerId ) ) {
					handleEl.releasePointerCapture( pointerId );
				}
				handleEl.removeEventListener( 'pointermove', handleMove );
				handleEl.removeEventListener( 'pointerup', endDrag );
				handleEl.removeEventListener( 'pointercancel', endDrag );
			}

			handleEl.addEventListener( 'pointermove', handleMove );
			handleEl.addEventListener( 'pointerup', endDrag );
			handleEl.addEventListener( 'pointercancel', endDrag );
		}

		// 選択中のピンに複数フィールドをまとめて反映する。
		// 1回の setAttributes で確定させるため、フィールドごとに分けて呼ばない
		// (updatePins は pins の最新値を前提にしており、連続呼び出しだと後勝ちで消えるフィールドが出る)。
		function updateSelectedPinFields( fields ) {
			updatePins(
				pins.map( function( p ) {
					if ( p.id !== selectedPinId ) {
						return p;
					}
					return Object.assign( {}, p, fields );
				} )
			);
		}

		function updateSelectedPin( field, value ) {
			var fields = {};
			fields[ field ] = value;
			updateSelectedPinFields( fields );
		}

		function handleSelectMarkerImage( media ) {
			updateSelectedPinFields( {
				markerImageId: media.id,
				markerImageUrl: media.url
			} );
		}

		function clearMarkerImage() {
			updateSelectedPinFields( {
				markerImageId: 0,
				markerImageUrl: ''
			} );
		}

		// 選択中のピンを削除する。作業を継続しやすいよう、削除後は次のピンを自動選択する
		// (削除前のindex位置に残っているピンがあればそれ=「次のピン」、無ければひとつ前の
		// ピン、1件も残らなければ未選択)。260920〜: 削除操作を行った場合は常にPopoverを
		// 閉じる(削除したピンのPopoverが開いていたかどうかは問わない)。自動選択された
		// 次/前のピンのPopoverを勝手に開くこともしない。
		function removeSelectedPin() {
			var ids = pins.map( function( p ) { return p.id; } );
			var index = ids.indexOf( selectedPinId );
			if ( index === -1 ) {
				return;
			}
			var nextPins = pins.filter( function( p ) { return p.id !== selectedPinId; } );
			updatePins( nextPins );
			var nextSelectedId = null;
			if ( nextPins.length > 0 ) {
				var nextIndex = ( index < nextPins.length ) ? index : nextPins.length - 1;
				nextSelectedId = nextPins[ nextIndex ].id;
			}
			setSelectedPinId( nextSelectedId );
			setOpenPopoverPinId( null );
		}

		var selectedPin = null;
		pins.forEach( function( p ) {
			if ( p.id === selectedPinId ) {
				selectedPin = p;
			}
		} );

		// v0.2.0で編集UIをモーダルに集約したため、サイドバーには「ピンを編集」ボタンのみを置く。
		// 旧「Display settings」「Pin color」「Pin label」「Popover」パネルはモーダル内の
		// 「ブロック全体の設定」(blockSettingsPanel)へ、旧「Pin settings」パネルは
		// モーダル内の「画像＋右の基本設定」「ピン一覧」「マーカー画像」へ、それぞれ移設した。
		var inspector = el(
			InspectorControls,
			{},
			attributes.imageUrl
				? el(
					PanelBody,
					{},
					el( Button, {
						variant: 'primary',
						className: 'image-pin-block-editor__open-modal-button',
						onClick: function() { setIsModalOpen( true ); }
					}, __( 'Edit pins', 'image-pin-block' ) )
				)
				: null
		);

		if ( ! attributes.imageUrl ) {
			return el(
				'div',
				blockProps,
				inspector,
				el(
					MediaUploadCheck,
					{},
					el( MediaUpload, {
						onSelect: handleSelectImage,
						allowedTypes: [ 'image/png', 'image/jpeg' ],
						render: function( obj ) {
							return el(
								Button,
								{ variant: 'primary', onClick: obj.open },
								__( 'Select image', 'image-pin-block' )
							);
						}
					} )
				)
			);
		}

		// モーダル右側「ブロック全体の設定」。ピンごとではなくブロック全体に対する設定を
		// まとめる。既存の属性をそのまま使い、新規属性は追加しない(旧「Display settings」
		// 「Pin color」「Pin label」「Popover」パネルの内容を統合)。折りたたみ無しの常時展開
		// とし、モーダル右側の縦一本の領域に収める(1列。右側の幅が狭いため2列にはしない)。
		// デスクトップでは常設の縦一本の領域として表示するが、画面が狭い場合はCSSで
		// position: fixed の右側Drawerに切り替わる(is-drawer-openクラスで開閉。
		// editor.css参照)。新しいwp.components.Modalを入れ子にはしない。
		var blockSettingsPanel = el(
			'div',
			{ className: 'image-pin-block-editor__modal-right' + ( isSettingsDrawerOpen ? ' is-drawer-open' : '' ) },
			el( 'h3', { className: 'image-pin-block-editor__modal-settings-heading image-pin-block-editor__modal-settings-heading--first' }, __( 'Block-wide settings', 'image-pin-block' ) ),
			el(
				'div',
				{ className: 'image-pin-block-editor__modal-settings-grid' },
				el( SelectControl, {
					label: __( 'Desktop behavior', 'image-pin-block' ),
					value: attributes.pcBehavior,
					options: [
						{ value: 'hover-click', label: __( 'Show description on hover, click to jump', 'image-pin-block' ) },
						{ value: 'click-link', label: __( 'Show description on click, jump via link in description', 'image-pin-block' ) }
					],
					onChange: function( value ) { setAttributes( { pcBehavior: value } ); }
				} ),
				el( SelectControl, {
					label: __( 'Mobile behavior', 'image-pin-block' ),
					value: attributes.mobileBehavior,
					options: [
						{ value: 'tap-jump', label: __( 'Tap to jump immediately', 'image-pin-block' ) },
						{ value: 'tap-tap', label: __( 'First tap shows description, second tap jumps', 'image-pin-block' ) },
						{ value: 'tap-link', label: __( 'Show description on tap, jump via link in description', 'image-pin-block' ) }
					],
					onChange: function( value ) { setAttributes( { mobileBehavior: value } ); }
				} ),
				el( ClampedNumberControl, {
					label: __( 'Pin size (px, round marker only)', 'image-pin-block' ),
					value: displaySettings.pinSize,
					min: PIN_SIZE_MIN,
					max: PIN_SIZE_MAX,
					defaultValue: DEFAULT_PIN_SIZE,
					onCommit: function( n ) { setAttributes( { pinSize: n } ); }
				} ),
				PanelColorSettings
					? el( PanelColorSettings, {
						title: __( 'Pin color', 'image-pin-block' ),
						colorSettings: [
							{
								value: displaySettings.pinColor,
								onChange: function( color ) { setAttributes( { pinColor: color || DEFAULT_PIN_COLOR } ); },
								label: __( 'Pin color (round marker only)', 'image-pin-block' )
							}
						]
					} )
					: null,
				el(
					MediaUploadCheck,
					{},
					el( MediaUpload, {
						onSelect: handleSelectImage,
						value: attributes.imageId,
						allowedTypes: [ 'image/png', 'image/jpeg' ],
						render: function( obj ) {
							return el(
								Button,
								{ variant: 'secondary', onClick: obj.open },
								__( 'Change image', 'image-pin-block' )
							);
						}
					} )
				),
				el( 'h3', { className: 'image-pin-block-editor__modal-settings-heading' }, __( 'Pin label', 'image-pin-block' ) ),
				el( ClampedNumberControl, {
					label: __( 'Label font size (px)', 'image-pin-block' ),
					value: displaySettings.labelFontSize,
					min: LABEL_FONT_SIZE_MIN,
					max: LABEL_FONT_SIZE_MAX,
					defaultValue: DEFAULT_LABEL_FONT_SIZE,
					onCommit: function( n ) { setAttributes( { labelFontSize: n } ); }
				} ),
				el( ColorInputRow, {
					label: __( 'Label text color', 'image-pin-block' ),
					value: displaySettings.labelTextColor,
					onPreview: function( color ) { setColorPreview( 'labelTextColor', color ); },
					onPreviewClear: function() { clearColorPreview( 'labelTextColor' ); },
					onCommit: function( color ) { setAttributes( { labelTextColor: color || DEFAULT_LABEL_TEXT_COLOR } ); }
				} ),
				el( ColorInputRow, {
					label: __( 'Label stroke color', 'image-pin-block' ),
					value: displaySettings.labelStrokeColor,
					onPreview: function( color ) { setColorPreview( 'labelStrokeColor', color ); },
					onPreviewClear: function() { clearColorPreview( 'labelStrokeColor' ); },
					onCommit: function( color ) { setAttributes( { labelStrokeColor: color || DEFAULT_STROKE_COLOR } ); }
				} ),
				el( SelectControl, {
					label: __( 'Label stroke width', 'image-pin-block' ),
					value: displaySettings.labelStrokeWidth,
					options: STROKE_WIDTH_OPTIONS,
					onChange: function( value ) { setAttributes( { labelStrokeWidth: value } ); }
				} ),
				el( ColorInputRow, {
					label: __( 'Label background color', 'image-pin-block' ),
					value: displaySettings.labelBackgroundColor,
					// 既定値が rgba() のため、ピッカー自体でもアルファを編集できるようにする
					// (背景の不透明度スライダーとは別に、色そのものに透明度を持たせたい場合のため)。
					enableAlpha: true,
					onPreview: function( color ) { setColorPreview( 'labelBackgroundColor', color ); },
					onPreviewClear: function() { clearColorPreview( 'labelBackgroundColor' ); },
					onCommit: function( color ) { setAttributes( { labelBackgroundColor: color || DEFAULT_LABEL_BG_COLOR } ); }
				} ),
				el( RangeControl, {
					label: __( 'Label background opacity', 'image-pin-block' ),
					value: displaySettings.labelBackgroundOpacity,
					min: 0,
					max: 100,
					onChange: function( value ) {
						setAttributes( { labelBackgroundOpacity: ( typeof value === 'number' ) ? value : DEFAULT_BG_OPACITY } );
					}
				} ),
				el( 'h3', { className: 'image-pin-block-editor__modal-settings-heading' }, __( 'Popover', 'image-pin-block' ) ),
				el( ClampedNumberControl, {
					label: __( 'Popover font size (px)', 'image-pin-block' ),
					value: popoverSettings.fontSize,
					min: POPOVER_FONT_SIZE_MIN,
					max: POPOVER_FONT_SIZE_MAX,
					defaultValue: DEFAULT_POPOVER_FONT_SIZE,
					onCommit: function( n ) { setAttributes( { popoverFontSize: n } ); }
				} ),
				el( ColorInputRow, {
					label: __( 'Popover text color', 'image-pin-block' ),
					value: popoverSettings.textColor,
					allowEmpty: true,
					onPreview: function( color ) { setColorPreview( 'popoverTextColor', color ); },
					onPreviewClear: function() { clearColorPreview( 'popoverTextColor' ); },
					onCommit: function( color ) { setAttributes( { popoverTextColor: color || '' } ); }
				} ),
				el( ColorInputRow, {
					label: __( 'Popover stroke color', 'image-pin-block' ),
					value: popoverSettings.strokeColor,
					onPreview: function( color ) { setColorPreview( 'popoverStrokeColor', color ); },
					onPreviewClear: function() { clearColorPreview( 'popoverStrokeColor' ); },
					onCommit: function( color ) { setAttributes( { popoverStrokeColor: color || DEFAULT_STROKE_COLOR } ); }
				} ),
				el( SelectControl, {
					label: __( 'Popover stroke width', 'image-pin-block' ),
					value: popoverSettings.strokeWidth,
					options: STROKE_WIDTH_OPTIONS,
					onChange: function( value ) { setAttributes( { popoverStrokeWidth: value } ); }
				} ),
				el( ColorInputRow, {
					label: __( 'Popover background color', 'image-pin-block' ),
					value: popoverSettings.backgroundColor,
					allowEmpty: true,
					onPreview: function( color ) { setColorPreview( 'popoverBackgroundColor', color ); },
					onPreviewClear: function() { clearColorPreview( 'popoverBackgroundColor' ); },
					onCommit: function( color ) { setAttributes( { popoverBackgroundColor: color || '' } ); }
				} ),
				el( RangeControl, {
					label: __( 'Popover background opacity', 'image-pin-block' ),
					value: popoverSettings.backgroundOpacity,
					min: 0,
					max: 100,
					onChange: function( value ) {
						setAttributes( { popoverBackgroundOpacity: ( typeof value === 'number' ) ? value : DEFAULT_BG_OPACITY } );
					}
				} )
			)
		);

		// ブロック自身のキャンバスは v0.2.0 より表示専用(ドラッグ・クリックでの選択・追加は
		// すべてモーダル内に集約した)。プレビュー中の色は反映せず、確定済みの値のみを使う
		// (ドラッグ中のライブプレビューはモーダルを開いている間しか意味を持たないため)。
		// Pin/Markerのコンテナ自体はマーカー/ドットのみ(buildPinVisualOnly。isSelected=false
		// 固定でリサイズハンドルは出さない)。Labelはモーダルと同じ考え方(円周上の
		// labelPosition)で独立配置するが、ここでは表示のみでドラッグ操作は持たない。
		var pinElements = pins.map( function( pin ) {
			return el(
				'div',
				{
					key: pin.id,
					ref: function( node ) { registerStaticPinAnchorRef( pin.id, node ); },
					className: 'image-pin-block-editor__pin'
						+ ( pin.markerImageUrl ? ' has-marker-image' : '' ),
					style: { left: clampPercent( pin.x ) + '%', top: clampPercent( pin.y ) + '%' }
				},
				buildPinVisualOnly( pin, displaySettings, false )
			);
		} );

		var staticLabelElements = [];
		pins.forEach( function( pin ) {
			var hasLabelText = !! ( pin.label && '' !== pin.label );
			var showLabel = pin.markerImageUrl ? ( pin.showLabel !== false ) : true;
			if ( ! hasLabelText || ! showLabel ) {
				return;
			}
			var pos = staticLabelRenderPositions[ pin.id ] || { x: 0, y: 0 };
			var style = Object.assign(
				{
					position: 'absolute',
					left: pos.x + 'px',
					top: pos.y + 'px',
					transform: 'translate(-50%, -50%)'
				},
				buildLabelStyle( displaySettings )
			);
			staticLabelElements.push(
				el( 'span', {
					key: 'static-label-' + pin.id,
					className: 'image-pin-block-editor__pin-label',
					style: style,
					ref: function( node ) { registerStaticLabelRef( pin.id, node ); }
				}, pin.label )
			);
		} );

		// モーダル内の画像編集エリア専用の見た目設定。ドラッグ中のライブプレビュー値を
		// 反映し、ドラッグ移動時の範囲制限に使うDOM参照登録も渡す。displaySettings自体
		// (ColorInputRowのスウォッチ・ColorPicker自体のcolorプロパティに使われる)には、
		// このプレビュー値を混ぜない。widthRatioには、Preview viewportへのFit倍率
		// (modalFitRatio)を渡す。Zoomはこれとは別に、image wrapper自体への
		// transform: scale()として適用するため(画像もピンも同じtransformの対象になり、
		// 常に一緒に拡大縮小される)、ここにZoom倍率を含める必要はない。
		var modalDisplaySettings = Object.assign( {}, displaySettings, {
			labelBackgroundColor: resolveColorPreview( 'labelBackgroundColor', displaySettings.labelBackgroundColor ),
			labelTextColor: resolveColorPreview( 'labelTextColor', displaySettings.labelTextColor ),
			labelStrokeColor: resolveColorPreview( 'labelStrokeColor', displaySettings.labelStrokeColor ),
			widthRatio: modalFitRatio,
			registerMarkerImageRef: registerMarkerImageRef,
			onMarkerResizePointerDown: handleMarkerResizePointerDown
		} );
		var modalPopoverSettings = Object.assign( {}, popoverSettings, {
			backgroundColor: resolveColorPreview( 'popoverBackgroundColor', popoverSettings.backgroundColor ),
			textColor: resolveColorPreview( 'popoverTextColor', popoverSettings.textColor ),
			strokeColor: resolveColorPreview( 'popoverStrokeColor', popoverSettings.strokeColor )
		} );

		// Pin/Markerのコンテナ自体はマーカー/ドット(+選択中の画像マーカーのリサイズ
		// ハンドル)だけを含む(buildPinVisualOnly。Labelは含まない)。Labelは下記の
		// modalLabelElementsとして、角丸矩形経路上の位置へ独立して配置する
		// (「Label位置」参照)。refでこのコンテナ自体をmodalPinAnchorRefsRefへ登録し、
		// Label位置計算のPin/Marker矩形として実測に使う。
		var modalPinElements = pins.map( function( pin ) {
			var isPinSelected = pin.id === selectedPinId;
			return el(
				'button',
				{
					key: pin.id,
					type: 'button',
					ref: function( node ) { registerPinAnchorRef( pin.id, node ); },
					className: 'image-pin-block-editor__pin'
						+ ( isPinSelected ? ' is-selected' : '' )
						+ ( pin.markerImageUrl ? ' has-marker-image' : '' ),
					style: { left: clampPercent( pin.x ) + '%', top: clampPercent( pin.y ) + '%' },
					onPointerDown: function( evt ) { handleModalPinPointerDown( pin.id, evt ); },
					// pointerdown側のstopPropagationは、後続の(別イベントである)clickの
					// バブリングまでは止めない。ここで止めないと、既存ピンをクリックしただけ
					// (ドラッグなし)でも click が画像側(handleViewportPointerDown)まで届き、
					// 同じ位置に意図しない新規ピンが追加されてしまう。dblclickも同様に、
					// Pin/Markerを素早く2回クリックしただけで背景側のダブルクリック
					// (handleViewportDoubleClick、Pin追加候補の表示)まで届かないよう止める。
					onClick: function( evt ) { evt.stopPropagation(); },
					onDoubleClick: function( evt ) { evt.stopPropagation(); }
				},
				buildPinVisualOnly( pin, modalDisplaySettings, isPinSelected )
			);
		} );

		// Label(モーダル専用、独立配置+ドラッグ可能)。Show label OFF・ラベル未入力の
		// ピンは、既存のキャンバス/フロント表示と同じ条件で非表示にする(何も描画しない。
		// 掴む対象が無いピンにドラッグUIだけ出すことはしない)。描画位置は
		// labelRenderPositions(実測ベースで毎レンダリング後に更新)を使う。初回描画
		// (実測が済むまでの一瞬)はuseLayoutEffectがペイント前に補正するため、既定値
		// (Pin/Markerのアンカー位置と同じ0,0オフセット相当)を使っても視覚的な破綻はない。
		var modalLabelElements = [];
		pins.forEach( function( pin ) {
			var hasLabelText = !! ( pin.label && '' !== pin.label );
			var showLabel = pin.markerImageUrl ? ( pin.showLabel !== false ) : true;
			if ( ! hasLabelText || ! showLabel ) {
				return;
			}
			var pos = labelRenderPositions[ pin.id ] || { x: 0, y: 0 };
			var style = Object.assign(
				{
					position: 'absolute',
					left: pos.x + 'px',
					top: pos.y + 'px',
					transform: 'translate(-50%, -50%)'
				},
				buildLabelStyle( modalDisplaySettings )
			);
			modalLabelElements.push(
				el( 'span', {
					key: 'label-' + pin.id,
					className: 'image-pin-block-editor__pin-label image-pin-block-editor__pin-label--draggable'
						+ ( pin.id === selectedPinId ? ' is-selected' : '' ),
					style: style,
					ref: function( node ) { registerLabelRef( pin.id, node ); },
					onPointerDown: function( evt ) { handleLabelDragPointerDown( pin.id, evt ); },
					onClick: function( evt ) { evt.stopPropagation(); },
					onDoubleClick: function( evt ) { evt.stopPropagation(); }
				}, pin.label )
			);
		} );

		// Popoverを開くかどうかは openPopoverPinId(Pin/Marker本体のクリック確定で
		// トグル)で決める。selectedPinId(個別設定に表示するピン)とは独立した別概念
		// のため、選択されているだけのピンのPopoverを自動表示しない(260919〜)。
		var openPopoverPin = null;
		pins.forEach( function( p ) {
			if ( p.id === openPopoverPinId ) {
				openPopoverPin = p;
			}
		} );

		// 開いているピンのポップオーバーを、現在の「ポップオーバー」設定を反映した状態で
		// モーダル内の画像編集エリアの実画像の上に表示する(CanvasPopoverPreview参照。
		// 説明文が空のときは何も表示しない)。
		var modalPopoverElement = openPopoverPin
			? el( CanvasPopoverPreview, {
				pin: openPopoverPin,
				popoverSettings: modalPopoverSettings,
				ratio: modalFitRatio,
				wrapperRef: modalWrapperRef,
				zoomScale: modalZoom / 100,
				outerRef: openPopoverElRef
			} )
			: null;

		// 「Preview」: モーダル左上の画像編集領域。DOMの責務を4段に分ける
		// (docs/DATA_LAYOUT.md「編集UIのモーダル化」参照)。
		//   host(modalPreviewHostRef): 利用可能な領域。ここへ16:9のviewportをcontain。
		//   viewport: 16:9固定・黒背景・overflow:hidden(表示窓そのもの)。
		//   pan layer: Pan量だけtranslateする(flexで中央寄せした状態が基準位置)。
		//   image wrapper(modalWrapperRef): Fit状態の実寸px。Zoomはここへscale。
		// pointerdownはviewport全体(画像+黒いletterbox)で受け、クリックかPanかは
		// handleViewportPointerDown側で判定する(ピン自体のpointerdownは
		// stopPropagationされているため、ここには来ない)。
		// 「ここにピンを追加」確認メニュー。Preview viewportの直接の子として、Pan layer
		// (Zoom/Panのtransformを受ける層)の外に描画することで、メニュー自体は
		// Zoom/Panの影響を受けない(画像・ピンだけが拡大縮小・移動する)。
		// メニュー自身のpointerdown/clickはstopPropagationし、viewport側の
		// handleViewportPointerDown(Pan/クリック判定)に伝わらないようにする。
		var pendingMenuElement = pendingMenu
			? el(
				'div',
				{
					ref: pendingMenuRef,
					className: 'image-pin-block-editor__pending-menu',
					style: { left: pendingMenu.left + 'px', top: pendingMenu.top + 'px' },
					onPointerDown: function( evt ) { evt.stopPropagation(); },
					onClick: function( evt ) { evt.stopPropagation(); },
					onDoubleClick: function( evt ) { evt.stopPropagation(); }
				},
				el(
					Button,
					{ variant: 'secondary', onClick: addPinFromMenu },
					__( 'Add a pin here', 'image-pin-block' )
				)
			)
			: null;

		var modalImageArea = el(
			'div',
			{ className: 'image-pin-block-editor__modal-preview-host', ref: modalPreviewHostRef },
			el(
				'div',
				{
					ref: modalPreviewViewportRef,
					className: 'image-pin-block-editor__modal-preview-viewport'
						+ ( modalZoom > MODAL_ZOOM_MIN ? ' is-zoomed' : '' ),
					style: { width: modalPreviewSize.width + 'px', height: modalPreviewSize.height + 'px' },
					onPointerDown: handleViewportPointerDown,
					onDoubleClick: handleViewportDoubleClick
				},
				el(
					'div',
					{
						className: 'image-pin-block-editor__modal-pan-layer',
						style: { transform: 'translate(' + modalPan.x + 'px, ' + modalPan.y + 'px)' }
					},
					el(
						'div',
						{
							ref: modalWrapperRef,
							className: 'image-pin-block-editor__wrapper image-pin-block-editor__modal-canvas',
							style: {
								width: modalBaseWidth + 'px',
								height: modalBaseHeight + 'px',
								transform: 'scale(' + ( modalZoom / 100 ) + ')',
								transformOrigin: 'center center'
							}
						},
						el( 'img', {
							className: 'image-pin-block-editor__image',
							src: attributes.imageUrl,
							alt: ''
						} ),
						modalPinElements,
						modalLabelElements,
						modalPopoverElement
					)
				),
				pendingMenuElement
			)
		);

		// 「ピン一覧」カード: 常に1行固定(折り返さない)。ピンの数が多い場合は
		// タブ部分だけが横方向にoverflow(横スクロール)し、「複製」「削除」は右側に
		// 固定表示する(タブ数によってPreviewの高さが変わらないようにするため)。
		// 「＋(Add pin)」ボタンは、ピンの数が多いときに横スクロールする
		// pin-tabs-scroll の中には置かず、常に見える独立した兄弟要素にする
		// (260920〜。以前はスクロールする行の最後の項目だったため、ピンの数が
		// 多いと横スクロールしないと押せなくなっていた。「複製」「削除」ボタン
		// (pin-tab-actions)が既にこのカードの中で常時固定表示になっているのと
		// 同じ考え方を踏襲しただけで、新しいCSSのposition:sticky等は使わない)。
		var pinListCard = el(
			'div',
			{ className: 'image-pin-block-editor__pin-list-card' },
			el(
				'div',
				{ className: 'image-pin-block-editor__pin-tabs-scroll' },
				pins.map( function( pin, index ) {
					return el(
						Button,
						{
							key: pin.id,
							variant: ( pin.id === selectedPinId ) ? 'primary' : 'secondary',
							className: 'image-pin-block-editor__pin-tab',
							onClick: function() {
								setPendingMenu( null );
								setSelectedPinId( pin.id );
								// 右側(ピン一覧)からの選択ではPopoverを自動で開かない。
								// 別のPinのPopoverが開いたままだと選択中ピンと矛盾して
								// 見えるため、ここでも明示的に閉じる(260920〜)。
								setOpenPopoverPinId( null );
							}
						},
						pin.label || ( __( 'Pin', 'image-pin-block' ) + ' ' + ( index + 1 ) )
					);
				} )
			),
			el( Button, {
				variant: 'secondary',
				icon: 'plus',
				label: __( 'Add pin', 'image-pin-block' ),
				className: 'image-pin-block-editor__pin-tab-add',
				onClick: addPinAtCenter
			} ),
			el(
				'div',
				{ className: 'image-pin-block-editor__pin-tab-actions' },
				el( Button, {
					variant: 'secondary',
					disabled: ! selectedPin,
					onClick: duplicateSelectedPin
				}, __( 'Duplicate pin', 'image-pin-block' ) ),
				el( Button, {
					variant: 'secondary',
					isDestructive: true,
					disabled: ! selectedPin,
					onClick: removeSelectedPin
				}, __( 'Delete this pin', 'image-pin-block' ) )
			)
		);

		// モーダル左上段: ズームスライダー＋Preview(画像編集エリア)＋ピン一覧カード。
		// 縦方向はズーム(auto)・ピン一覧(auto)を固定高さとし、Preview自体が
		// flex: 1 1 auto で残りの空間をすべて使う(画面が広いほどPreviewが大きくなる)。
		// 個別設定(下段)は高さの上限+内部スクロールを持つため、ここに割合ベースの
		// 下限を設ける必要はない(editor.css参照)。
		var modalLeftTop = el(
			'div',
			{ className: 'image-pin-block-editor__modal-left-top' },
			el(
				'div',
				{ className: 'image-pin-block-editor__zoom-row' },
				el( RangeControl, {
					className: 'image-pin-block-editor__zoom-range',
					label: __( 'Zoom (%)', 'image-pin-block' ),
					value: modalZoom,
					min: MODAL_ZOOM_MIN,
					max: MODAL_ZOOM_MAX,
					onChange: function( value ) {
						setModalZoom( ( typeof value === 'number' ) ? value : MODAL_ZOOM_DEFAULT );
					}
				} ),
				// 「画像として保存」の直下に「全体を表示する」を並べる(260915〜。
				// 以前は「画像として保存」がModalヘッダーにあったが、Preview全体に
				// 対する補助操作として近い位置へまとめた。配置(表示順含む)だけの
				// 変更であり、resetToFit()/handleSaveAsImage()自体の処理内容は
				// 変更していない)。
				el(
					'div',
					{ className: 'image-pin-block-editor__fit-save-actions' },
					el( Button, {
						variant: 'secondary',
						className: 'image-pin-block-editor__save-as-image-button',
						disabled: ! attributes.imageUrl,
						onClick: handleSaveAsImage
					}, __( 'Save as image', 'image-pin-block' ) ),
					el( Button, {
						variant: 'secondary',
						className: 'image-pin-block-editor__fit-button',
						onClick: resetToFit
					}, __( 'Show entire image', 'image-pin-block' ) )
				)
			),
			modalImageArea,
			pinListCard
		);

		// モーダル左下段(個別設定): 選択中のピンだけに対する設定。カードにはせず、
		// 「ラベル・遷移先」「説明」「マーカー画像」の3列+区切り線で構成する。
		// ラベル入力欄は showLabel の状態に関わらず常に同じ場所に表示する。Show label
		// OFF(画像マーカーのみ)のときは非表示ではなく disabled にして、既存の入力文字列を
		// 一切消さずに保持する(再度ONにしたとき、直前の文字列がそのまま復元されるようにする)。
		// 「ラベル」「説明」「マーカー画像」の3カラムを、視覚的に1つの外側カード
		// (「ピンの内容」)へまとめる。3カラムの横並び自体・各コントロールの機能は
		// 変更しない(整理するのはカード構造のみ)。外側カードは選択の有無に関わらず
		// 常に同じ構造(見出し+中身)で、ピンの種類による内容量の増減で外側カードの
		// 増減はしない(丸マーカー/画像マーカーどちらでも同じ3カラムの中でMarker画像列の
		// 中身だけが変わる)。
		var isLabelInputDisabled = !! ( selectedPin && selectedPin.markerImageUrl && selectedPin.showLabel === false );
		var modalLeftBottom = el(
			'div',
			{ className: 'image-pin-block-editor__modal-left-bottom' },
			el(
				'div',
				{ className: 'image-pin-block-editor__individual-card' },
				el( 'p', { className: 'image-pin-block-editor__individual-card-heading' }, __( 'Pin content', 'image-pin-block' ) ),
				selectedPin
				? el(
					'div',
					{ className: 'image-pin-block-editor__modal-individual-grid' },
					el(
						'div',
						{ className: 'image-pin-block-editor__modal-individual-col' },
						el( TextControl, {
							label: __( 'Label', 'image-pin-block' ),
							value: selectedPin.label,
							disabled: isLabelInputDisabled,
							onChange: function( value ) { updateSelectedPin( 'label', value ); }
						} ),
						selectedPin.markerImageUrl
							? el( CheckboxControl, {
								label: __( 'Show label', 'image-pin-block' ),
								checked: selectedPin.showLabel !== false,
								onChange: function( checked ) { updateSelectedPin( 'showLabel', checked ); }
							} )
							: null,
						el( SelectControl, {
							label: buildLabelWithHelp(
								__( 'Choose target heading', 'image-pin-block' ),
								__( 'Only heading blocks with an HTML anchor set appear as options. If the heading you want isn\'t listed, set an HTML anchor for it under Advanced settings, or type the anchor name directly in the field below.', 'image-pin-block' )
							),
							value: selectedPin.target,
							options: targetOptions,
							onChange: function( value ) { updateSelectedPin( 'target', value ); }
						} ),
						el( TextControl, {
							label: buildLabelWithHelp(
								__( 'Enter target anchor manually', 'image-pin-block' ),
								__( 'For destinations that don\'t appear in the dropdown, such as non-heading blocks, enter the anchor name directly. You don\'t need to include the # symbol.', 'image-pin-block' )
							),
							value: selectedPin.target,
							onChange: function( value ) { updateSelectedPin( 'target', value.replace( /#/g, '' ).trim() ); }
						} )
					),
					el(
						'div',
						{ className: 'image-pin-block-editor__modal-individual-col' },
						el( TextareaControl, {
							label: __( 'Description', 'image-pin-block' ),
							value: selectedPin.description,
							onChange: function( value ) { updateSelectedPin( 'description', value ); }
						} )
					),
					el(
						'div',
						{ className: 'image-pin-block-editor__modal-individual-col' },
						el( 'p', { className: 'image-pin-block-editor__marker-heading' }, __( 'Marker image', 'image-pin-block' ) ),
						selectedPin.markerImageUrl
							? el(
								'div',
								{ className: 'image-pin-block-editor__marker-preview' },
								el( 'img', { src: selectedPin.markerImageUrl, alt: '' } ),
								el(
									MediaUploadCheck,
									{},
									el( MediaUpload, {
										onSelect: handleSelectMarkerImage,
										value: selectedPin.markerImageId,
										allowedTypes: [ 'image/png', 'image/jpeg' ],
										render: function( obj ) {
											return el(
												Button,
												{ variant: 'secondary', onClick: obj.open },
												__( 'Change marker image', 'image-pin-block' )
											);
										}
									} )
								),
								el(
									Button,
									{ variant: 'tertiary', isDestructive: true, onClick: clearMarkerImage },
									__( 'Remove marker image', 'image-pin-block' )
								)
							)
							: el(
								MediaUploadCheck,
								{},
								el( MediaUpload, {
									onSelect: handleSelectMarkerImage,
									allowedTypes: [ 'image/png', 'image/jpeg' ],
									render: function( obj ) {
										return el(
											Button,
											{ variant: 'secondary', onClick: obj.open },
											__( 'Select marker image', 'image-pin-block' )
										);
									}
								} )
							),
						selectedPin.markerImageUrl
							// key にピンIDと現在のmarkerScaleを含め、ピンを切り替えたときだけでなく
							// ドラッグリサイズハンドル側でmarkerScaleが変わったときにも
							// ClampedNumberControlの下書き状態(内部useState)を新しい値でリセットする
							// (ClampedNumberControlは制御コンポーネントではないため、keyを
							// 変えず値だけ変えても表示が追従しない)。
							? el( ClampedNumberControl, {
								key: selectedPinId + ':' + ( selectedPin.markerScale || DEFAULT_MARKER_SCALE ),
								label: __( 'Marker image scale (%)', 'image-pin-block' ),
								value: selectedPin.markerScale || DEFAULT_MARKER_SCALE,
								min: MARKER_SCALE_MIN,
								max: MARKER_SCALE_MAX,
								defaultValue: DEFAULT_MARKER_SCALE,
								onCommit: function( n ) { updateSelectedPin( 'markerScale', n ); }
							} )
							: null
					)
				)
				: el( 'p', { className: 'image-pin-block-editor__modal-individual-empty' }, __( 'Double-click the image to add a pin, or use the + button.', 'image-pin-block' ) )
			)
		);

		// モーダル左カラム: 上段(画像編集エリア)と下段(個別設定)を縦に積む。
		// 右カラム(ブロック全体の設定)の高さには影響されない、独立した領域。
		var modalLeft = el(
			'div',
			{ className: 'image-pin-block-editor__modal-left' },
			modalLeftTop,
			modalLeftBottom
		);

		// 狭い画面でDrawerを開いているときだけ、背景クリックで閉じられるように
		// backdropを表示する(CSSで画面幅に応じて表示/非表示を切り替える。
		// デスクトップでは常に非表示)。
		var settingsDrawerBackdrop = isSettingsDrawerOpen
			? el( 'div', {
				className: 'image-pin-block-editor__modal-drawer-backdrop',
				onClick: function() { setIsSettingsDrawerOpen( false ); }
			} )
			: null;

		// 編集用モーダル(v0.2.0)。isFullScreen: true でWordPress標準のページ占有型
		// 編集画面にする(独自のposition: fixed疑似モーダルへは置き換えない)。
		// ヘッダーには「ブロック全体の設定」(画面が狭いときだけCSSで表示され、右側の
		// Drawerを開閉する。デスクトップでは常設のため不要)と「編集を反映して終了」
		// (closeModalを直接呼ぶ、明示的な終了導線。右上×と処理は同じ)を置く。
		// 「画像として保存」はズーム行(「全体を表示する」の直下)へ移設した(260915〜)。
		var modalElement = isModalOpen
			? el(
				Modal,
				{
					title: __( 'Edit pins', 'image-pin-block' ),
					onRequestClose: closeModal,
					isFullScreen: true,
					className: 'image-pin-block-editor__modal',
					// Escで「ここにピンを追加」メニューが開いていればまずそれだけを閉じ、
					// フルスクリーンの編集画面自体は閉じない。Modal自体のEscape処理は
					// このonKeyDownより外側(祖先要素)にあるため、stopPropagationすれば
					// そちらまでは伝播しない。
					onKeyDown: function( evt ) {
						if ( evt.key === 'Escape' && pendingMenu ) {
							evt.stopPropagation();
							setPendingMenu( null );
						}
					},
					headerActions: [
						el( Button, {
							key: 'settings-toggle',
							variant: 'secondary',
							className: 'image-pin-block-editor__modal-settings-toggle',
							onClick: function() { setIsSettingsDrawerOpen( function( prev ) { return ! prev; } ); }
						}, __( 'Block-wide settings', 'image-pin-block' ) ),
						// 「編集を反映して終了」: Fullscreen Editorの明示的な終了導線(260915〜)。
						// 内部処理は右上×と完全に同じclose処理(closeModal)を再利用する
						// (新しい保存方式は作らない。×をキャンセル扱いにも変更しない)。
						// 文言は「反映」(=block attributesへの反映)であり、「保存」ではない
						// (投稿自体のサーバー保存はWordPress本体の更新/公開/下書き保存で
						// 行われるため、このボタンだけで投稿全体が保存されたと誤解させない
						// ため)。
						el( Button, {
							key: 'apply-and-close',
							variant: 'primary',
							onClick: closeModal
						}, __( 'Apply changes and close', 'image-pin-block' ) )
					]
				},
				el(
					'div',
					{ className: 'image-pin-block-editor__modal-grid' },
					modalLeft,
					blockSettingsPanel,
					settingsDrawerBackdrop
				)
			)
			: null;

		return el(
			'div',
			blockProps,
			inspector,
			modalElement,
			el(
				'div',
				{
					ref: wrapperRef,
					className: 'image-pin-block-editor__wrapper image-pin-block-editor__wrapper--static',
					onDoubleClick: handleCanvasDoubleClick
				},
				el( 'img', {
					className: 'image-pin-block-editor__image',
					src: attributes.imageUrl,
					alt: ''
				} ),
				pinElements,
				staticLabelElements
			)
		);
	}

	registerBlockType( 'image-pin-block/pins', {
		title: __( 'Image Pin Block', 'image-pin-block' ),
		category: 'media',
		icon: 'location-alt',
		description: __( 'A block that places pins on an image to show descriptions and jump to other parts of the page.', 'image-pin-block' ),
		attributes: {
			imageId: { type: 'number', default: 0 },
			imageUrl: { type: 'string', default: '' },
			imageWidth: { type: 'number', default: 0 },
			imageHeight: { type: 'number', default: 0 },
			pcBehavior: { type: 'string', default: 'hover-click' },
			mobileBehavior: { type: 'string', default: 'tap-tap' },
			// 0 は「未設定」を表すセンチネル値。画像選択時に imageWidth を基準に自動計算される
			// (handleSelectImage 参照)。block.json の同名属性の default と必ず一致させること。
			pinSize: { type: 'number', default: 0 },
			pinColor: { type: 'string', default: DEFAULT_PIN_COLOR },
			labelBackgroundColor: { type: 'string', default: DEFAULT_LABEL_BG_COLOR },
			labelTextColor: { type: 'string', default: DEFAULT_LABEL_TEXT_COLOR },
			labelFontSize: { type: 'number', default: 0 },
			labelBackgroundOpacity: { type: 'number', default: DEFAULT_BG_OPACITY },
			labelStrokeColor: { type: 'string', default: DEFAULT_STROKE_COLOR },
			labelStrokeWidth: { type: 'string', default: DEFAULT_STROKE_WIDTH },
			popoverFontSize: { type: 'number', default: 0 },
			// 空文字は「未設定=現行の見た目(白背景・テーマの文字色継承)を維持する」センチネル値。
			popoverBackgroundColor: { type: 'string', default: '' },
			popoverBackgroundOpacity: { type: 'number', default: DEFAULT_BG_OPACITY },
			popoverTextColor: { type: 'string', default: '' },
			popoverStrokeColor: { type: 'string', default: DEFAULT_STROKE_COLOR },
			popoverStrokeWidth: { type: 'string', default: DEFAULT_STROKE_WIDTH },
			pins: { type: 'array', default: [] }
		},
		edit: Edit,
		save: function() { return null; }
	} );
} )( window.wp.blocks, window.wp.element, window.wp.blockEditor, window.wp.components, window.wp.data, window.wp.i18n );
