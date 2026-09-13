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
	var Button = components.Button;
	var TextControl = components.TextControl;
	var TextareaControl = components.TextareaControl;
	var SelectControl = components.SelectControl;
	var CheckboxControl = components.CheckboxControl;
	var RangeControl = components.RangeControl;
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
	// マーカー画像の表示幅は、本体画像(imageWidth)に対してこの割合を上限とする。
	// markerScale(%)がどんな値でも、最終的な表示幅がこれを超えないようクランプする。
	// image-pin-block.php / view.js の同名比率と必ず一致させること。
	var MARKER_MAX_WIDTH_RATIO = 0.5;
	// マーカー画像のドラッグリサイズ時、表示幅(px、画面上の実サイズ)がこれより
	// 小さくならないようにする下限。ピン本体(画像+ラベル)をドラッグで移動する操作自体が
	// 掴めなくなるほど小さくなることを防ぐための値で、既存の丸マーカーの最小サイズ
	// (PIN_SIZE_MIN=4px)よりは大きく、通常の操作で指先/マウスで狙いやすい大きさとして
	// 20px を採用した(編集画面のみで使う値。フロント表示には影響しない)。
	var MARKER_MIN_DISPLAY_WIDTH_PX = 20;
	// リサイズハンドルの一辺の長さ(px)。マーカー画像の表示幅の40%を目安にしつつ、
	// 「小さすぎて掴めない」(下限8px)/「マーカー画像より目立って大きい」(上限18px)の
	// 両方を避けるようクランプする。
	var MARKER_RESIZE_HANDLE_RATIO = 0.4;
	var MARKER_RESIZE_HANDLE_MIN_PX = 8;
	var MARKER_RESIZE_HANDLE_MAX_PX = 18;

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

	// メニュー(「ここにピンを追加」)を配置するための、wrapper 基準のピクセル位置。
	function pixelPointFromEvent( evt, wrapperEl ) {
		var rect = wrapperEl.getBoundingClientRect();
		return {
			left: evt.clientX - rect.left,
			top: evt.clientY - rect.top
		};
	}

	// ピン内部の見た目(丸マーカー+ラベル横並び／画像マーカー+ラベル下表示)を組み立てる。
	// 編集画面用。フロント側の見た目は image-pin-block.php 側で同じ構造を出力する。
	// display: { pinSize, pinColor, labelBackgroundColor, labelTextColor, labelFontSize, widthRatio,
	//            mainImageWidth, markerNaturalWidths, onMarkerImageLoad, onMarkerResizePointerDown }
	// (ブロック単位の見た目設定)。isSelected: 画像マーカーのリサイズハンドルを表示するかどうか。
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

			// リサイズハンドルは、選択中かつ実寸が判明している(=表示幅を計算できる)場合のみ表示する。
			// ハンドルの大きさは表示幅の40%を目安に、8〜18pxの範囲でクランプする
			// (小さすぎて掴めない/マーカー画像自体より目立って大きい、の両方を避けるため)。
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

	// 選択中のピンの実際のラベル/説明文を、現在の「ポップオーバー」設定(背景の不透明度・
	// 文字色・縁取り)を適用して、キャンバス上の実画像の上に表示する。「背景を透過させたときに
	// 実画像の上でどう見えるか」を確認する目的のため、パネル内の静的な見本ではなく、
	// wrapper 内に実際のポップオーバーと同じ考え方で描画する(こちらはエディタ限定の表示で、
	// render_callback の出力には一切影響しない)。
	//
	// 表示位置はピンの選択中は常時表示とする(丸マーカーのピン設定パネルと同じ「選択中は
	// 表示され続ける」挙動に合わせているため、既存のピンの選択・ドラッグ移動ロジックに
	// 一切手を加えずに済む。詳細は docs/DATA_LAYOUT.md 参照)。
	// ピンの%座標が画面のどちら寄りかに応じて、ポップオーバーがラベルの反対側(はみ出し
	// にくい側)に出るよう transform の基準点を切り替える。
	function CanvasPopoverPreview( props ) {
		var pin = props.pin;
		var s = props.popoverSettings;
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
		var boxStyle = Object.assign(
			{
				backgroundColor: applyOpacityToColor( bgBase, s.backgroundOpacity ),
				color: s.textColor || undefined,
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

		// 「ここにピンを追加」メニュー。null のとき非表示。
		// { x, y }: 追加時に使う%座標(メニューを開いた時点の値を保持する)
		// { left, top }: メニュー自体の表示位置(px、wrapper基準)
		var menuState = useState( null );
		var pendingMenu = menuState[ 0 ];
		var setPendingMenu = menuState[ 1 ];

		var wrapperRef = useRef( null );
		var blockProps = useBlockProps();

		// pinSize/markerScale は「画像の元解像度(imageWidth)を基準にした値」として扱い、
		// 実際の表示幅との比率(widthRatio)を掛けてから描画する。これにより、画像が
		// レスポンシブに縮小されてもピンが画像に対して同じ比率のまま拡縮する。
		// 編集画面・フロントの両方で同じ考え方を使うことで見た目を一致させている。
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
		// 発生させる必要が無いデータなので state ではなく ref で持つ。移動・リサイズ時に
		// getBoundingClientRect() で実際の描画位置・サイズを測定し、「マーカー画像の外形が
		// 本体画像の内側に収まる」よう範囲を制限するために使う(flexboxの中央寄せや
		// ラベルの有無による見た目上の位置ずれを、数式で再現せず実測することで正確に扱う)。
		var markerImageRefsRef = useRef( {} );
		function registerMarkerImageRef( pinId, node ) {
			if ( node ) {
				markerImageRefsRef.current[ pinId ] = node;
			} else {
				delete markerImageRefsRef.current[ pinId ];
			}
		}
		displaySettings.registerMarkerImageRef = registerMarkerImageRef;

		// マーカー画像のリサイズハンドルのドラッグ操作。ハンドルは選択中のピンにしか
		// 表示されないため、常に「選択中かつ画像マーカーを持つピン」に対して呼ばれる。
		// handlePinPointerDown(位置移動)と同様、setPointerCapture でハンドル要素自身に
		// 以降の pointermove/pointerup を固定する(handleEl 側で stopPropagation 済みのため
		// ピン本体側の位置移動ハンドラとは競合しない)。
		function handleMarkerResizePointerDown( pinId, evt ) {
			evt.preventDefault();
			var pin = pins.filter( function( p ) { return p.id === pinId; } )[ 0 ];
			var naturalW = markerNaturalWidths[ pinId ] || 0;
			var wrapperEl = wrapperRef.current;
			if ( ! pin || naturalW <= 0 || ! wrapperEl ) {
				return;
			}

			var ratio = widthRatio || 1;
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

		displaySettings.onMarkerResizePointerDown = handleMarkerResizePointerDown;

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

		// メニュー表示中のみ、画像の外へのクリックとEscキーで閉じるリスナーを張る。
		useEffect( function() {
			if ( ! pendingMenu ) {
				return;
			}

			function handleDocClick( evt ) {
				if ( wrapperRef.current && wrapperRef.current.contains( evt.target ) ) {
					return;
				}
				setPendingMenu( null );
			}

			function handleKeyDown( evt ) {
				if ( evt.key === 'Escape' ) {
					setPendingMenu( null );
				}
			}

			document.addEventListener( 'click', handleDocClick );
			document.addEventListener( 'keydown', handleKeyDown );

			return function() {
				document.removeEventListener( 'click', handleDocClick );
				document.removeEventListener( 'keydown', handleKeyDown );
			};
		}, [ pendingMenu ] );

		// 上記の「画像の外へのクリックで閉じる」だけでは拾いきれないケースを補う。
		// ブロックエディタの投稿本文キャンバスはWordPress 5.9以降 iframe 内に描画されており、
		// 上記の document は iframe内のdocumentのため、iframeの外側(ページの余白など、
		// 管理画面本体側)のクリックはそもそもこのリスナーに届かない。ブロックの選択状態
		// (props.isSelected)はWordPress本体のストアがiframeの内外を問わず管理しているため、
		// これが false になった時点でもメニューを閉じるようにし、隙間を補う。
		// 既存の「画像の外へのクリックで閉じる」仕組みとは競合しない(同じブロックを選択した
		// ままの操作ではisSelectedは変化しない。ブロックを選択し直す1回のクリックでメニューを
		// 開く場合も、選択とメニュー表示は同一クリック内でまとめて反映されるため、開いた直後に
		// このeffectが誤って閉じることはない)。
		useEffect( function() {
			if ( ! props.isSelected ) {
				setPendingMenu( null );
			}
		}, [ props.isSelected ] );

		function updatePins( nextPins ) {
			setAttributes( { pins: nextPins } );
		}

		// pinSize/labelFontSize が未設定(0)の場合のみ、新しい画像の幅から自動計算する。
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
			setAttributes( updates );
		}

		// 画像上の「何もない場所」をクリック → その位置に「ここにピンを追加」メニューを表示する。
		// (ピン自体のクリック・ドラッグ、メニュー自体のクリックは stopPropagation されているため、
		// ここに来るのは常に「ピン・ドラッグ・メニュー操作のいずれでもないクリック」のみ)。
		// このクリックは、選択中のピンがあればその作業を終えたという意思表示とみなし、
		// 選択も解除する(ポップオーバーのプレビューも連動して消える)。
		function handleWrapperClick( evt ) {
			var wrapperEl = wrapperRef.current;
			var point = pointFromEvent( evt, wrapperEl );
			if ( ! point || ! wrapperEl ) {
				return;
			}
			var pixel = pixelPointFromEvent( evt, wrapperEl );
			setSelectedPinId( null );
			setPendingMenu( {
				x: point.x,
				y: point.y,
				left: pixel.left,
				top: pixel.top
			} );
		}

		// メニューの「ここにピンを追加」。メニューを開いた時点の%座標をそのまま使う。
		function addPinFromMenu() {
			if ( ! pendingMenu ) {
				return;
			}
			var newPin = {
				id: generatePinId( pins ),
				x: pendingMenu.x,
				y: pendingMenu.y,
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
			setPendingMenu( null );
		}

		function handlePinPointerDown( pinId, evt ) {
			// ドラッグ開始時点でこのピンを選択状態にする(ドラッグ終了後も維持する)。
			evt.stopPropagation();
			evt.preventDefault();
			setPendingMenu( null );
			setSelectedPinId( pinId );

			var wrapperEl = wrapperRef.current;
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
				// ドラッグ終了後も選択状態を維持し、サイドバーの「ピン設定」を表示し続ける。
				setSelectedPinId( pinId );
			}

			pinEl.addEventListener( 'pointermove', handleMove );
			pinEl.addEventListener( 'pointerup', endDrag );
			pinEl.addEventListener( 'pointercancel', endDrag );
		}

		function handlePinClick( pinId, evt ) {
			evt.stopPropagation();
			setPendingMenu( null );
			setSelectedPinId( pinId );
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

		var inspector = el(
			InspectorControls,
			{},
			el(
				PanelBody,
				{ title: __( 'Display settings', 'image-pin-block' ) },
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
					onCommit: function( n ) {
						setAttributes( { pinSize: n } );
					}
				} ),
				el( ClampedNumberControl, {
					label: __( 'Label font size (px)', 'image-pin-block' ),
					value: displaySettings.labelFontSize,
					min: LABEL_FONT_SIZE_MIN,
					max: LABEL_FONT_SIZE_MAX,
					defaultValue: DEFAULT_LABEL_FONT_SIZE,
					onCommit: function( n ) {
						setAttributes( { labelFontSize: n } );
					}
				} )
			),
			PanelColorSettings
				? el( PanelColorSettings, {
					title: __( 'Pin color', 'image-pin-block' ),
					initialOpen: false,
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
				PanelBody,
				{ title: __( 'Pin label', 'image-pin-block' ), initialOpen: false },
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
				} )
			),
			el(
				PanelBody,
				{ title: __( 'Popover', 'image-pin-block' ), initialOpen: false },
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
				} ),
				el( 'p', { className: 'image-pin-block-editor__popover-preview-hint' }, __( 'Select a pin on the image to preview its popover with these settings.', 'image-pin-block' ) )
			),
			selectedPin
				? el(
					PanelBody,
					{ title: __( 'Pin settings', 'image-pin-block' ) },
					// マーカー画像があり、かつ「ラベルを表示する」がオフのときはラベル入力を隠す。
					( ! selectedPin.markerImageUrl || selectedPin.showLabel !== false )
						? el( TextControl, {
							label: __( 'Label', 'image-pin-block' ),
							value: selectedPin.label,
							onChange: function( value ) { updateSelectedPin( 'label', value ); }
						} )
						: null,
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
						? el( ClampedNumberControl, {
							// key にピンID + 現在値を含め、リサイズハンドルのドラッグで markerScale が
							// 変わった際にも表示を追従させる(値が変わるたびに再マウントし、下書き状態を
							// 現在値でリセットする)。ドラッグ以外(このフィールドへの入力中)は
							// 属性値自体が変わらないため、入力途中の下書きが失われることはない。
							key: selectedPinId + ':' + ( selectedPin.markerScale || DEFAULT_MARKER_SCALE ),
							label: __( 'Marker image scale (%)', 'image-pin-block' ),
							value: selectedPin.markerScale || DEFAULT_MARKER_SCALE,
							min: MARKER_SCALE_MIN,
							max: MARKER_SCALE_MAX,
							defaultValue: DEFAULT_MARKER_SCALE,
							onCommit: function( n ) {
								updateSelectedPin( 'markerScale', n );
							}
						} )
						: null,
					selectedPin.markerImageUrl
						? el( CheckboxControl, {
							label: __( 'Show label', 'image-pin-block' ),
							checked: selectedPin.showLabel !== false,
							onChange: function( checked ) { updateSelectedPin( 'showLabel', checked ); }
						} )
						: null,
					el( TextareaControl, {
						label: __( 'Description', 'image-pin-block' ),
						value: selectedPin.description,
						onChange: function( value ) { updateSelectedPin( 'description', value ); }
					} ),
					el( SelectControl, {
						label: __( 'Choose target heading', 'image-pin-block' ),
						help: __( 'Only heading blocks with an HTML anchor set appear as options. If the heading you want isn\'t listed, set an HTML anchor for it under Advanced settings, or type the anchor name directly in the field below.', 'image-pin-block' ),
						value: selectedPin.target,
						options: targetOptions,
						onChange: function( value ) { updateSelectedPin( 'target', value ); }
					} ),
					el( TextControl, {
						label: __( 'Enter target anchor manually', 'image-pin-block' ),
						help: __( 'For destinations that don\'t appear in the dropdown, such as non-heading blocks, enter the anchor name directly. You don\'t need to include the # symbol.', 'image-pin-block' ),
						value: selectedPin.target,
						onChange: function( value ) { updateSelectedPin( 'target', value.replace( /#/g, '' ).trim() ); }
					} ),
					el(
						Button,
						{
							isDestructive: true,
							variant: 'secondary',
							onClick: removeSelectedPin
						},
						__( 'Delete this pin', 'image-pin-block' )
					)
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

		// キャンバス表示(ピンのラベル・ポップオーバープレビュー)専用の見た目設定。
		// ドラッグ中はライブプレビュー値を、それ以外は確定済みの値を使う。
		// displaySettings/popoverSettings 自体(ColorInputRowのスウォッチ・
		// ColorPicker自体のcolorプロパティに使われる)には、このプレビュー値を混ぜない。
		var canvasDisplaySettings = Object.assign( {}, displaySettings, {
			labelBackgroundColor: resolveColorPreview( 'labelBackgroundColor', displaySettings.labelBackgroundColor ),
			labelTextColor: resolveColorPreview( 'labelTextColor', displaySettings.labelTextColor ),
			labelStrokeColor: resolveColorPreview( 'labelStrokeColor', displaySettings.labelStrokeColor )
		} );
		var canvasPopoverSettings = Object.assign( {}, popoverSettings, {
			backgroundColor: resolveColorPreview( 'popoverBackgroundColor', popoverSettings.backgroundColor ),
			textColor: resolveColorPreview( 'popoverTextColor', popoverSettings.textColor ),
			strokeColor: resolveColorPreview( 'popoverStrokeColor', popoverSettings.strokeColor )
		} );

		var pinElements = pins.map( function( pin ) {
			var isSelected = pin.id === selectedPinId;
			return el(
				'button',
				{
					key: pin.id,
					type: 'button',
					className: 'image-pin-block-editor__pin'
						+ ( isSelected ? ' is-selected' : '' )
						+ ( pin.markerImageUrl ? ' has-marker-image' : '' ),
					style: { left: clampPercent( pin.x ) + '%', top: clampPercent( pin.y ) + '%' },
					onPointerDown: function( evt ) { handlePinPointerDown( pin.id, evt ); },
					onClick: function( evt ) { handlePinClick( pin.id, evt ); }
				},
				buildPinContent( pin, canvasDisplaySettings, isSelected )
			);
		} );

		// 画像上の何もない場所をクリックしたときに出す「ここにピンを追加」メニュー。
		var menuElement = pendingMenu
			? el(
				'div',
				{
					className: 'image-pin-block-editor__menu',
					style: { left: pendingMenu.left + 'px', top: pendingMenu.top + 'px' },
					onClick: function( evt ) { evt.stopPropagation(); }
				},
				el(
					Button,
					{ variant: 'secondary', onClick: addPinFromMenu },
					__( 'Add a pin here', 'image-pin-block' )
				)
			)
			: null;

		// 選択中のピンのポップオーバーを、現在の「ポップオーバー」設定を反映した状態で
		// 実画像の上に表示する(CanvasPopoverPreview 参照)。
		//
		// props.isSelected(このブロック自体が選択されているか)も条件に加える理由:
		// selectedPinId はピン削除時にしかクリアされないため、selectedPin の有無だけで
		// 判定すると、ブロックの選択が外れた後(他のブロックを選択した/画像の外をクリック
		// してブロックが非選択になった等)もプレビューが表示され続けてしまう。
		// 「Pin settings」パネル(InspectorControls内)は、WordPress自身がブロック選択中
		// のみ表示する仕組み(Slot/Fill)に乗っているため同じ問題が起きないが、こちらは
		// InspectorControlsの外(ブロック自身のキャンバス出力)に描画しているため、
		// 同等の判定をこちらで明示的に行う必要がある。
		//
		// 「ここにピンを追加」メニューが使っている「wrapperRef外クリックで閉じる」方式は
		// 採用しない。サイドバーの色・不透明度コントロールはDOM上wrapperRefの外にあるため、
		// その方式だとコントロール操作中にプレビューが消えてしまい、ライブプレビューとして
		// 機能しなくなる。isSelectedはサイドバー操作中も真のままなのでこの問題が起きない。
		var canvasPopoverElement = ( props.isSelected && selectedPin )
			? el( CanvasPopoverPreview, { pin: selectedPin, popoverSettings: canvasPopoverSettings } )
			: null;

		return el(
			'div',
			blockProps,
			inspector,
			el(
				'div',
				{
					ref: wrapperRef,
					className: 'image-pin-block-editor__wrapper',
					onClick: handleWrapperClick
				},
				el( 'img', {
					className: 'image-pin-block-editor__image',
					src: attributes.imageUrl,
					alt: ''
				} ),
				pinElements,
				menuElement,
				canvasPopoverElement
			),
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
