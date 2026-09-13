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
	var DEFAULT_PIN_COLOR = '#e63946';
	var DEFAULT_LABEL_BG_COLOR = 'rgba(255,255,255,0.9)';
	var DEFAULT_LABEL_TEXT_COLOR = '#1e1e1e';

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

	function pointFromEvent( evt, wrapperEl ) {
		if ( ! wrapperEl ) {
			return null;
		}
		var rect = wrapperEl.getBoundingClientRect();
		var x = ( ( evt.clientX - rect.left ) / rect.width ) * 100;
		var y = ( ( evt.clientY - rect.top ) / rect.height ) * 100;
		x = Math.min( 100, Math.max( 0, x ) );
		y = Math.min( 100, Math.max( 0, y ) );
		return {
			x: Math.round( x * 10 ) / 10,
			y: Math.round( y * 10 ) / 10
		};
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
	// display: { pinSize, pinColor, labelBackgroundColor, labelTextColor }(ブロック単位の見た目設定)。
	// ピンのサイズ・色は丸マーカーのみに適用し、ラベルの背景色・文字色は丸マーカー・画像マーカー共通。
	function buildPinContent( pin, display ) {
		var hasLabelText = !! ( pin.label && '' !== pin.label );
		var labelStyle = {
			backgroundColor: display.labelBackgroundColor,
			color: display.labelTextColor
		};

		if ( pin.markerImageUrl ) {
			var scale = ( pin.markerScale && pin.markerScale >= MARKER_SCALE_MIN && pin.markerScale <= MARKER_SCALE_MAX )
				? pin.markerScale
				: DEFAULT_MARKER_SCALE;
			var showLabel = pin.showLabel !== false;
			var children = [
				el( 'img', {
					key: 'marker-image',
					className: 'image-pin-block-editor__pin-marker-image',
					src: pin.markerImageUrl,
					alt: '',
					style: { transform: 'scale(' + ( scale / 100 ) + ')' }
				} )
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

		var dotLabelText = hasLabelText ? pin.label : __( 'Pin', 'image-pin-block' );
		var dotStyle = {
			width: display.pinSize + 'px',
			height: display.pinSize + 'px',
			backgroundColor: display.pinColor
		};
		return [
			el( 'span', { key: 'dot', className: 'image-pin-block-editor__pin-dot', style: dotStyle, 'aria-hidden': 'true' } ),
			el( 'span', { key: 'label', className: 'image-pin-block-editor__pin-label', style: labelStyle }, dotLabelText )
		];
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
			labelTextColor: attributes.labelTextColor || DEFAULT_LABEL_TEXT_COLOR
		};

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

		// getClientIdsWithDescendants() はネストの深さに関わらず、投稿内の全ブロックの
		// clientId をフラットに返す(グループ/カラム内の見出しも含む)。
		// 依存配列を渡さず、レンダリングのたびに再評価してブロックの追加・編集に追従させる。
		var headingBlocks = useSelect( function( select ) {
			var editorSelect = select( 'core/block-editor' );
			if ( ! editorSelect || ! editorSelect.getClientIdsWithDescendants ) {
				return [];
			}
			var clientIds = editorSelect.getClientIdsWithDescendants();
			var result = [];
			clientIds.forEach( function( clientId ) {
				var block = editorSelect.getBlock( clientId );
				if ( block && block.name === 'core/heading' ) {
					result.push( block );
				}
			} );
			return result;
		} );

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

		function updatePins( nextPins ) {
			setAttributes( { pins: nextPins } );
		}

		function handleSelectImage( media ) {
			setAttributes( {
				imageId: media.id,
				imageUrl: media.url,
				imageWidth: media.width || 0,
				imageHeight: media.height || 0
			} );
		}

		// 画像上の「何もない場所」をクリック → その位置に「ここにピンを追加」メニューを表示する。
		// (ピン自体のクリックは stopPropagation されているため、ここには来ない)
		function handleWrapperClick( evt ) {
			var wrapperEl = wrapperRef.current;
			var point = pointFromEvent( evt, wrapperEl );
			if ( ! point || ! wrapperEl ) {
				return;
			}
			var pixel = pixelPointFromEvent( evt, wrapperEl );
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

			function handleMove( moveEvt ) {
				if ( moveEvt.pointerId !== pointerId ) {
					return;
				}
				moveEvt.stopPropagation();
				var point = pointFromEvent( moveEvt, wrapperEl );
				if ( ! point ) {
					return;
				}
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
				el( TextControl, {
					label: __( 'Pin size (px, round marker only)', 'image-pin-block' ),
					type: 'number',
					value: String( displaySettings.pinSize ),
					onChange: function( value ) {
						var n = parseFloat( value );
						if ( isNaN( n ) || n < PIN_SIZE_MIN || n > PIN_SIZE_MAX ) {
							n = DEFAULT_PIN_SIZE;
						}
						setAttributes( { pinSize: n } );
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
						},
						{
							value: displaySettings.labelBackgroundColor,
							onChange: function( color ) { setAttributes( { labelBackgroundColor: color || DEFAULT_LABEL_BG_COLOR } ); },
							label: __( 'Label background color', 'image-pin-block' )
						},
						{
							value: displaySettings.labelTextColor,
							onChange: function( color ) { setAttributes( { labelTextColor: color || DEFAULT_LABEL_TEXT_COLOR } ); },
							label: __( 'Label text color', 'image-pin-block' )
						}
					]
				} )
				: null,
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
						? el( TextControl, {
							label: __( 'Marker image scale (%)', 'image-pin-block' ),
							type: 'number',
							value: String( selectedPin.markerScale || DEFAULT_MARKER_SCALE ),
							onChange: function( value ) {
								var n = parseFloat( value );
								if ( isNaN( n ) || n < MARKER_SCALE_MIN || n > MARKER_SCALE_MAX ) {
									n = DEFAULT_MARKER_SCALE;
								}
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
				buildPinContent( pin, displaySettings )
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
				menuElement
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
			pinSize: { type: 'number', default: DEFAULT_PIN_SIZE },
			pinColor: { type: 'string', default: DEFAULT_PIN_COLOR },
			labelBackgroundColor: { type: 'string', default: DEFAULT_LABEL_BG_COLOR },
			labelTextColor: { type: 'string', default: DEFAULT_LABEL_TEXT_COLOR },
			pins: { type: 'array', default: [] }
		},
		edit: Edit,
		save: function() { return null; }
	} );
} )( window.wp.blocks, window.wp.element, window.wp.blockEditor, window.wp.components, window.wp.data, window.wp.i18n );
