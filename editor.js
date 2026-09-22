/**
 * Image Pin Block — Gutenberg UI + Editor Controller。
 *
 * このファイルはもはやVisual(Pin/Marker/Label/Bubble/Popover)を一切生成しない
 * (単一Renderer原則。svg-renderer.jsが唯一のVisual生成箇所)。ここに残るのは、
 * Inspector・全画面編集モーダルのUI・そのUIが操作するEditor Controller
 * (Attributes更新・選択状態・ドラッグ/リサイズ操作の座標処理・Zoom/Pan操作)だけ。
 * 通常のGutenberg Preview(ブロック自身のキャンバス)・Fullscreen Editorのいずれも、
 * scene-runtime.js の別インスタンスをmountするだけで、Visual生成コード自体は
 * 複製しない。
 */
( function( blocks, element, blockEditor, components, data, i18n, Geometry, SceneCamera, SceneRuntime, PngExport ) {
	var el = element.createElement;
	var useState = element.useState;
	var useRef = element.useRef;
	var useEffect = element.useEffect;
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
	var DEFAULT_PIN_SIZE = 24;
	var PIN_SIZE_MIN = 4;
	var PIN_SIZE_MAX = 300;
	// 画像選択時、pinSize が未設定(0)であれば imageWidth のこの割合を初期値にする。
	var PIN_SIZE_AUTO_RATIO = 0.025;
	var DEFAULT_PIN_COLOR = '#e63946';
	var DEFAULT_LABEL_BG_COLOR = 'rgba(255,255,255,0.9)';
	var DEFAULT_LABEL_TEXT_COLOR = '#1e1e1e';
	var DEFAULT_LABEL_FONT_SIZE = 12;
	var LABEL_FONT_SIZE_MIN = 6;
	var LABEL_FONT_SIZE_MAX = 200;
	var LABEL_FONT_SIZE_AUTO_RATIO = 0.015;
	var DEFAULT_POPOVER_FONT_SIZE = 12;
	var POPOVER_FONT_SIZE_MIN = 6;
	var POPOVER_FONT_SIZE_MAX = 200;
	var POPOVER_FONT_SIZE_AUTO_RATIO = 0.015;
	// マーカーのドラッグリサイズが到達できる表示幅の下限(natural px)。Fit(=natural=screen)
	// 状態でのUXが旧実装(screen px下限20px)と一致するよう、同じ数値をnatural px下限として
	// 再定義する(29節: Geometry/Rendererはzoomを知らないため、下限自体もnatural単位で
	// 固定値化する)。
	var MARKER_MIN_DISPLAY_WIDTH_NATURAL = 20;
	// モーダル内Preview viewportの表示倍率(見た目のズームのみ。保存される値には影響しない)。
	var MODAL_ZOOM_MIN = 100;
	var MODAL_ZOOM_MAX = 200;
	var MODAL_ZOOM_DEFAULT = 100;
	// Preview viewport自体の縦横比。16:9固定。
	var MODAL_PREVIEW_ASPECT_RATIO = 16 / 9;
	// 画像クリックとPreview内ドラッグ(Pan)を区別するしきい値(px)。この量未満の
	// pointer移動はクリック、以上の移動はドラッグ(Pan/Label位置/Popover toggle判定)とみなす
	// (画面px基準。ポインタ入力の閾値は「真のboundary」として明示的に許可されている値)。
	var PAN_CLICK_THRESHOLD_PX = 5;
	// 新規ピンを複製したとき、元のピンと重ならないようにずらす量(%)。
	var DUPLICATE_OFFSET_PERCENT = 4;

	var DEFAULT_BG_OPACITY = 100;
	var DEFAULT_STROKE_COLOR = '#ffffff';
	var STROKE_WIDTHS = [ 'none', 'thin', 'normal', 'thick' ];
	var DEFAULT_STROKE_WIDTH = 'none';

	function clampToRange( n, min, max ) {
		return Math.min( max, Math.max( min, n ) );
	}

	function clampPercent( n ) {
		return clampToRange( n, 0, 100 );
	}

	// 現在の表示スケール(natural 1単位あたりのscreen px)を、svg要素自身のCTMから求める。
	// svgEl.getBoundingClientRect()の幅/高さをviewBoxの幅/高さで割る方法は、
	// preserveAspectRatio="xMidYMid meet"によるletterbox(実際に画像が描画される領域が
	// svg要素自身の外形より小さい)を考慮できず、letterboxが発生する場面(Preview
	// viewportの縦横比と画像の縦横比が一致しない場合。16:9 viewportは常にこれに該当する)
	// で誤ったスケールを返してしまう(実際に発生し、Browser toolでの検証中に発見した
	// 不具合)。getScreenCTM()は、letterboxを含めた実際の変換行列を返すため、常に正しい。
	// meetは常にX/Yの拡縮率を一致させる(縦横比を保つ)ため、a成分だけで両軸分足りる。
	function getScreenPxPerNatural( svgEl ) {
		var ctm = svgEl.getScreenCTM();
		return ( ctm && ctm.a ) ? ctm.a : 1;
	}

	// 利用可能な領域(hostWidth × hostHeight)へ、aspectRatio(幅÷高さ)のPreview
	// viewportを最大containしたサイズを返す(Fullscreen Editorの16:9letterbox用。
	// UIシェルのサイズ計算であり、Scene自身のGeometryではない)。
	function fitAspectRatioIntoRect( hostWidth, hostHeight, aspectRatio ) {
		if ( hostWidth <= 0 || hostHeight <= 0 || aspectRatio <= 0 ) {
			return { width: 0, height: 0 };
		}
		if ( hostWidth / hostHeight >= aspectRatio ) {
			return { width: hostHeight * aspectRatio, height: hostHeight };
		}
		return { width: hostWidth, height: hostWidth / aspectRatio };
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
	var HTML_ENTITIES = {
		'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&apos;': "'", '&nbsp;': ' '
	};
	function stripTags( html ) {
		var text = String( html ).replace( /<[^>]*>/g, '' );
		return text.replace( /&amp;|&lt;|&gt;|&quot;|&#039;|&apos;|&nbsp;/g, function( match ) {
			return HTML_ENTITIES[ match ];
		} );
	}

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

	// markerScale が範囲外/未設定の場合のデフォルトへのフォールバックを一箇所にまとめる。
	function resolveMarkerScale( pin ) {
		return ( pin.markerScale && pin.markerScale >= MARKER_SCALE_MIN && pin.markerScale <= MARKER_SCALE_MAX )
			? pin.markerScale
			: DEFAULT_MARKER_SCALE;
	}

	// ─── PNG書き出し関連I/Oヘルパー(生成自体はpng-export.jsへ一本化。ここに残るのは
	// 「生成されたBlobをどう保存するか」のブラウザAPI呼び出しだけ) ───

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

	function writeBlobToFileHandle( handle, blob ) {
		return handle.createWritable().then( function( writable ) {
			return writable.write( blob ).then( function() {
				return writable.close();
			} );
		} );
	}

	// ─── Inspector向け小さなUIコンポーネント(Visual生成とは無関係。変更なし) ───

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

	function buildLabelWithHelp( label, helpText ) {
		return el(
			'span',
			{ className: 'image-pin-block-editor__label-with-help' },
			label,
			el( HelpTooltip, { text: helpText } )
		);
	}

	// 数値入力欄: 入力中はバリデーションしない下書き状態を保持し、blur/Enterで確定する。
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

	var TAIL_SIZES = [ 'small', 'medium', 'large' ];
	var TAIL_SIZE_OPTIONS = [
		{ value: 'small', label: __( 'Small', 'image-pin-block' ) },
		{ value: 'medium', label: __( 'Medium', 'image-pin-block' ) },
		{ value: 'large', label: __( 'Large', 'image-pin-block' ) }
	];
	function resolveTailSizeAttr( value ) {
		return ( TAIL_SIZES.indexOf( value ) !== -1 ) ? value : 'medium';
	}

	var STROKE_WIDTH_OPTIONS = [
		{ value: 'none', label: __( 'None', 'image-pin-block' ) },
		{ value: 'thin', label: __( 'Thin', 'image-pin-block' ) },
		{ value: 'normal', label: __( 'Normal', 'image-pin-block' ) },
		{ value: 'thick', label: __( 'Thick', 'image-pin-block' ) }
	];

	// Dropdown の中身(ColorPicker本体)。draft を useState にして handleChange のたびに
	// setDraft することで、ColorPicker自身に「今まさに操作している色」を即座に返す形にし、
	// Hex/色相バー等内部UI同士の同期を成立させる(react-colorful固有の往復不具合対策。
	// 変更なし)。
	function ColorPickerField( props ) {
		var draftState = useState( props.value );
		var draft = draftState[ 0 ];
		var setDraft = draftState[ 1 ];

		function handleChange( color ) {
			setDraft( color );
			if ( props.onPreview ) {
				props.onPreview( color );
			}
		}

		function handleApply() {
			if ( draft !== props.value && props.onCommit ) {
				props.onCommit( draft );
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
				color: draft || undefined,
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

	function Edit( props ) {
		var attributes = props.attributes;
		var setAttributes = props.setAttributes;
		var pins = attributes.pins || [];

		// Inspector表示専用の見た目設定(フォールバック込み)。Scene Runtimeへは渡さない
		// (Runtime自身がscene-model.jsで同じフォールバックを独立に解決する。ここはUI表示用の
		// 便宜的コピーに過ぎない)。
		var displaySettings = {
			pinSize: ( attributes.pinSize && attributes.pinSize >= PIN_SIZE_MIN && attributes.pinSize <= PIN_SIZE_MAX ) ? attributes.pinSize : DEFAULT_PIN_SIZE,
			pinColor: attributes.pinColor || DEFAULT_PIN_COLOR,
			labelBackgroundColor: attributes.labelBackgroundColor || DEFAULT_LABEL_BG_COLOR,
			labelTextColor: attributes.labelTextColor || DEFAULT_LABEL_TEXT_COLOR,
			labelFontSize: ( attributes.labelFontSize && attributes.labelFontSize >= LABEL_FONT_SIZE_MIN && attributes.labelFontSize <= LABEL_FONT_SIZE_MAX ) ? attributes.labelFontSize : DEFAULT_LABEL_FONT_SIZE,
			labelBackgroundOpacity: ( typeof attributes.labelBackgroundOpacity === 'number' && attributes.labelBackgroundOpacity >= 0 && attributes.labelBackgroundOpacity <= 100 ) ? attributes.labelBackgroundOpacity : DEFAULT_BG_OPACITY,
			labelStrokeColor: attributes.labelStrokeColor || DEFAULT_STROKE_COLOR,
			labelStrokeWidth: ( STROKE_WIDTHS.indexOf( attributes.labelStrokeWidth ) !== -1 ) ? attributes.labelStrokeWidth : DEFAULT_STROKE_WIDTH
		};
		var popoverSettings = {
			fontSize: ( attributes.popoverFontSize && attributes.popoverFontSize >= POPOVER_FONT_SIZE_MIN && attributes.popoverFontSize <= POPOVER_FONT_SIZE_MAX ) ? attributes.popoverFontSize : DEFAULT_POPOVER_FONT_SIZE,
			backgroundColor: attributes.popoverBackgroundColor || '',
			backgroundOpacity: ( typeof attributes.popoverBackgroundOpacity === 'number' && attributes.popoverBackgroundOpacity >= 0 && attributes.popoverBackgroundOpacity <= 100 ) ? attributes.popoverBackgroundOpacity : DEFAULT_BG_OPACITY,
			textColor: attributes.popoverTextColor || '',
			strokeColor: attributes.popoverStrokeColor || DEFAULT_STROKE_COLOR,
			strokeWidth: ( STROKE_WIDTHS.indexOf( attributes.popoverStrokeWidth ) !== -1 ) ? attributes.popoverStrokeWidth : DEFAULT_STROKE_WIDTH
		};

		// ドラッグ中のカラーピッカーのライブプレビュー値。モーダル内Scene(SVG)の表示だけに
		// 反映する(ブロック自身の静的キャンバスには反映しない。旧実装と同じ挙動)。
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

		// previewColorsの内容を反映したattributesのコピー(モーダル内Sceneへ渡す用)。
		// previewColorsが空のときはattributes自身をそのまま返す(不要な再mount/再resolveを
		// 起こさないため)。
		var modalPreviewAttributes = attributes;
		if ( Object.keys( previewColors ).length > 0 ) {
			modalPreviewAttributes = Object.assign( {}, attributes );
			Object.keys( previewColors ).forEach( function( key ) {
				modalPreviewAttributes[ key ] = previewColors[ key ];
			} );
		}

		var selectedState = useState( null );
		var selectedPinId = selectedState[ 0 ];
		var setSelectedPinId = selectedState[ 1 ];

		var isModalOpenState = useState( false );
		var isModalOpen = isModalOpenState[ 0 ];
		var setIsModalOpen = isModalOpenState[ 1 ];

		// モーダル内Preview viewportの表示倍率(100〜200%、表示のみ。保存される値には
		// 影響しない)。実際のCamera stateはScene Runtime自身が持つ(scene-camera.js)。
		// これはRangeControl等のUI表示用ミラーであり、Runtimeのcamera stateが変わるたびに
		// syncUiFromCamera()で更新する。
		var zoomPercentState = useState( MODAL_ZOOM_DEFAULT );
		var zoomPercent = zoomPercentState[ 0 ];
		var setZoomPercent = zoomPercentState[ 1 ];

		// 「ここにピンを追加」確認メニュー。null のとき非表示。
		// { x, y }: 追加時に使う%座標(画像上の位置)。{ left, top }: メニュー自体の
		// 表示位置(px、Preview viewport基準。Zoom/Panのtransformの外側に描画するため、
		// Zoom/Panで一緒に拡大・移動しない)。
		var pendingMenuState = useState( null );
		var pendingMenu = pendingMenuState[ 0 ];
		var setPendingMenu = pendingMenuState[ 1 ];

		// Popoverの開閉状態。選択状態(selectedPinId)とは独立した別概念として扱う。
		var openPopoverPinIdState = useState( null );
		var openPopoverPinId = openPopoverPinIdState[ 0 ];
		var setOpenPopoverPinId = openPopoverPinIdState[ 1 ];

		// 右側「ブロック全体の設定」のDrawer(狭い画面用)の開閉状態。
		var isSettingsDrawerOpenState = useState( false );
		var isSettingsDrawerOpen = isSettingsDrawerOpenState[ 0 ];
		var setIsSettingsDrawerOpen = isSettingsDrawerOpenState[ 1 ];

		function closeModal() {
			setIsModalOpen( false );
			setIsSettingsDrawerOpen( false );
			setPendingMenu( null );
			setOpenPopoverPinId( null );
		}

		var blockProps = useBlockProps();

		// 最新のpins/selectedPinId/openPopoverPinId/attributesを、モーダルmount時に一度だけ
		// 作られる安定した(再生成されない)interactionハンドラから読めるようにするための参照
		// (createRuntime()のoptionsに渡すコールバック自体はmount時に固定されるため。
		// setAttributes/setSelectedPinId等のsetter自体は元から安定した参照であり、
		// このrefはpins等の「値」を最新化するためだけに使う)。
		var latestRef = useRef( {} );
		latestRef.current = {
			pins: pins,
			selectedPinId: selectedPinId,
			openPopoverPinId: openPopoverPinId,
			attributes: attributes
		};

		// ─── 静的キャンバス(表示専用。モーダルを閉じた通常のGutenbergブロック表示) ───
		var staticHostRef = useRef( null );
		var staticRuntimeRef = useRef( null );

		// 画像未選択の間は、この静的キャンバス自体(ref付きのdiv)がJSXに存在しない
		// (下のearly returnで別のUI(「画像を選択」ボタン)を返している)。依存配列を
		// 空([])のままにすると、初回mount時(画像未選択でstaticHostRef.currentがまだ
		// null)にしか実行されず、後で画像を選んでこのdivが初めて存在するようになっても
		// 二度と実行されないため、Runtimeが永久に作られず何も描画されない(回帰: 新規
		// ブロックに画像を選択した直後、ブロックが空白のまま表示される)。
		// attributes.imageUrlの有無(false→true)をきっかけに再実行させることで、
		// このdivが実際に存在するようになった時点でRuntimeを作れるようにする。
		useEffect( function() {
			if ( ! staticHostRef.current ) {
				return;
			}
			var rt = SceneRuntime.createRuntime( staticHostRef.current, { editorOverlay: false } );
			staticRuntimeRef.current = rt;
			return function() {
				rt.dispose();
				staticRuntimeRef.current = null;
			};
		}, [ !! attributes.imageUrl ] );

		useEffect( function() {
			if ( staticRuntimeRef.current ) {
				staticRuntimeRef.current.setAttributes( attributes );
			}
		}, [ attributes ] );

		function handleCanvasDoubleClick() {
			setIsModalOpen( true );
		}

		// ─── Fullscreen Editorモーダル ───
		var modalOuterHostRef = useRef( null ); // 利用可能な領域(ズーム行・ピン一覧・個別設定を除いた残り)
		var modalHostRef = useRef( null ); // 16:9固定・実際にSVG Sceneをmountする要素
		var modalRuntimeRef = useRef( null );
		var pendingMenuRef = useRef( null );

		var modalPreviewSizeState = useState( { width: 0, height: 0 } );
		var modalPreviewSize = modalPreviewSizeState[ 0 ];
		var setModalPreviewSize = modalPreviewSizeState[ 1 ];

		useLayoutEffect( function() {
			var outerEl = modalOuterHostRef.current;
			if ( ! isModalOpen || ! outerEl ) {
				return;
			}
			function recalc() {
				setModalPreviewSize( fitAspectRatioIntoRect( outerEl.clientWidth, outerEl.clientHeight, MODAL_PREVIEW_ASPECT_RATIO ) );
			}
			recalc();
			if ( ! window.ResizeObserver ) {
				return;
			}
			var ro = new window.ResizeObserver( recalc );
			ro.observe( outerEl );
			return function() { ro.disconnect(); };
		}, [ isModalOpen ] );

		// ドラッグ操作系(pointerdown→move→up)は、client座標→Scene(natural)座標の変換に
		// すべて rt.clientToScene()(共通API。getScreenCTM().inverse()ベース)を使う。
		// 27節: Preview/Fullscreen/Frontend/Lightboxで別々の座標式を持たない。
		function handlePinPointerDown( rt, pinId, evt ) {
			evt.stopPropagation();
			evt.preventDefault();
			var wasSelectedAtStart = ( latestRef.current.selectedPinId === pinId );
			setPendingMenu( null );
			setSelectedPinId( pinId );

			var snap = rt.getSnapshot();
			var model = snap.model;
			if ( ! model ) {
				return;
			}
			var resolvedPin = model.pins.filter( function( p ) { return p.id === pinId; } )[ 0 ];
			var imageWidth = model.image.width || 0;
			var imageHeight = model.image.height || 0;
			var containment = null;
			if ( resolvedPin && resolvedPin.hasMarker && 'marker' === resolvedPin.visual.kind ) {
				containment = Geometry.computeMarkerDragContainment( imageWidth, imageHeight, resolvedPin.visual.width, resolvedPin.visual.height );
			}

			var pointerId = evt.pointerId;
			var svgEl = rt.getRenderer().getSvgElement();
			var startClientX = evt.clientX;
			var startClientY = evt.clientY;
			var movedForPopover = false;

			if ( svgEl.setPointerCapture ) {
				svgEl.setPointerCapture( pointerId );
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

				var scenePt = rt.clientToScene( moveEvt.clientX, moveEvt.clientY );
				if ( ! scenePt ) {
					return;
				}
				var cx = scenePt.x;
				var cy = scenePt.y;
				if ( containment ) {
					cx = ( containment.minCx <= containment.maxCx ) ? clampToRange( cx, containment.minCx, containment.maxCx ) : ( containment.minCx + containment.maxCx ) / 2;
					cy = ( containment.minCy <= containment.maxCy ) ? clampToRange( cy, containment.minCy, containment.maxCy ) : ( containment.minCy + containment.maxCy ) / 2;
				} else {
					cx = clampToRange( cx, 0, imageWidth );
					cy = clampToRange( cy, 0, imageHeight );
				}
				var xPercent = ( imageWidth > 0 ) ? Math.round( clampPercent( ( cx / imageWidth ) * 100 ) * 10 ) / 10 : 0;
				var yPercent = ( imageHeight > 0 ) ? Math.round( clampPercent( ( cy / imageHeight ) * 100 ) * 10 ) / 10 : 0;
				setAttributes( {
					pins: latestRef.current.pins.map( function( p ) {
						return ( p.id === pinId ) ? Object.assign( {}, p, { x: xPercent, y: yPercent } ) : p;
					} )
				} );
			}

			function endDrag( endEvt ) {
				if ( endEvt && endEvt.pointerId !== pointerId ) {
					return;
				}
				if ( endEvt ) {
					endEvt.stopPropagation();
				}
				if ( svgEl.hasPointerCapture && svgEl.hasPointerCapture( pointerId ) ) {
					svgEl.releasePointerCapture( pointerId );
				}
				svgEl.removeEventListener( 'pointermove', handleMove );
				svgEl.removeEventListener( 'pointerup', endDrag );
				svgEl.removeEventListener( 'pointercancel', endDrag );
				setSelectedPinId( pinId );

				if ( ! movedForPopover && endEvt && endEvt.type !== 'pointercancel' ) {
					if ( wasSelectedAtStart ) {
						setOpenPopoverPinId( function( prev ) { return ( prev === pinId ) ? null : pinId; } );
					} else {
						setOpenPopoverPinId( null );
					}
				}
			}

			svgEl.addEventListener( 'pointermove', handleMove );
			svgEl.addEventListener( 'pointerup', endDrag );
			svgEl.addEventListener( 'pointercancel', endDrag );
		}

		// Labelを直接ドラッグして、Pin/Markerを囲む円周上の任意の位置へ配置する
		// (resolveLabelPosition/calculateLabelOffset等と同じ360°連続の考え方)。
		function handleLabelPointerDown( rt, pinId, evt ) {
			evt.stopPropagation();
			evt.preventDefault();
			var wasSelectedAtStart = ( latestRef.current.selectedPinId === pinId );
			var startClientX = evt.clientX;
			var startClientY = evt.clientY;
			var movedForPopover = false;
			setPendingMenu( null );
			setSelectedPinId( pinId );

			var snap = rt.getSnapshot();
			var model = snap.model;
			var resolvedPin = model ? model.pins.filter( function( p ) { return p.id === pinId; } )[ 0 ] : null;
			if ( ! resolvedPin ) {
				return;
			}
			var centerX = resolvedPin.cx;
			var centerY = resolvedPin.cy;

			var pointerId = evt.pointerId;
			var svgEl = rt.getRenderer().getSvgElement();
			if ( svgEl.setPointerCapture ) {
				svgEl.setPointerCapture( pointerId );
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
				var scenePt = rt.clientToScene( moveEvt.clientX, moveEvt.clientY );
				if ( ! scenePt ) {
					return;
				}
				var dx = scenePt.x - centerX;
				var dy = scenePt.y - centerY;
				var t = Math.atan2( dy, dx ) / ( Math.PI * 2 );
				t = ( ( t % 1 ) + 1 ) % 1;
				setAttributes( {
					pins: latestRef.current.pins.map( function( p ) {
						return ( p.id === pinId ) ? Object.assign( {}, p, { labelPosition: t } ) : p;
					} )
				} );
			}

			function endDrag( endEvt ) {
				if ( endEvt && endEvt.pointerId !== pointerId ) {
					return;
				}
				if ( endEvt ) {
					endEvt.stopPropagation();
				}
				if ( svgEl.hasPointerCapture && svgEl.hasPointerCapture( pointerId ) ) {
					svgEl.releasePointerCapture( pointerId );
				}
				svgEl.removeEventListener( 'pointermove', handleMove );
				svgEl.removeEventListener( 'pointerup', endDrag );
				svgEl.removeEventListener( 'pointercancel', endDrag );

				if ( ! movedForPopover && endEvt && endEvt.type !== 'pointercancel' ) {
					if ( wasSelectedAtStart ) {
						setOpenPopoverPinId( function( prev ) { return ( prev === pinId ) ? null : pinId; } );
					} else {
						setOpenPopoverPinId( null );
					}
				}
			}

			svgEl.addEventListener( 'pointermove', handleMove );
			svgEl.addEventListener( 'pointerup', endDrag );
			svgEl.addEventListener( 'pointercancel', endDrag );
		}

		// 画像マーカーのドラッグリサイズ。選択中の画像マーカーピンにのみハンドルが表示される。
		// 「開始時の解決済み幅 + Scene座標上の横方向Pointer移動量 → 制約 → markerScaleへ戻す」
		// という操作意味は旧実装から変更しない(29節)。
		function handleMarkerResizePointerDown( rt, pinId, evt ) {
			evt.preventDefault();
			evt.stopPropagation();
			var pin = latestRef.current.pins.filter( function( p ) { return p.id === pinId; } )[ 0 ];
			var snap = rt.getSnapshot();
			var model = snap.model;
			if ( ! pin || ! model ) {
				return;
			}
			var resolvedPin = model.pins.filter( function( p ) { return p.id === pinId; } )[ 0 ];
			if ( ! resolvedPin || 'marker' !== resolvedPin.visual.kind ) {
				return;
			}
			var naturalW = resolvedPin.visual.intrinsicWidth || 0;
			var naturalH = resolvedPin.visual.intrinsicHeight || 0;
			if ( naturalW <= 0 ) {
				return;
			}
			var imageWidth = model.image.width || 0;
			var imageHeight = model.image.height || 0;
			var aspectRatio = naturalW / naturalH;
			var pinCenter = { x: resolvedPin.cx, y: resolvedPin.cy };

			var maxWidthFromRatio = imageWidth * Geometry.MARKER_MAX_WIDTH_RATIO;
			var maxWidthFromContainment = Geometry.computeMarkerResizeMaxWidth( imageWidth, imageHeight, pinCenter, aspectRatio );
			var maxWidth = Math.min( maxWidthFromRatio, maxWidthFromContainment );
			var minWidth = Math.min( MARKER_MIN_DISPLAY_WIDTH_NATURAL, maxWidth );

			var effectiveMaxScale = clampToRange( ( maxWidth / naturalW ) * 100, MARKER_SCALE_MIN, MARKER_SCALE_MAX );
			var effectiveMinScale = clampToRange( ( minWidth / naturalW ) * 100, MARKER_SCALE_MIN, effectiveMaxScale );

			var startScale = resolveMarkerScale( pin );
			var startWidth = Math.min( naturalW * ( startScale / 100 ), maxWidth );

			var pointerId = evt.pointerId;
			var svgEl = rt.getRenderer().getSvgElement();
			var startClientX = evt.clientX;

			if ( svgEl.setPointerCapture ) {
				svgEl.setPointerCapture( pointerId );
			}

			function handleMove( moveEvt ) {
				if ( moveEvt.pointerId !== pointerId ) {
					return;
				}
				moveEvt.stopPropagation();
				var screenPxPerNatural = getScreenPxPerNatural( svgEl );
				if ( ! screenPxPerNatural ) {
					return;
				}
				var deltaXNatural = ( moveEvt.clientX - startClientX ) / screenPxPerNatural;
				var newWidth = clampToRange( startWidth + deltaXNatural, minWidth, maxWidth );
				var newScale = clampToRange( ( newWidth / naturalW ) * 100, effectiveMinScale, effectiveMaxScale );
				newScale = Math.round( newScale * 10 ) / 10;
				setAttributes( {
					pins: latestRef.current.pins.map( function( p ) {
						return ( p.id === pinId ) ? Object.assign( {}, p, { markerScale: newScale } ) : p;
					} )
				} );
			}

			function endDrag( endEvt ) {
				if ( endEvt && endEvt.pointerId !== pointerId ) {
					return;
				}
				if ( endEvt ) {
					endEvt.stopPropagation();
				}
				if ( svgEl.hasPointerCapture && svgEl.hasPointerCapture( pointerId ) ) {
					svgEl.releasePointerCapture( pointerId );
				}
				svgEl.removeEventListener( 'pointermove', handleMove );
				svgEl.removeEventListener( 'pointerup', endDrag );
				svgEl.removeEventListener( 'pointercancel', endDrag );
			}

			svgEl.addEventListener( 'pointermove', handleMove );
			svgEl.addEventListener( 'pointerup', endDrag );
			svgEl.addEventListener( 'pointercancel', endDrag );
		}

		// Preview viewport(画像・letterbox部分の両方を含む)での背景pointerdown。
		// クリック(選択解除)とドラッグ(Pan、Zoom>100%のときのみ意味を持つ)は、pointer
		// 移動距離で区別する。
		function handleViewportPointerDown( rt, evt ) {
			evt.preventDefault();
			var pointerId = evt.pointerId;
			var svgEl = rt.getRenderer().getSvgElement();
			var startClientX = evt.clientX;
			var startClientY = evt.clientY;
			var startCamera = rt.getCamera();
			var screenPxPerNatural = getScreenPxPerNatural( svgEl );
			var moved = false;

			if ( svgEl.setPointerCapture ) {
				svgEl.setPointerCapture( pointerId );
			}

			function handleMove( moveEvt ) {
				if ( moveEvt.pointerId !== pointerId ) {
					return;
				}
				var dxScreen = moveEvt.clientX - startClientX;
				var dyScreen = moveEvt.clientY - startClientY;
				if ( ! moved && Math.sqrt( dxScreen * dxScreen + dyScreen * dyScreen ) >= PAN_CLICK_THRESHOLD_PX ) {
					moved = true;
					setPendingMenu( null );
				}
				if ( ! moved ) {
					return;
				}
				var snap = rt.getSnapshot();
				var model = snap.model;
				if ( ! model || ! model.image ) {
					return;
				}
				var dxNatural = -dxScreen / screenPxPerNatural;
				var dyNatural = -dyScreen / screenPxPerNatural;
				var nextCamera = SceneCamera.panBy( model.image.width, model.image.height, startCamera, dxNatural, dyNatural );
				rt.setCamera( nextCamera );
				setZoomPercent( nextCamera.zoomPercent );
			}

			function endDrag( endEvt ) {
				if ( endEvt && endEvt.pointerId !== pointerId ) {
					return;
				}
				if ( svgEl.hasPointerCapture && svgEl.hasPointerCapture( pointerId ) ) {
					svgEl.releasePointerCapture( pointerId );
				}
				svgEl.removeEventListener( 'pointermove', handleMove );
				svgEl.removeEventListener( 'pointerup', endDrag );
				svgEl.removeEventListener( 'pointercancel', endDrag );

				if ( moved || ! endEvt || endEvt.type === 'pointercancel' ) {
					return;
				}
				setSelectedPinId( null );
				setOpenPopoverPinId( null );
			}

			svgEl.addEventListener( 'pointermove', handleMove );
			svgEl.addEventListener( 'pointerup', endDrag );
			svgEl.addEventListener( 'pointercancel', endDrag );
		}

		// 画像の空いている部分をダブルクリックした場合だけ、その位置へ「ここにピンを追加」
		// 確認メニューを表示する。
		function handleViewportDoubleClick( rt, evt ) {
			var scenePt = rt.clientToScene( evt.clientX, evt.clientY );
			var snap = rt.getSnapshot();
			var model = snap.model;
			if ( ! scenePt || ! model || ! model.image || model.image.width <= 0 ) {
				return;
			}
			if ( scenePt.x < 0 || scenePt.x > model.image.width || scenePt.y < 0 || scenePt.y > model.image.height ) {
				return; // letterbox部分は無視する。
			}
			var xPercent = clampPercent( ( scenePt.x / model.image.width ) * 100 );
			var yPercent = clampPercent( ( scenePt.y / model.image.height ) * 100 );
			var svgRect = rt.getRenderer().getSvgElement().getBoundingClientRect();
			setSelectedPinId( null );
			setOpenPopoverPinId( null );
			setPendingMenu( {
				x: Math.round( xPercent * 10 ) / 10,
				y: Math.round( yPercent * 10 ) / 10,
				left: evt.clientX - svgRect.left,
				top: evt.clientY - svgRect.top
			} );
		}

		// Preview viewport上のマウスホイールで、既存のZoomを5%刻みで操作する。
		function handleViewportWheel( rt, evt ) {
			if ( ! evt.deltaY ) {
				return;
			}
			evt.preventDefault();
			var step = ( evt.deltaY < 0 ) ? 5 : -5;
			var current = rt.getCamera();
			var nextZoom = clampToRange( current.zoomPercent + step, MODAL_ZOOM_MIN, MODAL_ZOOM_MAX );
			rt.zoomTo( nextZoom );
			setZoomPercent( nextZoom );
			setPendingMenu( null );
		}

		function handlePopoverWheel( rt, evt ) {
			evt.preventDefault();
			var current = rt.getRenderState();
			var next = Math.max( 0, ( current.popoverScrollOffset || 0 ) + ( evt.deltaY > 0 ? 20 : -20 ) );
			rt.setRenderState( { popoverScrollOffset: next } );
		}

		// button種別(Popover開閉)のPinへ、Enter/Spaceでの活性化を提供する
		// (link種別はEditor内では発生しない。29節のresolvePinA11y editorOverlay分岐参照)。
		function handlePinKeyDown( pinId, evt ) {
			if ( 'Enter' !== evt.key && ' ' !== evt.key && 'Spacebar' !== evt.key ) {
				return;
			}
			evt.preventDefault();
			setSelectedPinId( pinId );
			setOpenPopoverPinId( function( prev ) { return ( prev === pinId ) ? null : pinId; } );
		}

		useEffect( function() {
			if ( ! isModalOpen ) {
				return;
			}
			var hostEl = modalHostRef.current;
			if ( ! hostEl ) {
				return;
			}

			var rt = SceneRuntime.createRuntime( hostEl, {
				editorOverlay: true,
				minZoom: MODAL_ZOOM_MIN,
				maxZoom: MODAL_ZOOM_MAX,
				rendererOptions: {
					// Fullscreen EditorのPreview viewportは固定16:9のletterbox窓のため、
					// SVG自身をhostへ明示的にfillさせ、preserveAspectRatioでletterboxさせる
					// (svg-renderer.js参照)。
					fillHost: true,
					onPinPointerDown: function( pinId, evt ) { handlePinPointerDown( rt, pinId, evt ); },
					onLabelPointerDown: function( pinId, evt ) { handleLabelPointerDown( rt, pinId, evt ); },
					onMarkerResizePointerDown: function( pinId, evt ) { handleMarkerResizePointerDown( rt, pinId, evt ); },
					onViewportPointerDown: function( evt ) { handleViewportPointerDown( rt, evt ); },
					onViewportDoubleClick: function( evt ) { handleViewportDoubleClick( rt, evt ); },
					onViewportWheel: function( evt ) { handleViewportWheel( rt, evt ); },
					onPopoverWheel: function( evt ) { handlePopoverWheel( rt, evt ); },
					onPinKeyDown: function( pinId, evt ) { handlePinKeyDown( pinId, evt ); }
				}
			} );
			modalRuntimeRef.current = rt;
			setZoomPercent( MODAL_ZOOM_DEFAULT );
			rt.setAttributes( modalPreviewAttributes );
			rt.setRenderState( {
				selectedPinId: latestRef.current.selectedPinId,
				openPopoverPinId: latestRef.current.openPopoverPinId,
				editorOverlay: true
			} );

			return function() {
				rt.dispose();
				modalRuntimeRef.current = null;
			};
			// isModalOpenの変化(開いた/閉じた)だけでmount/unmountする。中身の更新は
			// 下記の別useEffectがmodalRuntimeRef.current経由で行う(interactionコールバック
			// 自体を毎レンダリング再生成しない、安定した1つのRendererインスタンスを保つため)。
		}, [ isModalOpen ] );

		useEffect( function() {
			if ( modalRuntimeRef.current ) {
				modalRuntimeRef.current.setAttributes( modalPreviewAttributes );
			}
		}, [ modalPreviewAttributes ] );

		useEffect( function() {
			if ( modalRuntimeRef.current ) {
				modalRuntimeRef.current.setRenderState( {
					selectedPinId: selectedPinId,
					openPopoverPinId: openPopoverPinId,
					editorOverlay: true
				} );
			}
		}, [ selectedPinId, openPopoverPinId ] );

		// 「全体を表示する」: Fit状態(Zoom=100%・中心=画像中心)へ戻す。
		function resetToFit() {
			if ( modalRuntimeRef.current ) {
				modalRuntimeRef.current.resetToFit();
			}
			setZoomPercent( MODAL_ZOOM_DEFAULT );
		}

		function handleZoomRangeChange( value ) {
			var next = ( typeof value === 'number' ) ? value : MODAL_ZOOM_DEFAULT;
			setZoomPercent( next );
			if ( modalRuntimeRef.current ) {
				modalRuntimeRef.current.zoomTo( next );
			}
		}

		// 「ここにピンを追加」確認メニュー表示中、メニュー自身以外の場所がpointerdownされたら
		// 閉じる(captureフェーズで登録し、各要素個別のstopPropagationの影響を受けないようにする)。
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

		// Zoom変更時、Pin追加候補は候補位置の意味が薄れるため閉じる。
		useEffect( function() {
			setPendingMenu( null );
		}, [ zoomPercent, modalPreviewSize.width, modalPreviewSize.height ] );

		// getBlocksByName() はブロックエディタのストアが保持する索引を使う。非対応の古い環境
		// 向けに、手動走査へのフォールバックを残す。
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

		// selectedPinId/openPopoverPinIdが指すピンが(Undo等で)存在しなくなった場合にのみ
		// nullへ戻す。
		useEffect( function() {
			if ( selectedPinId === null ) {
				return;
			}
			var exists = pins.some( function( p ) { return p.id === selectedPinId; } );
			if ( ! exists ) {
				setSelectedPinId( null );
			}
		}, [ pins, selectedPinId ] );

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

		// pinSize/labelFontSize/popoverFontSize が未設定(0)の場合のみ、新しい画像の幅から
		// 自動計算する。
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
			setOpenPopoverPinId( null );
		}

		function addPinFromMenu() {
			if ( ! pendingMenu ) {
				return;
			}
			createPinAt( pendingMenu.x, pendingMenu.y );
			setPendingMenu( null );
		}

		function addPinAtCenter() {
			setPendingMenu( null );
			createPinAt( 50, 50 );
		}

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
			setOpenPopoverPinId( null );
		}

		function updateSelectedPinFields( fields ) {
			updatePins(
				pins.map( function( p ) {
					return ( p.id !== selectedPinId ) ? p : Object.assign( {}, p, fields );
				} )
			);
		}
		function updateSelectedPin( field, value ) {
			var fields = {};
			fields[ field ] = value;
			updateSelectedPinFields( fields );
		}

		function handleSelectMarkerImage( media ) {
			updateSelectedPinFields( { markerImageId: media.id, markerImageUrl: media.url } );
		}
		function clearMarkerImage() {
			updateSelectedPinFields( { markerImageId: 0, markerImageUrl: '' } );
		}

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

		// 「画像として保存」(PNG書き出し)。png-export.jsの共通pipelineを使う(Popover/
		// Editor overlay無しの同じSVG Rendererで、確定済みAttributesスナップショットから
		// 一から合成する。Editor Previewのスクリーンショットではない)。
		function handleSaveAsImage() {
			if ( ! attributes.imageUrl || ! attributes.imageWidth || ! attributes.imageHeight ) {
				return;
			}
			var fileName = buildExportFileName( attributes.imageUrl );

			// 利用者向け文言は変更しない。ただし現状の実装は失敗理由を問わずこの1文へ
			// まとめてしまうため、開発者が実際の失敗段階(fetch失敗・CORS拒否・
			// Canvas/toBlob失敗等)を追えるよう、まずconsole.errorへ実際のエラーを
			// 残す(scene-assets.js fetchAsDataUrl()のエラーメッセージに
			// URL・段階を含めてあるので、ここではそれをそのまま出すだけでよい)。
			function reportGenerationError( err ) {
				if ( err ) {
					console.error( '[Image Pin Block] PNG export failed:', err );
				}
				window.alert( __( 'Unable to save the image due to restrictions on an external image.', 'image-pin-block' ) );
			}

			if ( typeof window.showSaveFilePicker === 'function' ) {
				window.showSaveFilePicker( {
					suggestedName: fileName,
					types: [ { description: 'PNG image', accept: { 'image/png': [ '.png' ] } } ]
				} ).then( function( handle ) {
					return PngExport.exportPng( attributes, { ownerDocument: document } ).then( function( blob ) {
						return writeBlobToFileHandle( handle, blob );
					} );
				} ).catch( function( err ) {
					if ( err && 'AbortError' === err.name ) {
						return;
					}
					reportGenerationError( err );
				} );
				return;
			}

			PngExport.exportPng( attributes, { ownerDocument: document } ).then( function( blob ) {
				triggerPngDownload( blob, fileName );
			} ).catch( function( err ) {
				reportGenerationError( err );
			} );
		}

		var selectedPin = null;
		pins.forEach( function( p ) {
			if ( p.id === selectedPinId ) {
				selectedPin = p;
			}
		} );

		// v0.2.0で編集UIをモーダルに集約したため、サイドバーには「ピンを編集」ボタンのみを置く。
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
							return el( Button, { variant: 'primary', onClick: obj.open }, __( 'Select image', 'image-pin-block' ) );
						}
					} )
				)
			);
		}

		// モーダル右側「ブロック全体の設定」。
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
						colorSettings: [ {
							value: displaySettings.pinColor,
							onChange: function( color ) { setAttributes( { pinColor: color || DEFAULT_PIN_COLOR } ); },
							label: __( 'Pin color (round marker only)', 'image-pin-block' )
						} ]
					} )
					: null,
				el(
					MediaUploadCheck,
					{},
					el( MediaUpload, {
						onSelect: handleSelectImage,
						// imageIdが0(旧記事等、実際の添付ファイルIDが分からない状態)のときは
						// valueを渡さない。0を渡すと、メディアライブラリが存在しない添付ファイルID 0を
						// 選択済みとして解決しようとし、ダイアログの状態が不安定になる(選択・
						// アップロードが時々反映されない症状の原因になり得るため)。
						value: attributes.imageId || undefined,
						allowedTypes: [ 'image/png', 'image/jpeg' ],
						render: function( obj ) {
							return el( Button, { variant: 'secondary', onClick: obj.open }, __( 'Change image', 'image-pin-block' ) );
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
					onChange: function( value ) { setAttributes( { labelBackgroundOpacity: ( typeof value === 'number' ) ? value : DEFAULT_BG_OPACITY } ); }
				} ),
				el( CheckboxControl, {
					label: __( 'Add a speech bubble tail', 'image-pin-block' ),
					checked: !! attributes.labelSpeechBubble,
					onChange: function( checked ) { setAttributes( { labelSpeechBubble: checked } ); }
				} ),
				attributes.labelSpeechBubble ? el( SelectControl, {
					label: __( 'Label tail size', 'image-pin-block' ),
					value: resolveTailSizeAttr( attributes.labelTailSize ),
					options: TAIL_SIZE_OPTIONS,
					onChange: function( value ) { setAttributes( { labelTailSize: value } ); }
				} ) : null,
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
					enableAlpha: true,
					onPreview: function( color ) { setColorPreview( 'popoverBackgroundColor', color ); },
					onPreviewClear: function() { clearColorPreview( 'popoverBackgroundColor' ); },
					onCommit: function( color ) { setAttributes( { popoverBackgroundColor: color || '' } ); }
				} ),
				el( RangeControl, {
					label: __( 'Popover background opacity', 'image-pin-block' ),
					value: popoverSettings.backgroundOpacity,
					min: 0,
					max: 100,
					onChange: function( value ) { setAttributes( { popoverBackgroundOpacity: ( typeof value === 'number' ) ? value : DEFAULT_BG_OPACITY } ); }
				} ),
				el( CheckboxControl, {
					label: __( 'Add a speech bubble tail', 'image-pin-block' ),
					checked: !! attributes.popoverSpeechBubble,
					onChange: function( checked ) { setAttributes( { popoverSpeechBubble: checked } ); }
				} ),
				attributes.popoverSpeechBubble ? el( SelectControl, {
					label: __( 'Popover tail size', 'image-pin-block' ),
					value: resolveTailSizeAttr( attributes.popoverTailSize ),
					options: TAIL_SIZE_OPTIONS,
					onChange: function( value ) { setAttributes( { popoverTailSize: value } ); }
				} ) : null
			)
		);

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
				el( Button, { variant: 'secondary', onClick: addPinFromMenu }, __( 'Add a pin here', 'image-pin-block' ) )
			)
			: null;

		// Preview(モーダル内画像編集エリア): host(利用可能領域) → 16:9固定・実際にSVG
		// Sceneをmountするviewport、という2段構成に単純化した(旧実装のpan layer/image
		// wrapperへの個別transform:scale()/translate()は不要になった。Fit/Zoom/Panは
		// すべてsvg viewBoxが担う。29節)。
		var modalImageArea = el(
			'div',
			{ className: 'image-pin-block-editor__modal-preview-host', ref: modalOuterHostRef },
			el(
				'div',
				{
					className: 'image-pin-block-editor__modal-preview-viewport' + ( zoomPercent > MODAL_ZOOM_MIN ? ' is-zoomed' : '' ),
					style: { width: modalPreviewSize.width + 'px', height: modalPreviewSize.height + 'px' },
					ref: modalHostRef
				}
			),
			pendingMenuElement
		);

		var modalLeftTop = el(
			'div',
			{ className: 'image-pin-block-editor__modal-left-top' },
			el(
				'div',
				{ className: 'image-pin-block-editor__zoom-row' },
				el( RangeControl, {
					className: 'image-pin-block-editor__zoom-range',
					label: __( 'Zoom (%)', 'image-pin-block' ),
					value: zoomPercent,
					min: MODAL_ZOOM_MIN,
					max: MODAL_ZOOM_MAX,
					onChange: handleZoomRangeChange
				} ),
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
			el(
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
					el( Button, { variant: 'secondary', disabled: ! selectedPin, onClick: duplicateSelectedPin }, __( 'Duplicate pin', 'image-pin-block' ) ),
					el( Button, { variant: 'secondary', isDestructive: true, disabled: ! selectedPin, onClick: removeSelectedPin }, __( 'Delete this pin', 'image-pin-block' ) )
				)
			)
		);

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
											// 上のMain画像側と同じ理由(0/未設定を選択済みとして渡さない)。
											value: selectedPin.markerImageId || undefined,
											allowedTypes: [ 'image/png', 'image/jpeg' ],
											render: function( obj ) {
												return el( Button, { variant: 'secondary', onClick: obj.open }, __( 'Change marker image', 'image-pin-block' ) );
											}
										} )
									),
									el( Button, { variant: 'tertiary', isDestructive: true, onClick: clearMarkerImage }, __( 'Remove marker image', 'image-pin-block' ) )
								)
								: el(
									MediaUploadCheck,
									{},
									el( MediaUpload, {
										onSelect: handleSelectMarkerImage,
										allowedTypes: [ 'image/png', 'image/jpeg' ],
										render: function( obj ) {
											return el( Button, { variant: 'secondary', onClick: obj.open }, __( 'Select marker image', 'image-pin-block' ) );
										}
									} )
								),
							selectedPin.markerImageUrl
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

		var modalLeft = el( 'div', { className: 'image-pin-block-editor__modal-left' }, modalLeftTop, modalLeftBottom );

		var settingsDrawerBackdrop = isSettingsDrawerOpen
			? el( 'div', {
				className: 'image-pin-block-editor__modal-drawer-backdrop',
				onClick: function() { setIsSettingsDrawerOpen( false ); }
			} )
			: null;

		var modalElement = isModalOpen
			? el(
				Modal,
				{
					title: __( 'Edit pins', 'image-pin-block' ),
					onRequestClose: closeModal,
					isFullScreen: true,
					className: 'image-pin-block-editor__modal',
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
					ref: staticHostRef,
					className: 'image-pin-block-editor__wrapper--static',
					// Sceneの描画(SVG)は非同期(画像読み込み・フォント待ち)で少し遅れて入るため、
					// 画像サイズが分かっている時点でその縦横比分の高さを先に確保しておく
					// (指定が無いと、選択直後の一瞬だけ枠の高さが0になり、ブロックが消えたように
					// 見えてしまうため。画像サイズ未確定時はeditor.css側のmin-heightに任せる)。
					style: ( attributes.imageWidth > 0 && attributes.imageHeight > 0 )
						? { aspectRatio: attributes.imageWidth + ' / ' + attributes.imageHeight }
						: null,
					onDoubleClick: handleCanvasDoubleClick
				}
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
			pinSize: { type: 'number', default: 0 },
			pinColor: { type: 'string', default: DEFAULT_PIN_COLOR },
			labelBackgroundColor: { type: 'string', default: DEFAULT_LABEL_BG_COLOR },
			labelTextColor: { type: 'string', default: DEFAULT_LABEL_TEXT_COLOR },
			labelFontSize: { type: 'number', default: 0 },
			labelBackgroundOpacity: { type: 'number', default: DEFAULT_BG_OPACITY },
			labelStrokeColor: { type: 'string', default: DEFAULT_STROKE_COLOR },
			labelStrokeWidth: { type: 'string', default: DEFAULT_STROKE_WIDTH },
			popoverFontSize: { type: 'number', default: 0 },
			popoverBackgroundColor: { type: 'string', default: '' },
			popoverBackgroundOpacity: { type: 'number', default: DEFAULT_BG_OPACITY },
			popoverTextColor: { type: 'string', default: '' },
			popoverStrokeColor: { type: 'string', default: DEFAULT_STROKE_COLOR },
			popoverStrokeWidth: { type: 'string', default: DEFAULT_STROKE_WIDTH },
			labelSpeechBubble: { type: 'boolean', default: false },
			popoverSpeechBubble: { type: 'boolean', default: false },
			labelTailSize: { type: 'string', default: 'medium' },
			popoverTailSize: { type: 'string', default: 'medium' },
			pins: { type: 'array', default: [] }
		},
		edit: Edit,
		save: function() { return null; }
	} );
} )(
	window.wp.blocks,
	window.wp.element,
	window.wp.blockEditor,
	window.wp.components,
	window.wp.data,
	window.wp.i18n,
	window.ImagePinBlockGeometry,
	window.ImagePinBlockSceneCamera,
	window.ImagePinBlockSceneRuntime,
	window.ImagePinBlockPngExport
);
