<?php
/**
 * Plugin Name: Image Pin Block
 * Description: A block that places pins on an image to show descriptions and jump to other parts of the page.
 * Version: 0.3.1
 * Author: naoijponly
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: image-pin-block
 * Domain Path: /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 翻訳ファイルの読み込み。
 *
 * WordPress 6.7 以降、load_plugin_textdomain() は 'init' フック以降で呼び出す
 * 必要がある(それより前に呼ぶと無視されるか、_doing_it_wrong() の警告が出る)。
 */
function image_pin_block_load_textdomain() {
	load_plugin_textdomain( 'image-pin-block', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
}
add_action( 'init', 'image_pin_block_load_textdomain', 1 );

/**
 * 全スクリプト・スタイル共通のアセット版。
 *
 * 複数ファイルに分かれているため、ファイルごとの更新時刻だけを版にすると、一部のファイルだけ
 * ブラウザ・サーバーのキャッシュに古い版が残った場合に組み合わせが壊れる(片方だけ新しい
 * 関数を呼んで描画が止まる等)。プラグインの版と全ファイルの最大更新時刻を1つにまとめて全ての
 * アセットに使うことで、どれか1つでも更新されれば全アセットのURLが切り替わるようにする。
 */
function image_pin_block_asset_version() {
	static $version = null;
	if ( null !== $version ) {
		return $version;
	}
	$dir   = __DIR__;
	$files = array( 'geometry.js', 'scene-text.js', 'scene-assets.js', 'scene-model.js', 'scene-camera.js', 'svg-renderer.js', 'scene-runtime.js', 'png-export.js', 'editor.js', 'view.js', 'editor.css', 'style.css', 'block.json' );
	$latest = 0;
	foreach ( $files as $file ) {
		$mtime = @filemtime( $dir . '/' . $file );
		if ( $mtime && $mtime > $latest ) {
			$latest = $mtime;
		}
	}
	$version = '0.3.1.' . $latest;
	return $version;
}

/**
 * SVG Scene Renderer移行後のスクリプト登録。
 *
 * 「Scene Core」(geometry/scene-text/scene-assets/scene-model/scene-camera/
 * svg-renderer/scene-runtime)は、Editor(通常Preview/Fullscreen)・Frontend・
 * Frontend Lightboxのすべてが共有する唯一のVisual生成経路であり、それぞれの
 * ハンドルへの依存として個別に登録する(ビルドツールを使わない構成のため、
 * 依存関係はここのdependencies配列で明示する。各ファイル先頭のUMDラッパーが
 * 期待する読み込み順序と必ず一致させること)。
 * png-export.js(PNG書き出し)はEditorのみが必要とし、Frontendには読み込ませない
 * (Frontendへ不要なEditor専用依存を持ち込まない)。
 */
function image_pin_block_register_block() {
	$dir = __DIR__;

	wp_register_script(
		'image-pin-block-geometry',
		plugins_url( 'geometry.js', __FILE__ ),
		array(),
		image_pin_block_asset_version(),
		true
	);
	wp_register_script(
		'image-pin-block-scene-text',
		plugins_url( 'scene-text.js', __FILE__ ),
		array(),
		image_pin_block_asset_version(),
		true
	);
	wp_register_script(
		'image-pin-block-scene-assets',
		plugins_url( 'scene-assets.js', __FILE__ ),
		array(),
		image_pin_block_asset_version(),
		true
	);
	wp_register_script(
		'image-pin-block-scene-model',
		plugins_url( 'scene-model.js', __FILE__ ),
		array( 'image-pin-block-geometry' ),
		image_pin_block_asset_version(),
		true
	);
	wp_register_script(
		'image-pin-block-scene-camera',
		plugins_url( 'scene-camera.js', __FILE__ ),
		array(),
		image_pin_block_asset_version(),
		true
	);
	wp_register_script(
		'image-pin-block-svg-renderer',
		plugins_url( 'svg-renderer.js', __FILE__ ),
		array( 'image-pin-block-scene-text', 'image-pin-block-scene-camera', 'image-pin-block-geometry' ),
		image_pin_block_asset_version(),
		true
	);
	wp_register_script(
		'image-pin-block-scene-runtime',
		plugins_url( 'scene-runtime.js', __FILE__ ),
		array(
			'image-pin-block-geometry',
			'image-pin-block-scene-model',
			'image-pin-block-scene-assets',
			'image-pin-block-scene-text',
			'image-pin-block-scene-camera',
			'image-pin-block-svg-renderer',
		),
		image_pin_block_asset_version(),
		true
	);
	wp_register_script(
		'image-pin-block-png-export',
		plugins_url( 'png-export.js', __FILE__ ),
		array( 'image-pin-block-scene-assets', 'image-pin-block-scene-runtime', 'image-pin-block-svg-renderer' ),
		image_pin_block_asset_version(),
		true
	);

	wp_register_script(
		'image-pin-block-editor',
		plugins_url( 'editor.js', __FILE__ ),
		array(
			'wp-blocks',
			'wp-element',
			'wp-block-editor',
			'wp-components',
			'wp-data',
			'wp-i18n',
			'image-pin-block-geometry',
			'image-pin-block-scene-camera',
			'image-pin-block-scene-runtime',
			'image-pin-block-png-export',
		),
		image_pin_block_asset_version(),
		true
	);
	wp_set_script_translations( 'image-pin-block-editor', 'image-pin-block', $dir . '/languages' );

	wp_register_style(
		'image-pin-block-editor-style',
		plugins_url( 'editor.css', __FILE__ ),
		array(),
		image_pin_block_asset_version()
	);
	wp_register_style(
		'image-pin-block-style',
		plugins_url( 'style.css', __FILE__ ),
		array(),
		image_pin_block_asset_version()
	);

	wp_register_script(
		'image-pin-block-view',
		plugins_url( 'view.js', __FILE__ ),
		array( 'wp-i18n', 'image-pin-block-scene-runtime', 'image-pin-block-scene-camera' ),
		image_pin_block_asset_version(),
		true
	);
	wp_set_script_translations( 'image-pin-block-view', 'image-pin-block', $dir . '/languages' );

	register_block_type(
		$dir,
		array(
			'editor_script'   => 'image-pin-block-editor',
			'editor_style'    => 'image-pin-block-editor-style',
			'style'           => 'image-pin-block-style',
			'script'          => 'image-pin-block-view',
			'render_callback' => 'image_pin_block_render_callback',
		)
	);
}
add_action( 'init', 'image_pin_block_register_block' );

/**
 * pinColor 等が安全なCSSカラー表記かどうかを検証する。
 *
 * esc_attr() は引用符や山括弧はエスケープするが、セミコロンや括弧はそのまま
 * 通すため、値が「色」であることまでは保証しない。JSON payload内の値としても
 * (現在は直接styleへ出力しない構成でも)、保存データが壊れている場合に
 * 想定外の文字列がJSへ渡らないよう、引き続き形式を絞り込む。
 *
 * 許可する形式: #rgb / #rgba / #rrggbb / #rrggbbaa、rgb()/rgba()/hsl()/hsla()、
 * CSS標準色名(拡張色名キーワード)。
 */
function image_pin_block_sanitize_color( $value, $default ) {
	if ( ! is_string( $value ) ) {
		return $default;
	}
	$value = trim( $value );
	if ( '' === $value ) {
		return $default;
	}

	if ( preg_match( '/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $value ) ) {
		return $value;
	}

	if ( preg_match( '/^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*(?:,\s*[0-9.]+%?\s*)?\)$/i', $value ) ) {
		return $value;
	}

	$named_colors = array(
		'transparent', 'currentcolor', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure',
		'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood',
		'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson',
		'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
		'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
		'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey',
		'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
		'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold',
		'goldenrod', 'gray', 'grey', 'green', 'greenyellow', 'honeydew', 'hotpink', 'indianred',
		'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon',
		'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen',
		'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
		'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta',
		'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
		'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
		'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab',
		'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
		'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple',
		'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown',
		'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey',
		'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet',
		'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
	);
	if ( in_array( strtolower( $value ), $named_colors, true ) ) {
		return $value;
	}

	return $default;
}

/**
 * フロント側のマウントhostを組み立てる。
 *
 * Main Image/Pin/Marker/Label/Bubble/PC PopoverのVisual markupはもはや一切
 * 出力しない(唯一のRendererはsvg-renderer.jsであり、PHPはそれを複製しない。
 * 21節)。ここで行うのは: (1) 保存済みAttributesのサニタイズ、(2) それを
 * JSON化した「安全なpayload」1つの出力、(3) Scene RuntimeのMount host・
 * Lightboxトリガー・Mobile Description Panelのshell(いずれも空。中身は
 * view.jsが実行時に組み立てる)、(4) JS未実行時の最小限のフォールバック
 * (<noscript>内の素の<img>)、の4つだけ。
 */
function image_pin_block_render_callback( $attributes, $content ) {
	$image_url    = isset( $attributes['imageUrl'] ) ? esc_url_raw( $attributes['imageUrl'] ) : '';
	$image_width  = isset( $attributes['imageWidth'] ) ? absint( $attributes['imageWidth'] ) : 0;
	$image_height = isset( $attributes['imageHeight'] ) ? absint( $attributes['imageHeight'] ) : 0;

	$pins_raw = ( isset( $attributes['pins'] ) && is_array( $attributes['pins'] ) ) ? $attributes['pins'] : array();

	if ( '' === $image_url || empty( $pins_raw ) ) {
		return '';
	}

	$allowed_pc_behaviors     = array( 'hover-click', 'click-link' );
	$allowed_mobile_behaviors = array( 'tap-jump', 'tap-tap', 'tap-link' );

	$pc_behavior = isset( $attributes['pcBehavior'] ) && in_array( $attributes['pcBehavior'], $allowed_pc_behaviors, true )
		? $attributes['pcBehavior']
		: 'hover-click';

	$mobile_behavior = isset( $attributes['mobileBehavior'] ) && in_array( $attributes['mobileBehavior'], $allowed_mobile_behaviors, true )
		? $attributes['mobileBehavior']
		: 'tap-tap';

	// ピンの見た目(ブロック単位)。範囲外(下限・上限とも)ならデフォルト値にフォールバックする
	// (クランプではない。中途半端な値に丸めるより、意図しない極端な値ははっきり既定の
	// 見た目に戻したほうが分かりやすいため。scene-model.jsのDEFAULTSと必ず一致させること)。
	$pin_size_min     = 4;
	$pin_size_max     = 300;
	$pin_size_default = 24;
	$pin_size         = ( isset( $attributes['pinSize'] ) && is_numeric( $attributes['pinSize'] )
		&& (float) $attributes['pinSize'] >= $pin_size_min && (float) $attributes['pinSize'] <= $pin_size_max )
		? (float) $attributes['pinSize']
		: $pin_size_default;

	$pin_color        = image_pin_block_sanitize_color( isset( $attributes['pinColor'] ) ? $attributes['pinColor'] : '', '#e63946' );
	$label_bg_color   = image_pin_block_sanitize_color( isset( $attributes['labelBackgroundColor'] ) ? $attributes['labelBackgroundColor'] : '', 'rgba(255,255,255,0.9)' );
	$label_text_color = image_pin_block_sanitize_color( isset( $attributes['labelTextColor'] ) ? $attributes['labelTextColor'] : '', '#1e1e1e' );

	$label_font_size_min     = 6;
	$label_font_size_max     = 200;
	$label_font_size_default = 12;
	$label_font_size         = ( isset( $attributes['labelFontSize'] ) && is_numeric( $attributes['labelFontSize'] )
		&& (float) $attributes['labelFontSize'] >= $label_font_size_min && (float) $attributes['labelFontSize'] <= $label_font_size_max )
		? (float) $attributes['labelFontSize']
		: $label_font_size_default;

	$label_bg_opacity = ( isset( $attributes['labelBackgroundOpacity'] ) && is_numeric( $attributes['labelBackgroundOpacity'] )
		&& (float) $attributes['labelBackgroundOpacity'] >= 0 && (float) $attributes['labelBackgroundOpacity'] <= 100 )
		? (float) $attributes['labelBackgroundOpacity']
		: 100;

	$stroke_widths      = array( 'none', 'thin', 'normal', 'thick' );
	$label_stroke_width = isset( $attributes['labelStrokeWidth'] ) && in_array( $attributes['labelStrokeWidth'], $stroke_widths, true )
		? $attributes['labelStrokeWidth']
		: 'none';
	$label_stroke_color = image_pin_block_sanitize_color( isset( $attributes['labelStrokeColor'] ) ? $attributes['labelStrokeColor'] : '', '#ffffff' );

	$popover_font_size_min     = 6;
	$popover_font_size_max     = 200;
	$popover_font_size_default = 12;
	$popover_font_size         = ( isset( $attributes['popoverFontSize'] ) && is_numeric( $attributes['popoverFontSize'] )
		&& (float) $attributes['popoverFontSize'] >= $popover_font_size_min && (float) $attributes['popoverFontSize'] <= $popover_font_size_max )
		? (float) $attributes['popoverFontSize']
		: $popover_font_size_default;

	// popoverBackgroundColor/popoverTextColorは空文字が「未設定」を表すセンチネル値のまま
	// JSへ渡す(fallback解決・不透明度の合成はscene-runtime.js側の責務。11節: PHPは
	// 色の不透明度を先に合成しない。合成ロジックを2箇所に複製しないため)。
	$popover_bg_color_raw = image_pin_block_sanitize_color( isset( $attributes['popoverBackgroundColor'] ) ? $attributes['popoverBackgroundColor'] : '', '' );
	$popover_text_color   = image_pin_block_sanitize_color( isset( $attributes['popoverTextColor'] ) ? $attributes['popoverTextColor'] : '', '' );

	$popover_bg_opacity = ( isset( $attributes['popoverBackgroundOpacity'] ) && is_numeric( $attributes['popoverBackgroundOpacity'] )
		&& (float) $attributes['popoverBackgroundOpacity'] >= 0 && (float) $attributes['popoverBackgroundOpacity'] <= 100 )
		? (float) $attributes['popoverBackgroundOpacity']
		: 100;

	$popover_stroke_width = isset( $attributes['popoverStrokeWidth'] ) && in_array( $attributes['popoverStrokeWidth'], $stroke_widths, true )
		? $attributes['popoverStrokeWidth']
		: 'none';
	$popover_stroke_color = image_pin_block_sanitize_color( isset( $attributes['popoverStrokeColor'] ) ? $attributes['popoverStrokeColor'] : '', '#ffffff' );

	$label_speech_bubble   = ! empty( $attributes['labelSpeechBubble'] );
	$popover_speech_bubble = ! empty( $attributes['popoverSpeechBubble'] );

	$tail_sizes        = array( 'small', 'medium', 'large' );
	$label_tail_size   = ( isset( $attributes['labelTailSize'] ) && in_array( $attributes['labelTailSize'], $tail_sizes, true ) ) ? $attributes['labelTailSize'] : 'medium';
	$popover_tail_size = ( isset( $attributes['popoverTailSize'] ) && in_array( $attributes['popoverTailSize'], $tail_sizes, true ) ) ? $attributes['popoverTailSize'] : 'medium';

	$marker_scale_min     = 1;
	$marker_scale_max     = 500;
	$marker_scale_default = 100;

	$pins = array();
	foreach ( $pins_raw as $pin ) {
		if ( empty( $pin['id'] ) ) {
			continue;
		}
		$pin_id = sanitize_html_class( $pin['id'] );
		if ( '' === $pin_id ) {
			continue;
		}
		// x/y は画像に対する相対位置(%)。生の投稿データを直接編集された場合でも
		// 壊れないよう、PHP側でも独立してクランプする(editor.js/scene-model.jsと
		// 同じ0〜100の範囲)。
		$x = max( 0, min( 100, isset( $pin['x'] ) ? (float) $pin['x'] : 0 ) );
		$y = max( 0, min( 100, isset( $pin['y'] ) ? (float) $pin['y'] : 0 ) );

		$marker_url = ( isset( $pin['markerImageUrl'] ) && '' !== $pin['markerImageUrl'] ) ? esc_url_raw( $pin['markerImageUrl'] ) : '';

		$marker_scale = ( isset( $pin['markerScale'] ) && is_numeric( $pin['markerScale'] )
			&& (float) $pin['markerScale'] >= $marker_scale_min && (float) $pin['markerScale'] <= $marker_scale_max )
			? (float) $pin['markerScale']
			: $marker_scale_default;

		// Label位置(角丸矩形経路上の0以上1未満の連続値)。未設定/無効な値はnull
		// (scene-model.js/geometry.jsが同じfallback、丸マーカーは右・画像マーカーは下、に
		// 相当する位置を使う。resolveLabelPosition参照)。
		$label_position = null;
		if ( isset( $pin['labelPosition'] ) && is_numeric( $pin['labelPosition'] ) && is_finite( (float) $pin['labelPosition'] ) ) {
			$label_position_raw = fmod( (float) $pin['labelPosition'], 1 );
			if ( $label_position_raw < 0 ) {
				$label_position_raw += 1;
			}
			$label_position = round( $label_position_raw, 4 );
		}

		$pins[] = array(
			'id'             => $pin_id,
			'x'              => round( $x, 1 ),
			'y'              => round( $y, 1 ),
			'label'          => isset( $pin['label'] ) ? (string) $pin['label'] : '',
			'description'    => isset( $pin['description'] ) ? (string) $pin['description'] : '',
			'target'         => isset( $pin['target'] ) ? sanitize_html_class( $pin['target'] ) : '',
			'markerImageUrl' => $marker_url,
			'markerScale'    => $marker_scale,
			'showLabel'      => ( ! isset( $pin['showLabel'] ) || (bool) $pin['showLabel'] ),
			'labelPosition'  => $label_position,
		);
	}

	if ( empty( $pins ) ) {
		return '';
	}

	$payload = array(
		'imageUrl'                => $image_url,
		'imageWidth'              => $image_width,
		'imageHeight'             => $image_height,
		'pcBehavior'              => $pc_behavior,
		'mobileBehavior'          => $mobile_behavior,
		'pinSize'                 => $pin_size,
		'pinColor'                => $pin_color,
		'labelBackgroundColor'    => $label_bg_color,
		'labelTextColor'          => $label_text_color,
		'labelFontSize'           => $label_font_size,
		'labelBackgroundOpacity'  => $label_bg_opacity,
		'labelStrokeColor'        => $label_stroke_color,
		'labelStrokeWidth'        => $label_stroke_width,
		'labelSpeechBubble'       => $label_speech_bubble,
		'popoverFontSize'         => $popover_font_size,
		'popoverBackgroundColor'  => $popover_bg_color_raw,
		'popoverBackgroundOpacity' => $popover_bg_opacity,
		'popoverTextColor'        => $popover_text_color,
		'popoverStrokeColor'      => $popover_stroke_color,
		'popoverStrokeWidth'      => $popover_stroke_width,
		'popoverSpeechBubble'     => $popover_speech_bubble,
		'labelTailSize'           => $label_tail_size,
		'popoverTailSize'         => $popover_tail_size,
		'pins'                    => $pins,
	);

	$payload_json = wp_json_encode( $payload );
	if ( false === $payload_json ) {
		return '';
	}
	// </script> の混入によるタグの早期終了を防ぐ(安全なJSON埋め込みの定石)。
	$payload_json_safe = str_replace( '</', '<\\/', $payload_json );

	ob_start();
	?>
	<div class="image-pin-block">
		<script type="application/json" class="image-pin-block__payload"><?php echo $payload_json_safe; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></script>
		<div class="image-pin-block__scene-host"></div>
		<button type="button" class="image-pin-block__zoom-btn" aria-label="<?php echo esc_attr__( 'Zoom image', 'image-pin-block' ); ?>">
			<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
				<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" />
				<line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				<line x1="7" y1="4.5" x2="7" y2="9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
				<line x1="4.5" y1="7" x2="9.5" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
			</svg>
		</button>
		<div class="image-pin-block__mobile-panel" hidden>
			<div class="image-pin-block__mobile-panel-body"></div>
		</div>
		<noscript>
			<img src="<?php echo esc_url( $image_url ); ?>" alt="" />
		</noscript>
	</div>
	<?php
	return trim( (string) ob_get_clean() );
}
