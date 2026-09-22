=== Image Pin Block ===
Contributors: naoijponly
Tags: gutenberg, block, image, pin, hotspot
Requires at least: TODO(要確認: 実テストしたWordPressの最小バージョンを確認してから設定してください)
Tested up to: TODO(要確認: 実テストしたWordPressの最大バージョンを確認してから設定してください)
Requires PHP: TODO(要確認: 実テストしたPHPの最小バージョンを確認してから設定してください)
Stable tag: 0.3.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A block that places pins on an image to show descriptions and jump to other parts of the page.

== Description ==

Image Pin Block is a Gutenberg block that lets you place pins on top of an image. Each pin can show a short label directly on the image, and a description that appears in a popover (on desktop) or a panel below the image (on mobile) when the pin is clicked or tapped. Pins can also jump to another part of the same page, such as a heading further down the post.

= 主な機能 (Key features) =

* Fullscreen Editor(専用のフルスクリーン編集画面)でピンの追加・移動・編集をまとめて行えます
* 画像の空いている部分をダブルクリックして、確認のうえピンを追加します(誤操作防止)
* ピンごとにラベル(画像上に常時表示)・説明文(クリック/タップで表示)・遷移先を設定できます
* ラベルはドラッグでピンの周囲の好きな位置へ配置できます
* 丸いピンの代わりに任意の画像をマーカーとして使えます(拡大率・ラベル表示の有無を個別設定)
* PC / スマホでそれぞれ独立した表示動作(ホバー・クリック・タップの組み合わせ)を選べます
* 現在のピン配置を元画像の解像度でPNG画像として書き出せます
* ビルドツール不要のプレーンな JavaScript / PHP / CSS で実装されています

= Key features =

* A dedicated fullscreen editor for adding, moving, and editing all pins in one place
* Double-click an empty area of the image, then confirm, to add a new pin (prevents accidental additions)
* Each pin can have a label (always visible on the image), a description (shown on click/tap), and a jump target
* Labels can be dragged freely around the pin/marker
* Any image can be used as a marker instead of the default round pin, with an independent scale and label visibility per pin
* Independent display behavior for desktop and mobile (hover, click, and tap combinations)
* Export the current pin layout as a PNG image at the original image resolution
* No build tools required — plain JavaScript / PHP / CSS

== Installation ==

1. プラグイン一覧の「新規追加」からZIPファイルをアップロードするか、`wp-content/plugins/image-pin-block` として配置してください
2. プラグイン一覧から「Image Pin Block」を有効化してください
3. 投稿・固定ページの編集画面で、ブロック挿入メニューから「Image Pin Block」を追加してください

詳しい使い方は、配布ファイルに含まれる `USER_GUIDE.md` を参照してください。

== Frequently Asked Questions ==

= 「編集を反映して終了」を押したのに投稿に反映されません =

このボタンはブロックの属性(データ)へ反映するだけで、投稿自体の保存はしていません。Fullscreen Editorを閉じたあと、投稿編集画面の「更新」または「公開」ボタンを押してください。

= 対応している画像形式は何ですか =

PNG / JPEG に対応しています。SVGは対応していません。

== Screenshots ==

準備中です(スクリーンショット画像は今後追加予定)。候補: 1. ブロック全体の表示 2. Fullscreen Editor 3. ラベル/説明文の編集 4. マーカー画像 5. フロント表示(PC) 6. フロント表示(スマホ) 7. PNG保存

== Changelog ==

詳細は同梱の `CHANGELOG.md` を参照してください。

= 0.3.1 =
* 新規ブロックに画像を初めて選択したとき、通常表示が空白のままになる問題を修正(今回の主な修正)
* ブロック名が日本語環境で「画像ピンブロック」と表示されていたのを「Image Pin Block」表記に修正
* メディアライブラリでの画像選択が不安定になる場合がある問題、更新後にファイルが古いまま混在した場合の検知を追加

= 0.3.0 =
* 通常Preview・Fullscreen Editor・Frontend・Lightbox・PNG保存の描画を、共通のSVG Scene Rendererへ統一
* 保存済みのピンデータ形式を変えず、Popoverの表示・操作・文字折り返しに関する回帰を修正
* 画像高を超える長文Popoverを、画像内でホイールスクロールできるよう修正
* 同一サイトのhttp画像URLがHTTPSページ上でPNG保存に失敗する場合がある問題を修正
* 吹き出しの先端のサイズを、LabelとPopoverそれぞれ大・中・小から選べるように追加(既定は中で従来と同じ)
* 画像マーカーのリサイズハンドルを右下隅の青い丸に修正

= 0.2.0 =
* ピンの編集操作を専用のフルスクリーン編集画面(Fullscreen Editor)に集約
* ラベルのドラッグ配置、PNG画像としての書き出しに対応
* Fullscreen Editorのマウスホイールによるズームに対応
* ポップオーバー/スマホの説明エリアの表示内容・開閉仕様を整理
* Descriptionが空で遷移先が設定されているピンが遷移できなかった不具合を修正

= 0.1.4 =
* 詳細は `CHANGELOG.md` を参照してください

== Upgrade Notice ==

= 0.3.0 =
描画処理を共通のSVG Scene Rendererへ統一しました。保存済みのピンデータ形式は変更していません。

= 0.2.0 =
ピン編集の操作方法がフルスクリーン編集画面に変わりました。保存済みのピンのデータ形式は変更していません。
