<?php
/**
 * Plugin Name: Image Pin Block
 * Description: A block that places pins on an image to show descriptions and jump to other parts of the page.
 * Version: 0.1.0
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

	$pc_needs_link     = ( 'click-link' === $pc_behavior );
	$mobile_needs_link = ( 'tap-link' === $mobile_behavior );

	ob_start();
	?>
	<div class="image-pin-block" data-pc-behavior="<?php echo esc_attr( $pc_behavior ); ?>" data-mobile-behavior="<?php echo esc_attr( $mobile_behavior ); ?>">
		<div class="image-pin-block__wrapper">
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
				// aria-label は常に代替文字で補う(スクリーンリーダー等のため)。
				// 画面上の可視ラベルは $raw_label をそのまま使い、未入力なら表示しない。
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
							style="transform:scale(<?php echo esc_attr( $marker_factor ); ?>);"
							alt=""
						/>
						<?php if ( $show_marker_label ) : ?>
							<span class="image-pin-block__pin-label" style="background-color:<?php echo esc_attr( $label_bg_color ); ?>;color:<?php echo esc_attr( $label_text_color ); ?>;"><?php echo esc_html( $raw_label ); ?></span>
						<?php endif; ?>
					<?php else : ?>
						<span class="image-pin-block__pin-dot" style="width:<?php echo esc_attr( $pin_size ); ?>px;height:<?php echo esc_attr( $pin_size ); ?>px;background-color:<?php echo esc_attr( $pin_color ); ?>;" aria-hidden="true"></span>
						<span class="image-pin-block__pin-label" style="background-color:<?php echo esc_attr( $label_bg_color ); ?>;color:<?php echo esc_attr( $label_text_color ); ?>;"><?php echo esc_html( $label ); ?></span>
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
				$pin_id      = sanitize_html_class( $pin['id'] );
				$label       = isset( $pin['label'] ) && '' !== $pin['label'] ? (string) $pin['label'] : __( 'Pin', 'image-pin-block' );
				$description = isset( $pin['description'] ) ? (string) $pin['description'] : '';
				$target      = isset( $pin['target'] ) ? sanitize_html_class( $pin['target'] ) : '';
				?>
				<template class="image-pin-block__tpl-pc" data-pin-id="<?php echo esc_attr( $pin_id ); ?>">
					<div class="image-pin-block__desc-label"><?php echo esc_html( $label ); ?></div>
					<div class="image-pin-block__desc-body">
						<?php if ( $pc_needs_link && '' !== $target ) : ?>
							<a class="image-pin-block__desc-link" href="#<?php echo esc_attr( $target ); ?>"><?php echo esc_html( $description ); ?></a>
						<?php else : ?>
							<?php echo esc_html( $description ); ?>
						<?php endif; ?>
					</div>
				</template>
			<?php endforeach; ?>
		</div>

		<div class="image-pin-block__mobile-panel" hidden>
			<div class="image-pin-block__mobile-panel-body"></div>
		</div>

		<?php foreach ( $pins as $pin ) :
			if ( empty( $pin['id'] ) ) {
				continue;
			}
			$pin_id      = sanitize_html_class( $pin['id'] );
			$label       = isset( $pin['label'] ) && '' !== $pin['label'] ? (string) $pin['label'] : __( 'Pin', 'image-pin-block' );
			$description = isset( $pin['description'] ) ? (string) $pin['description'] : '';
			$target      = isset( $pin['target'] ) ? sanitize_html_class( $pin['target'] ) : '';
			?>
			<template class="image-pin-block__tpl-mobile" data-pin-id="<?php echo esc_attr( $pin_id ); ?>">
				<div class="image-pin-block__desc-label"><?php echo esc_html( $label ); ?></div>
				<div class="image-pin-block__desc-body">
					<?php if ( $mobile_needs_link && '' !== $target ) : ?>
						<a class="image-pin-block__desc-link" href="#<?php echo esc_attr( $target ); ?>"><?php echo esc_html( $description ); ?></a>
					<?php else : ?>
						<?php echo esc_html( $description ); ?>
					<?php endif; ?>
				</div>
			</template>
		<?php endforeach; ?>
	</div>
	<?php
	return trim( (string) ob_get_clean() );
}
