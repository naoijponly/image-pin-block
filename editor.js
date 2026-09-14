( function( blocks, element, blockEditor, components, data, i18n ) {
	var el = element.createElement;
	var useState = element.useState;
	var useRef = element.useRef;
	var useEffect = element.useEffect;
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

	// ピン内部の見た目(丸マーカー+ラベル横並び／画像マーカー+ラベル下表示)を組み立てる。
	// 編集画面用。フロント側の見た目は image-pin-block.php 側で同じ構造を出力する。
	// display: { pinSize, pinColor, labelBackgroundColor, labelTextColor, labelFontSize, widthRatio,
	//            mainImageWidth, markerNaturalWidths, onMarkerImageLoad, registerMarkerImageRef,
	//            onMarkerResizePointerDown }
	// (ブロック単位の見た目設定)。registerMarkerImageRef/onMarkerResizePointerDownは、
	// モーダル内の画像編集エリアでのドラッグ移動・リサイズに使うためのもの(不要な
	// 呼び出し側では省略可)。isSelected: 画像マーカーのリサイズハンドルを表示するかどうか。
	// ピンのサイズ・色は丸マーカーのみに適用し、ラベルの背景色・文字色は丸マーカー・画像マーカー共通。
	function buildPinContent( pin, display, isSelected ) {
		var ratio = display.widthRatio || 1;
		var hasLabelText = !! ( pin.label && '' !== pin.label );
		var labelStyle = Object.assign(
			{
				backgroundColor: applyOpacityToColor( display.labelBackgroundColor, display.labelBackgroundOpacity ),
				color: display.labelTextColor,
				fontSize: ( display.labelFontSize * ratio ) + 'px'
			},
			buildStrokeStyle( display.labelStrokeWidth, display.labelStrokeColor )
		);

		if ( pin.markerImageUrl ) {
			var scale = resolveMarkerScale( pin );
			var showLabel = pin.showLabel !== false;

			// マーカー画像の実寸(naturalWidth)が判明していれば、本体画像に対する上限割合
			// (MARKER_MAX_WIDTH_RATIO)でクランプした実寸px幅を指定する。transform: scale() だけに
			// 頼ると、レイアウト上のサイズ(=ボタン要素の当たり判定)が原寸のまま残ってしまい、
			// マーカー画像が本体画像と同等以上の解像度の場合にポインタイベントを奪ってしまうため
			// (ドラッグ・他のピンの操作が破綻する不具合の原因だった)。
			// 読み込み前(naturalWidth 未取得)の一瞬だけは、旧来の transform: scale() で暫定表示する。
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

			// リサイズハンドルは「選択中のマーカー画像ピン」にのみ表示する(操作対象を
			// 一意にするため)。naturalW未取得(画像読み込み前)の一瞬は、幅計測ができないため
			// 表示しない。
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
					onClick: function( evt ) { evt.stopPropagation(); }
				} );
			}

			var children = [
				el(
					'span',
					{ key: 'marker-wrap', className: 'image-pin-block-editor__marker-wrap' },
					markerImageEl,
					handleEl
				)
			];
			// ラベル未入力のときは代替文字を画面に出さず、画像だけを表示する
			// (丸マーカーと異なり「ピン」を補わない)。
			if ( showLabel && hasLabelText ) {
				children.push(
					el(
						'span',
						{ key: 'marker-label', className: 'image-pin-block-editor__pin-label', style: labelStyle },
						pin.label
					)
				);
			}
			return children;
		}

		var dotStyle = {
			width: ( display.pinSize * ratio ) + 'px',
			height: ( display.pinSize * ratio ) + 'px',
			backgroundColor: display.pinColor
		};
		var dotChildren = [
			el( 'span', { key: 'dot', className: 'image-pin-block-editor__pin-dot', style: dotStyle, 'aria-hidden': 'true' } )
		];
		// ラベル未入力のときは代替文字を画面に出さず、ドットだけを表示する
		// (画像マーカーと同じ扱いに揃えている。詳細は上のコメント参照)。
		if ( hasLabelText ) {
			dotChildren.push(
				el( 'span', { key: 'label', className: 'image-pin-block-editor__pin-label', style: labelStyle }, pin.label )
			);
		}
		return dotChildren;
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
	// 「ドラッグを離した時点」に1回だけ呼ぶ(pointerup/pointercancelで検知)。
	// Hex/RGB/HSLのテキスト入力欄はポインタ操作を伴わないため、フォーカスが外れた
	// とき(blur)またはEnterキーを確定のタイミングとする(ClampedNumberControlと同じ考え方)。
	//
	// ColorPicker 自身の color プロパティには、確定済みの値(props.value)だけを渡し、
	// ドラッグ中は一切変更しない。ColorPicker は内部で自身のドラッグ状態を保持して
	// 滑らかに追従するため、外側から色を追従させ直す必要はない。
	// (経緯: @wordpress/components の ColorPicker(react-colorful ベース)は、
	// 内部の useColorManipulation フックが持つ2つの useEffect が、キャッシュと
	// hsva ステートの更新タイミングの食い違いにより、外部から色を再注入していなくても
	// 自己完結した値の往復を起こしうる不具合がある。setAttributes をドラッグ確定時の
	// 1回に絞ることで、color プロパティ自体がドラッグ中に変化しなくなるため、この
	// 不具合の発生条件(繰り返しの外部からの色変更)が生じなくなる。詳細は
	// docs/DATA_LAYOUT.md の「カラーピッカーの往復不具合」参照)
	//
	// ドラッグ中の値は onPreview で都度報告し(setAttributesは呼ばない)、
	// キャンバス上のライブプレビューにのみ反映する。確定時に onCommit を呼ぶ。
	function ColorPickerField( props ) {
		// コミットすべき最新値。onChangeのたびに更新するが、再レンダリングは起こさない
		// (setStateではなくrefにする理由: これ自体はUIに表示する値ではなく、
		// 確定時に読み出すためだけの値のため)。
		var latestValueRef = useRef( props.value );

		function handleChange( color ) {
			latestValueRef.current = color;
			if ( props.onPreview ) {
				props.onPreview( color );
			}
		}

		function commit() {
			if ( latestValueRef.current !== props.value && props.onCommit ) {
				props.onCommit( latestValueRef.current );
			}
		}

		return el(
			'div',
			{
				className: 'image-pin-block-editor__color-picker-commit-wrap',
				onPointerUp: commit,
				onPointerCancel: commit,
				onBlur: commit,
				onKeyDown: function( evt ) {
					if ( evt.key === 'Enter' ) {
						commit();
					}
				}
			},
			el( ColorPicker, {
				color: props.value || undefined,
				onChange: handleChange,
				enableAlpha: !! props.enableAlpha
			} )
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
				renderContent: function() {
					return el( ColorPickerField, {
						value: props.value,
						enableAlpha: props.enableAlpha,
						onPreview: props.onPreview,
						onCommit: function( color ) {
							props.onCommit( color );
							if ( props.onPreviewClear ) {
								props.onPreviewClear();
							}
						}
					} );
				}
			} ),
			( props.allowEmpty && currentColor )
				? el( Button, { variant: 'link', onClick: handleReset }, __( 'Reset', 'image-pin-block' ) )
				: null
		);
	}

	// モーダル内で編集中のピンの実際のラベル/説明文を、現在の「ポップオーバー」設定
	// (背景の不透明度・文字色・縁取り)を適用して、モーダル内の画像編集エリアの実画像の
	// 上に表示する(v0.2.0でモーダル化。以前はブロック自身のキャンバスに表示していた)。
	// 「背景を透過させたときに実画像の上でどう見えるか」を確認する目的のため、パネル内の
	// 静的な見本ではなく、実際のポップオーバーと同じ考え方で描画する(こちらはエディタ
	// 限定の表示で、render_callback の出力には一切影響しない)。
	// ラベル・説明文がどちらも空のときは何も表示しない(下記参照)。
	// ピンの%座標が画面のどちら寄りかに応じて、ポップオーバーがラベルの反対側(はみ出し
	// にくい側)に出るよう transform の基準点を切り替える。
	function CanvasPopoverPreview( props ) {
		var pin = props.pin;
		var s = props.popoverSettings;
		// ratio: Preview viewportへのFit倍率(modalFitRatio)。呼び出し元の image wrapper
		// 自体がZoom(transform: scale())の対象であり、このプレビューはその内側に描画される
		// ため、ここでZoom倍率まで掛けると二重に拡大されてしまう(buildPinContentの
		// labelFontSizeと同じ考え方)。
		var hasLabelText = !! ( pin.label && '' !== pin.label );
		var hasDescriptionText = !! ( pin.description && '' !== pin.description );

		// ラベル・説明文がどちらも空のピンは、フロント側(image-pin-block.php)が
		// ポップオーバーの<template>自体を出力しないのと同じ扱いで、プレビューも
		// 何も表示しない。
		if ( ! hasLabelText && ! hasDescriptionText ) {
			return null;
		}

		var hasMarker = !! pin.markerImageUrl;
		// ラベル未入力時は代替文字("Pin")を補わない。画像マーカーはこの扱いを既に
		// していたが、丸マーカーも同じ扱いに揃える(image-pin-block.phpのshowLabel/
		// $show_desc_labelと同じ考え方)。
		var showLabel = hasMarker ? ( pin.showLabel !== false && hasLabelText ) : hasLabelText;
		var labelText = pin.label || '';

		var bgBase = s.backgroundColor || DEFAULT_POPOVER_BG_BASE;
		var ratio = props.ratio || 1;
		var boxStyle = Object.assign(
			{
				backgroundColor: applyOpacityToColor( bgBase, s.backgroundOpacity ),
				color: s.textColor || undefined,
				fontSize: ( s.fontSize * ratio ) + 'px',
				left: clampPercent( pin.x ) + '%',
				top: clampPercent( pin.y ) + '%',
				transform: 'translate(' + ( pin.x > 60 ? 'calc(-100% - 12px)' : '12px' ) + ', ' + ( pin.y < 25 ? '12px' : 'calc(-100% - 12px)' ) + ')'
			},
			buildStrokeStyle( s.strokeWidth, s.strokeColor )
		);

		return el(
			'div',
			{ className: 'image-pin-block-editor__canvas-popover', style: boxStyle },
			showLabel
				? el( 'div', { className: 'image-pin-block-editor__canvas-popover-label' }, labelText )
				: null,
			el( 'div', { className: 'image-pin-block-editor__canvas-popover-body' }, pin.description || '' )
		);
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

		// modalPreviewHostRef: Preview viewport(16:9)を最大containする、利用可能な
		// 領域(ズーム行・ピン一覧・個別設定を除いた残り)。modalWrapperRef: 実際に
		// 画像・ピンを描画する要素(Image wrapper)。Fit状態の実寸px(width/height)を
		// 明示的に持ち、Zoomはこの要素へのtransform: scale()、Panは親(Pan layer)への
		// transform: translate()として適用する(inline-blockの自動サイズには頼らない。
		// 理由: getBoundingClientRect()が常に「実際に画面上に表示されている画像の矩形」
		// と一致している必要があるため。詳細はdocs/DATA_LAYOUT.md参照)。
		var modalPreviewHostRef = useRef( null );
		var modalWrapperRef = useRef( null );

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

		// 「ここにピンを追加」確認メニューは、画像上の特定の位置に紐づくUIのため、
		// Zoom変更やPreviewのサイズ変更(ブラウザのリサイズ等)があった場合は候補位置の
		// 意味が薄れるため閉じる(メニュー自体はZoom/Panの対象にしていないため見た目上は
		// 動かないが、位置がずれた状態で「追加」を押せるままにしないための措置)。
		useEffect( function() {
			setPendingMenu( null );
		}, [ modalZoom, modalPreviewSize.width, modalPreviewSize.height ] );

		// マーカー画像の実寸(naturalWidth、px)をピンIDごとにキャッシュする。
		// <img> の読み込み完了(onLoad)時に記録し、buildPinContent() が上限クランプの計算に使う
		// (MARKER_MAX_WIDTH_RATIO 参照)。
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
		// 経由でbuildPinContentに渡す)。
		var markerImageRefsRef = useRef( {} );
		function registerMarkerImageRef( pinId, node ) {
			if ( node ) {
				markerImageRefsRef.current[ pinId ] = node;
			} else {
				delete markerImageRefsRef.current[ pinId ];
			}
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
		}

		// モーダル内、Preview viewport(画像・黒いletterbox部分の両方を含む)での
		// pointerdown。ピン自体のpointerdownは stopPropagation されているため、
		// ここに来るのは常に「ピン操作ではない」背景操作。
		//
		// クリック(「ここにピンを追加」の表示)とドラッグ(Pan)は、pointer移動距離で
		// 区別する(PAN_CLICK_THRESHOLD_PX未満ならクリック、以上ならPan。手ブレでPan
		// 扱いにならないよう4〜6px程度を目安にしている)。クリックの時点ではピンを
		// 作成しない(pendingMenuを表示するだけ)。実際に画像へsetAttributesするのは
		// 「ここにピンを追加」ボタン(addPinFromMenu)を押した時点のみ。
		//
		// クリックと判定された場合でも、実際の画像の矩形(modalWrapperRef)の外
		// (黒いletterbox部分)であれば何もしない(isPointInsideRect参照。0〜100%への
		// クランプだけに頼ると、画像外のクリックが画像端へのピン追加に化けてしまう)。
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
				var wrapperEl = modalWrapperRef.current;
				if ( ! wrapperEl ) {
					return;
				}
				var imageRect = wrapperEl.getBoundingClientRect();
				if ( ! isPointInsideRect( endEvt.clientX, endEvt.clientY, imageRect ) ) {
					return;
				}
				var point = percentFromClientPoint( endEvt.clientX, endEvt.clientY, imageRect );
				// メニュー自体の表示位置はviewport基準のpx(Zoom/Panのtransformの外側に
				// 描画するため、Zoom/Panで一緒に拡大・移動しない)。
				var viewportRect = viewportEl.getBoundingClientRect();
				setSelectedPinId( null );
				setPendingMenu( {
					x: point.x,
					y: point.y,
					left: endEvt.clientX - viewportRect.left,
					top: endEvt.clientY - viewportRect.top
				} );
			}

			viewportEl.addEventListener( 'pointermove', handleMove );
			viewportEl.addEventListener( 'pointerup', endDrag );
			viewportEl.addEventListener( 'pointercancel', endDrag );
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
		}

		// モーダル内、画像編集エリアでのピンのドラッグ移動。ポインタダウンした時点でそのピンを
		// 選択状態にする(クリックのみで移動しない場合も、これにより選択が切り替わる)。
		// v0.1.x系ではブロック自身のキャンバス(wrapperRef)に対して行っていたが、v0.2.0で
		// モーダル内の画像編集エリア(modalWrapperRef)に置き換えた。ズーム(modalZoom)は
		// transform: scale() で見た目だけを拡大縮小しており、getBoundingClientRect() は
		// 常に画面上の実際の見た目のサイズ・位置を返すため、ズーム倍率に関わらずこの関数は
		// 変更なしで正しく動作する。
		function handleModalPinPointerDown( pinId, evt ) {
			evt.stopPropagation();
			evt.preventDefault();
			setPendingMenu( null );
			setSelectedPinId( pinId );

			var wrapperEl = modalWrapperRef.current;
			if ( ! wrapperEl ) {
				return;
			}

			var pointerId = evt.pointerId;
			var pinEl = evt.currentTarget;

			// setPointerCapture で以降の pointermove/pointerup をこのピン要素に固定する。
			// これが無いと、ドラッグ中にポインタが画像側へ出た瞬間の click が
			// 画像側(新規ピン追加ハンドラ)に発火してしまう。
			if ( pinEl.setPointerCapture ) {
				pinEl.setPointerCapture( pointerId );
			}

			// マーカー画像を持つピンは、その外形が本体画像の内側に収まるよう移動範囲を
			// 制限する(丸マーカーは対象外。理由は buildPinContent 呼び出し側のコメント参照)。
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

		function removeSelectedPin() {
			updatePins( pins.filter( function( p ) { return p.id !== selectedPinId; } ) );
			setSelectedPinId( null );
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
				} )
			)
		);

		// ブロック自身のキャンバスは v0.2.0 より表示専用(ドラッグ・クリックでの選択・追加は
		// すべてモーダル内に集約した)。プレビュー中の色は反映せず、確定済みの値のみを使う
		// (ドラッグ中のライブプレビューはモーダルを開いている間しか意味を持たないため)。
		var pinElements = pins.map( function( pin ) {
			return el(
				'div',
				{
					key: pin.id,
					className: 'image-pin-block-editor__pin'
						+ ( pin.markerImageUrl ? ' has-marker-image' : '' ),
					style: { left: clampPercent( pin.x ) + '%', top: clampPercent( pin.y ) + '%' }
				},
				buildPinContent( pin, displaySettings )
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

		var modalPinElements = pins.map( function( pin ) {
			var isPinSelected = pin.id === selectedPinId;
			return el(
				'button',
				{
					key: pin.id,
					type: 'button',
					className: 'image-pin-block-editor__pin'
						+ ( isPinSelected ? ' is-selected' : '' )
						+ ( pin.markerImageUrl ? ' has-marker-image' : '' ),
					style: { left: clampPercent( pin.x ) + '%', top: clampPercent( pin.y ) + '%' },
					onPointerDown: function( evt ) { handleModalPinPointerDown( pin.id, evt ); },
					// pointerdown側のstopPropagationは、後続の(別イベントである)clickの
					// バブリングまでは止めない。ここで止めないと、既存ピンをクリックしただけ
					// (ドラッグなし)でも click が画像側(handleViewportPointerDown)まで届き、
					// 同じ位置に意図しない新規ピンが追加されてしまう。
					onClick: function( evt ) { evt.stopPropagation(); }
				},
				buildPinContent( pin, modalDisplaySettings, isPinSelected )
			);
		} );

		// 選択中のピンのポップオーバーを、現在の「ポップオーバー」設定を反映した状態で
		// モーダル内の画像編集エリアの実画像の上に表示する(CanvasPopoverPreview参照。
		// ラベル・説明文がどちらも空のときは何も表示しない)。
		var modalPopoverElement = selectedPin
			? el( CanvasPopoverPreview, { pin: selectedPin, popoverSettings: modalPopoverSettings, ratio: modalFitRatio } )
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
					className: 'image-pin-block-editor__pending-menu',
					style: { left: pendingMenu.left + 'px', top: pendingMenu.top + 'px' },
					onPointerDown: function( evt ) { evt.stopPropagation(); },
					onClick: function( evt ) { evt.stopPropagation(); }
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
					className: 'image-pin-block-editor__modal-preview-viewport'
						+ ( modalZoom > MODAL_ZOOM_MIN ? ' is-zoomed' : '' ),
					style: { width: modalPreviewSize.width + 'px', height: modalPreviewSize.height + 'px' },
					onPointerDown: handleViewportPointerDown
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
						modalPopoverElement
					)
				),
				pendingMenuElement
			)
		);

		// 「ピン一覧」カード: 常に1行固定(折り返さない)。ピンの数が多い場合は
		// タブ部分だけが横方向にoverflow(横スクロール)し、「複製」「削除」は右側に
		// 固定表示する(タブ数によってPreviewの高さが変わらないようにするため)。
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
							onClick: function() { setPendingMenu( null ); setSelectedPinId( pin.id ); }
						},
						pin.label || ( __( 'Pin', 'image-pin-block' ) + ' ' + ( index + 1 ) )
					);
				} ),
				el( Button, {
					variant: 'secondary',
					icon: 'plus',
					label: __( 'Add pin', 'image-pin-block' ),
					className: 'image-pin-block-editor__pin-tab-add',
					onClick: addPinAtCenter
				} )
			),
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
			el( RangeControl, {
				label: __( 'Zoom (%)', 'image-pin-block' ),
				value: modalZoom,
				min: MODAL_ZOOM_MIN,
				max: MODAL_ZOOM_MAX,
				onChange: function( value ) {
					setModalZoom( ( typeof value === 'number' ) ? value : MODAL_ZOOM_DEFAULT );
				}
			} ),
			modalImageArea,
			pinListCard
		);

		// モーダル左下段(個別設定): 選択中のピンだけに対する設定。カードにはせず、
		// 「ラベル・遷移先」「説明」「マーカー画像」の3列+区切り線で構成する。
		// ラベル入力欄は showLabel の状態に関わらず常に同じ場所に表示する。Show label
		// OFF(画像マーカーのみ)のときは非表示ではなく disabled にして、既存の入力文字列を
		// 一切消さずに保持する(再度ONにしたとき、直前の文字列がそのまま復元されるようにする)。
		var isLabelInputDisabled = !! ( selectedPin && selectedPin.markerImageUrl && selectedPin.showLabel === false );
		var modalLeftBottom = el(
			'div',
			{ className: 'image-pin-block-editor__modal-left-bottom' },
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
				: el( 'p', { className: 'image-pin-block-editor__modal-individual-empty' }, __( 'Click the image to add a pin.', 'image-pin-block' ) )
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
		// 「画像として保存」はヘッダーに場所だけ用意し、機能は別フェーズで実装する
		// (現時点では無効ボタン)。「ブロック全体の設定」ボタンは、画面が狭いときだけ
		// CSSで表示され、右側のDrawerを開閉する(デスクトップでは常設のため不要)。
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
						el( Button, {
							key: 'save-as-image',
							variant: 'secondary',
							disabled: true
						}, __( 'Save as image', 'image-pin-block' ) )
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
				pinElements
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
