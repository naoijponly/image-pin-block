<?php
/**
 * Plugin Name: Image Pin Block
 * Description: A block that places pins on an image to show descriptions and jump to other parts of the page.
 * Version: 0.1.4
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
 * ブロック登録処理と同じ関数にまとめず専用の関数に分離し、'init' の中でも
 * できるだけ早い優先度(1)で呼ぶことで、以降のブロック登録処理(優先度10)より
 * 先に確実に翻訳が読み込まれた状態にする。
 */
function image_pin_block_load_textdomain() {
	load_plugin_textdomain( 'image-pin-block', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
}
add_action( 'init', 'image_pin_block_load_textdomain', 1 );

function image_pin_block_register_block() {
	$dir = __DIR__;

	// スクリプト・スタイルは全て手動登録し、register_block_type() の引数
	// (editor_script 等)で明示的に紐付ける。block.json 側には editorScript 等を
	// 書かない(あえて省いている)。理由は2つ:
	// 1. ビルドなし構成のため .asset.php が無く、block.json 経由の自動登録は
	//    依存配列が空になり wp-blocks 等が読み込まれない。
	// 2. block.json に editorScript 等を書くと、register_block_type() の引数で
	//    別ハンドル名を指定していても、WordPress core が block.json の値から
	//    別ハンドル名を生成してスクリプトを"二重登録"してしまう。
	//    wp_set_script_translations() をこちらの手動ハンドルに対して呼んでも、
	//    実際にエンキューされるのが core 側の自動生成ハンドルだった場合、
	//    翻訳ファイルが一切リクエストされない(handleの不一致で false を返し
	//    黙って何もしない)という不具合が起きるため。
	wp_register_script(
		'image-pin-block-editor',
		plugins_url( 'editor.js', __FILE__ ),
		array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-data', 'wp-i18n' ),
		filemtime( $dir . '/editor.js' ),
		true
	);

	// editor.js 側の wp.i18n.__() が languages/ 内のJS用翻訳(JSON)を読み込めるようにする。
	wp_set_script_translations( 'image-pin-block-editor', 'image-pin-block', $dir . '/languages' );

	wp_register_style(
		'image-pin-block-editor-style',
		plugins_url( 'editor.css', __FILE__ ),
		array(),
		filemtime( $dir . '/editor.css' )
	);

	wp_register_style(
		'image-pin-block-style',
		plugins_url( 'style.css', __FILE__ ),
		array(),
		filemtime( $dir . '/style.css' )
	);

	wp_register_script(
		'image-pin-block-view',
		plugins_url( 'view.js', __FILE__ ),
		array( 'wp-i18n' ),
		filemtime( $dir . '/view.js' ),
		true
	);

	// view.js 側(拡大表示の閉じる/拡大/縮小ボタン)の wp.i18n.__() が
	// languages/ 内のJS用翻訳(JSON)を読み込めるようにする。
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
 * 通すため、値が「色」であることまでは保証しない。そのままstyle属性に
 * 出力すると、例えば "red; background-image:url(https://example.com/x.gif)"
 * のような値で同一属性内に任意のCSS宣言(外部URLへのリクエストを含む)を
 * 注入できてしまう。ここで形式を絞り込み、一致しなければ $default を返す。
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
 * 色($color。あらかじめ image_pin_block_sanitize_color() で検証済みの値を渡すこと)に
 * 不透明度(0〜100)を掛け合わせた最終的な色を返す。
 *
 * $color は hex(3/4/6/8桁)・rgb()/rgba()/hsl()/hsla()・CSS標準色名(currentColor含む)の
 * いずれかであり得るため、PHP側で個別に数値を解析して再構築するのではなく、CSS の
 * `color-mix(in srgb, <color> <pct>%, transparent)` を使う。$color を $opacity_pct% だけ
 * transparent と混ぜることになるため、named color / transparent / 既存の rgba() の
 * いずれでも一律に「既存のアルファ × 不透明度」相当の結果になる。
 *
 * 当初は CSS Color 5 の相対カラー構文(`rgb(from <color> r g b / calc(alpha * n))`)を
 * 使っていたが、Firefox 128+ が必要で対応範囲が狭く、未対応ブラウザでは宣言ごと無効になり
 * 背景色が消えてしまう(縮退ではなく機能喪失になる)ため、より対応の広い color-mix
 * (Chrome 111+ / Safari 16.2+ / Firefox 113+)に置き換えた。
 *
 * $opacity_pct が 100(=変更なし)のときは、後方互換のため $color をバイト単位で
 * そのまま返す(color-mix で包まない)。
 */
function image_pin_block_apply_opacity( $color, $opacity_pct ) {
	$opacity_pct = max( 0, min( 100, (float) $opacity_pct ) );
	if ( 100.0 === $opacity_pct ) {
		return $color;
	}
	$pct = number_format( $opacity_pct, 3, '.', '' );
	return 'color-mix(in srgb, ' . $color . ' ' . $pct . '%, transparent)';
}

/**
 * フロント側の HTML を組み立てる。
 *
 * PC 用ポップオーバーとスマホ用説明エリアそれぞれに <template> で
 * エスケープ済みの内容を用意しておき、view.js は文字列からの HTML 組み立てを
 * 行わずノードの複製のみで表示を切り替える(XSS対策)。
 */
function image_pin_block_render_callback( $attributes, $content ) {
	$image_url = isset( $attributes['imageUrl'] ) ? esc_url_raw( $attributes['imageUrl'] ) : '';
	$image_width  = isset( $attributes['imageWidth'] ) ? absint( $attributes['imageWidth'] ) : 0;
	$image_height = isset( $attributes['imageHeight'] ) ? absint( $attributes['imageHeight'] ) : 0;

	$allowed_pc_behaviors     = array( 'hover-click', 'click-link' );
	$allowed_mobile_behaviors = array( 'tap-jump', 'tap-tap', 'tap-link' );

	$pc_behavior = isset( $attributes['pcBehavior'] ) && in_array( $attributes['pcBehavior'], $allowed_pc_behaviors, true )
		? $attributes['pcBehavior']
		: 'hover-click';

	$mobile_behavior = isset( $attributes['mobileBehavior'] ) && in_array( $attributes['mobileBehavior'], $allowed_mobile_behaviors, true )
		? $attributes['mobileBehavior']
		: 'tap-tap';

	$pins = ( isset( $attributes['pins'] ) && is_array( $attributes['pins'] ) ) ? $attributes['pins'] : array();

	if ( '' === $image_url || empty( $pins ) ) {
		return '';
	}

	// ピンの見た目(ブロック単位)。丸マーカーのサイズ・色、ラベルの背景色・文字色。
	// 既存ブロック(属性を持たないもの)でも現在の見た目のままになるようデフォルト値を揃える。
	// サイズ系は範囲外(下限・上限とも)ならデフォルト値にフォールバックする
	// (クランプではない。中途半端な値に丸めるより、意図しない極端な値は
	// はっきり既定の見た目に戻したほうが分かりやすいため)。
	$pin_size_min     = 4;
	$pin_size_max     = 300;
	$pin_size_default = 24;
	$pin_size = ( isset( $attributes['pinSize'] ) && is_numeric( $attributes['pinSize'] )
		&& (float) $attributes['pinSize'] >= $pin_size_min && (float) $attributes['pinSize'] <= $pin_size_max )
		? (float) $attributes['pinSize']
		: $pin_size_default;

	$pin_color        = image_pin_block_sanitize_color( isset( $attributes['pinColor'] ) ? $attributes['pinColor'] : '', '#e63946' );
	$label_bg_color   = image_pin_block_sanitize_color( isset( $attributes['labelBackgroundColor'] ) ? $attributes['labelBackgroundColor'] : '', 'rgba(255,255,255,0.9)' );
	$label_text_color = image_pin_block_sanitize_color( isset( $attributes['labelTextColor'] ) ? $attributes['labelTextColor'] : '', '#1e1e1e' );

	// ラベルの文字サイズ(px、画像の元解像度を基準とした値)。上限・下限は editor.js の
	// LABEL_FONT_SIZE_MIN/MAX と必ず一致させること。$pin_size と同様、範囲外はデフォルトにフォールバックする。
	$label_font_size_min     = 6;
	$label_font_size_max     = 200;
	$label_font_size_default = 12;
	$label_font_size = ( isset( $attributes['labelFontSize'] ) && is_numeric( $attributes['labelFontSize'] )
		&& (float) $attributes['labelFontSize'] >= $label_font_size_min && (float) $attributes['labelFontSize'] <= $label_font_size_max )
		? (float) $attributes['labelFontSize']
		: $label_font_size_default;

	// ラベル背景の不透明度(0〜100)。$label_bg_color に直接反映し、新しいCSSカスタム
	// プロパティは増やさない(既存のインライン background-color の値を差し替えるだけにする)。
	// labelBackgroundOpacity が既定値(100)のときは image_pin_block_apply_opacity() が
	// 元の文字列をそのまま返すため、出力は一切変わらない(後方互換)。
	$label_bg_opacity = ( isset( $attributes['labelBackgroundOpacity'] ) && is_numeric( $attributes['labelBackgroundOpacity'] )
		&& (float) $attributes['labelBackgroundOpacity'] >= 0 && (float) $attributes['labelBackgroundOpacity'] <= 100 )
		? (float) $attributes['labelBackgroundOpacity']
		: 100;
	$label_bg_color = image_pin_block_apply_opacity( $label_bg_color, $label_bg_opacity );

	// ラベル文字の縁取り。太さが 'none'(既定)のときは、色の値に関わらず
	// 縁取り関連のCSSカスタムプロパティ・data属性を一切出力しない(ゲートは太さ側)。
	$stroke_widths = array( 'none', 'thin', 'normal', 'thick' );
	$label_stroke_width = isset( $attributes['labelStrokeWidth'] ) && in_array( $attributes['labelStrokeWidth'], $stroke_widths, true )
		? $attributes['labelStrokeWidth']
		: 'none';
	$label_stroke_color = image_pin_block_sanitize_color( isset( $attributes['labelStrokeColor'] ) ? $attributes['labelStrokeColor'] : '', '#ffffff' );

	// ポップオーバーの文字サイズ(px、画像の元解像度を基準とした値)。$label_font_size と
	// 同じ考え方だが、将来ラベルとは独立して調整できるよう変数・上限下限は分けている。
	// 上限・下限は editor.js の POPOVER_FONT_SIZE_MIN/MAX と必ず一致させること。
	$popover_font_size_min     = 6;
	$popover_font_size_max     = 200;
	$popover_font_size_default = 12;
	$popover_font_size = ( isset( $attributes['popoverFontSize'] ) && is_numeric( $attributes['popoverFontSize'] )
		&& (float) $attributes['popoverFontSize'] >= $popover_font_size_min && (float) $attributes['popoverFontSize'] <= $popover_font_size_max )
		? (float) $attributes['popoverFontSize']
		: $popover_font_size_default;

	// ポップオーバー(PC用吹き出し)・スマホの説明エリア共通の背景色・文字色・縁取り。
	// 背景色/文字色は新規属性のため、未設定(空文字)を「現行の見た目(白背景・テーマの
	// 文字色を継承)を維持する」ためのセンチネル値として扱う(空なら何も出力しない)。
	$popover_bg_color_raw = image_pin_block_sanitize_color( isset( $attributes['popoverBackgroundColor'] ) ? $attributes['popoverBackgroundColor'] : '', '' );
	$popover_text_color   = image_pin_block_sanitize_color( isset( $attributes['popoverTextColor'] ) ? $attributes['popoverTextColor'] : '', '' );

	$popover_bg_opacity = ( isset( $attributes['popoverBackgroundOpacity'] ) && is_numeric( $attributes['popoverBackgroundOpacity'] )
		&& (float) $attributes['popoverBackgroundOpacity'] >= 0 && (float) $attributes['popoverBackgroundOpacity'] <= 100 )
		? (float) $attributes['popoverBackgroundOpacity']
		: 100;

	// 背景色・不透明度のどちらかが既定値と異なる場合のみ、実効色を計算する。
	// 背景色が未設定なら、style.css側の現行ハードコード値(#ffffff)を基準に不透明度を適用する。
	$popover_bg_color_final = '';
	if ( '' !== $popover_bg_color_raw || 100.0 !== $popover_bg_opacity ) {
		$popover_bg_base        = ( '' !== $popover_bg_color_raw ) ? $popover_bg_color_raw : '#ffffff';
		$popover_bg_color_final = image_pin_block_apply_opacity( $popover_bg_base, $popover_bg_opacity );
	}

	$popover_stroke_width = isset( $attributes['popoverStrokeWidth'] ) && in_array( $attributes['popoverStrokeWidth'], $stroke_widths, true )
		? $attributes['popoverStrokeWidth']
		: 'none';
	$popover_stroke_color = image_pin_block_sanitize_color( isset( $attributes['popoverStrokeColor'] ) ? $attributes['popoverStrokeColor'] : '', '#ffffff' );

	// ブロックルートに出力するCSSカスタムプロパティ。非デフォルト時のみ追加する
	// (これにより、全属性が既定値のときは style="" 自体が出力されず、v0.1.2 と
	// 出力バイトが完全に一致する)。カスタムプロパティは継承されるため、ラベル/
	// ポップオーバー/説明エリア側の style.css では var(--ipb-xxx, 初期値) として参照する。
	$root_custom_props = array();
	if ( 'none' !== $label_stroke_width ) {
		$root_custom_props['--ipb-label-stroke-color'] = $label_stroke_color;
	}
	if ( '' !== $popover_bg_color_final ) {
		$root_custom_props['--ipb-popover-bg-color'] = $popover_bg_color_final;
	}
	if ( '' !== $popover_text_color ) {
		$root_custom_props['--ipb-popover-text-color'] = $popover_text_color;
	}
	if ( 'none' !== $popover_stroke_width ) {
		$root_custom_props['--ipb-popover-stroke-color'] = $popover_stroke_color;
	}

	// マーカー画像の表示幅は、本体画像に対してこの割合を上限とする(editor.js / view.js の
	// MARKER_MAX_WIDTH_RATIO と必ず一致させること)。マーカー画像が本体画像と同等以上の
	// 解像度の場合、transform:scale() だけではレイアウト上のサイズ(当たり判定)が縮小前の
	// 原寸のまま残ってしまい、ドラッグ操作等でポインタイベントを奪ってしまうための対策。
	// ここではJS未実行時の暫定表示(no-JSフォールバック)として max-width で上限を掛けている。
	// 実際の表示幅は、マーカー画像自体の実寸を読み取れる view.js が読み込み後に確定する。
	$marker_max_width_ratio = 0.5;
	$marker_max_width_px    = ( $image_width > 0 ) ? (int) round( $image_width * $marker_max_width_ratio ) : 0;

	$pc_needs_link     = ( 'click-link' === $pc_behavior );
	$mobile_needs_link = ( 'tap-link' === $mobile_behavior );

	ob_start();
	?>
	<div class="image-pin-block" data-pc-behavior="<?php echo esc_attr( $pc_behavior ); ?>" data-mobile-behavior="<?php echo esc_attr( $mobile_behavior ); ?>"<?php if ( 'none' !== $label_stroke_width ) : ?> data-label-stroke-width="<?php echo esc_attr( $label_stroke_width ); ?>"<?php endif; ?><?php if ( 'none' !== $popover_stroke_width ) : ?> data-popover-stroke-width="<?php echo esc_attr( $popover_stroke_width ); ?>"<?php endif; ?><?php if ( ! empty( $root_custom_props ) ) : ?> style="<?php foreach ( $root_custom_props as $prop_name => $prop_value ) { echo esc_attr( $prop_name ) . ':' . esc_attr( $prop_value ) . ';'; } ?>"<?php endif; ?>>
		<div class="image-pin-block__wrapper" data-natural-width="<?php echo esc_attr( $image_width ); ?>" data-label-font-size="<?php echo esc_attr( $label_font_size ); ?>" data-popover-font-size="<?php echo esc_attr( $popover_font_size ); ?>">
			<img
				class="image-pin-block__image"
				src="<?php echo esc_url( $image_url ); ?>"
				<?php if ( $image_width > 0 ) : ?>width="<?php echo esc_attr( $image_width ); ?>"<?php endif; ?>
				<?php if ( $image_height > 0 ) : ?>height="<?php echo esc_attr( $image_height ); ?>"<?php endif; ?>
				alt=""
			/>
			<button type="button" class="image-pin-block__zoom-btn" aria-label="<?php echo esc_attr__( 'Zoom image', 'image-pin-block' ); ?>">
				<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
					<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" />
					<line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
					<line x1="7" y1="4.5" x2="7" y2="9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
					<line x1="4.5" y1="7" x2="9.5" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
				</svg>
			</button>
			<?php foreach ( $pins as $pin ) :
				if ( empty( $pin['id'] ) ) {
					continue;
				}
				$pin_id      = sanitize_html_class( $pin['id'] );
				// x/y は画像に対する相対位置(%)。editor.js 側でも0〜100にクランプしているが、
				// 生の投稿データを直接編集された場合でも壊れないよう、PHP側でも独立してクランプする。
				$x_val       = isset( $pin['x'] ) ? (float) $pin['x'] : 0;
				$x_val       = max( 0, min( 100, $x_val ) );
				$x           = number_format( $x_val, 1, '.', '' );
				$y_val       = isset( $pin['y'] ) ? (float) $pin['y'] : 0;
				$y_val       = max( 0, min( 100, $y_val ) );
				$y           = number_format( $y_val, 1, '.', '' );
				$raw_label   = isset( $pin['label'] ) ? (string) $pin['label'] : '';
				// aria-label は常に代替文字で補う(スクリーンリーダー等のため)。画面上の可視ラベルは
				// $raw_label をそのまま使い、未入力なら表示しない(丸マーカーも画像マーカーと
				// 同じ扱いに揃えている。以前は丸マーカーのみ未入力時に代替文字を表示していた)。
				$label       = '' !== $raw_label ? $raw_label : __( 'Pin', 'image-pin-block' );
				$target      = isset( $pin['target'] ) ? sanitize_html_class( $pin['target'] ) : '';
				$marker_url  = isset( $pin['markerImageUrl'] ) && '' !== $pin['markerImageUrl'] ? esc_url_raw( $pin['markerImageUrl'] ) : '';
				$has_marker  = ( '' !== $marker_url );
				// markerScale も pinSize と同様、範囲外は極端なレイアウト崩れにつながるため
				// クランプではなくデフォルト値(100%)にフォールバックする。
				$marker_scale_min     = 1;
				$marker_scale_max     = 500;
				$marker_scale_default = 100;
				$marker_pct  = ( isset( $pin['markerScale'] ) && is_numeric( $pin['markerScale'] )
					&& (float) $pin['markerScale'] >= $marker_scale_min && (float) $pin['markerScale'] <= $marker_scale_max )
					? (float) $pin['markerScale']
					: $marker_scale_default;
				$marker_factor = number_format( $marker_pct / 100, 3, '.', '' );
				$show_marker_label = ( ! isset( $pin['showLabel'] ) || (bool) $pin['showLabel'] ) && '' !== $raw_label;
				// Label位置(角丸矩形経路上の0以上1未満の連続値)。未設定/無効な値のときは
				// 属性自体を出力しない(view.js側がeditor.jsと同じfallback、丸マーカーは
				// 右・画像マーカーは下、に相当する位置を使う。resolveLabelPosition参照)。
				// PHPは実際のLabelの表示サイズ(文字列・フォント)を測れないため、最終的な
				// 位置計算は常にJS側(view.js)が実際の描画結果を実測して行う。
				$label_position = '';
				if ( isset( $pin['labelPosition'] ) && is_numeric( $pin['labelPosition'] ) && is_finite( (float) $pin['labelPosition'] ) ) {
					$label_position_raw = fmod( (float) $pin['labelPosition'], 1 );
					if ( $label_position_raw < 0 ) {
						$label_position_raw += 1;
					}
					$label_position = number_format( $label_position_raw, 4, '.', '' );
				}
				?>
				<button
					type="button"
					class="image-pin-block__pin<?php echo $has_marker ? ' has-marker-image' : ''; ?>"
					style="left:<?php echo esc_attr( $x ); ?>%;top:<?php echo esc_attr( $y ); ?>%;"
					data-pin-id="<?php echo esc_attr( $pin_id ); ?>"
					data-target="<?php echo esc_attr( $target ); ?>"
					aria-label="<?php echo esc_attr( $label ); ?>"
				>
					<?php if ( $has_marker ) : ?>
						<img
							class="image-pin-block__pin-marker-image"
							src="<?php echo esc_url( $marker_url ); ?>"
							style="transform:scale(<?php echo esc_attr( $marker_factor ); ?>);<?php if ( $marker_max_width_px > 0 ) : ?>max-width:<?php echo esc_attr( $marker_max_width_px ); ?>px;<?php endif; ?>"
							data-marker-scale="<?php echo esc_attr( $marker_pct ); ?>"
							alt=""
						/>
						<?php if ( $show_marker_label ) : ?>
							<span class="image-pin-block__pin-label" data-pin-id="<?php echo esc_attr( $pin_id ); ?>"<?php if ( '' !== $label_position ) : ?> data-label-position="<?php echo esc_attr( $label_position ); ?>"<?php endif; ?> style="background-color:<?php echo esc_attr( $label_bg_color ); ?>;color:<?php echo esc_attr( $label_text_color ); ?>;font-size:<?php echo esc_attr( $label_font_size ); ?>px;"><?php echo esc_html( $raw_label ); ?></span>
						<?php endif; ?>
					<?php else : ?>
						<span class="image-pin-block__pin-dot" style="width:<?php echo esc_attr( $pin_size ); ?>px;height:<?php echo esc_attr( $pin_size ); ?>px;background-color:<?php echo esc_attr( $pin_color ); ?>;" data-pin-size="<?php echo esc_attr( $pin_size ); ?>" aria-hidden="true"></span>
						<?php if ( '' !== $raw_label ) : ?>
							<span class="image-pin-block__pin-label" data-pin-id="<?php echo esc_attr( $pin_id ); ?>"<?php if ( '' !== $label_position ) : ?> data-label-position="<?php echo esc_attr( $label_position ); ?>"<?php endif; ?> style="background-color:<?php echo esc_attr( $label_bg_color ); ?>;color:<?php echo esc_attr( $label_text_color ); ?>;font-size:<?php echo esc_attr( $label_font_size ); ?>px;"><?php echo esc_html( $raw_label ); ?></span>
						<?php endif; ?>
					<?php endif; ?>
				</button>
			<?php endforeach; ?>

			<div class="image-pin-block__popover" hidden>
				<div class="image-pin-block__popover-body"></div>
			</div>

			<?php foreach ( $pins as $pin ) :
				if ( empty( $pin['id'] ) ) {
					continue;
				}
				$description = isset( $pin['description'] ) ? (string) $pin['description'] : '';
				// PopoverはDescriptionのみを表示する(画像上のLabelと重複させないため)。
				// Descriptionが空のピンは、Popoverに表示するものが無いため <template>
				// 自体を出力しない。view.js の cloneTemplateContent() は該当する
				// <template> が無ければ null を返し、呼び出し側(openPopoverForPin 等)は
				// 何もしないガードを既に持っているため、JS側の変更は不要。
				if ( '' === $description ) {
					continue;
				}
				$pin_id      = sanitize_html_class( $pin['id'] );
				$target      = isset( $pin['target'] ) ? sanitize_html_class( $pin['target'] ) : '';
				// desc-body直下にPHPタグ・改行由来の余計なwhitespace text nodeを作らないよう、
				// 表示内容を先に1つの文字列として組み立ててから、タグの直後へ隙間なく出力する
				// (white-space: pre-wrapがこの余計な改行まで画面上の空行として表示してしまうため)。
				$desc_html = ( $pc_needs_link && '' !== $target )
					? '<a class="image-pin-block__desc-link" href="#' . esc_attr( $target ) . '">' . esc_html( $description ) . '</a>'
					: esc_html( $description );
				?>
				<template class="image-pin-block__tpl-pc" data-pin-id="<?php echo esc_attr( $pin_id ); ?>"><div class="image-pin-block__desc-body"><?php echo $desc_html; ?></div></template>
			<?php endforeach; ?>
		</div>

		<div class="image-pin-block__mobile-panel" hidden>
			<div class="image-pin-block__mobile-panel-body"></div>
		</div>

		<?php foreach ( $pins as $pin ) :
			if ( empty( $pin['id'] ) ) {
				continue;
			}
			$description = isset( $pin['description'] ) ? (string) $pin['description'] : '';
			// Mobile説明パネルもDescriptionのみを表示する(画像上のLabelと重複させないため。
			// PC用テンプレートと同じ理由)。
			if ( '' === $description ) {
				continue;
			}
			$pin_id      = sanitize_html_class( $pin['id'] );
			$target      = isset( $pin['target'] ) ? sanitize_html_class( $pin['target'] ) : '';
			$desc_html = ( $mobile_needs_link && '' !== $target )
				? '<a class="image-pin-block__desc-link" href="#' . esc_attr( $target ) . '">' . esc_html( $description ) . '</a>'
				: esc_html( $description );
			?>
			<template class="image-pin-block__tpl-mobile" data-pin-id="<?php echo esc_attr( $pin_id ); ?>"><div class="image-pin-block__desc-body"><?php echo $desc_html; ?></div></template>
		<?php endforeach; ?>
	</div>
	<?php
	return trim( (string) ob_get_clean() );
}
