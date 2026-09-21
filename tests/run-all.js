/**
 * Image Pin Block — 全テストの実行エントリポイント。
 * Node上で動く純粋関数、最小fake DOMを使うsvg-renderer.jsの出力契約、
 * Editor/Frontend/Lightbox/PNG Exportが単一Rendererを共有する構造guardを対象にする。
 * scene-assets.jsの画像load/fetch、PNGの実際のSVG decode/Canvas rasterize、
 * editor.js/view.jsの実ブラウザ操作は実DOM・実SVG・実wp.*を要するため対象外。
 *
 * 使い方: node tests/run-all.js
 */
'use strict';

var files = [
	'./geometry.test.js',
	'./scene-camera.test.js',
	'./scene-text.test.js',
	'./scene-model.test.js',
	'./scene-runtime.test.js',
	'./scene-assets.test.js',
	'./svg-renderer.test.js',
	'./renderer-architecture.test.js'
];

var totalPass = 0;
var totalFail = 0;

files.forEach( function( file ) {
	console.log( '\n=== ' + file + ' ===' );
	// 各テストファイルはrequire時に自身のスイートを即実行し、summary()の結果を
	// module.exportsとして返す(test-helper.js参照。createRunner()で毎回独立した
	// カウンタを持つため、複数ファイルをまとめて実行しても集計が混ざらない)。
	var result = require( file );
	totalPass += result.pass;
	totalFail += result.fail;
} );

console.log( '\n=== TOTAL ===' );
console.log( totalPass + ' passed, ' + totalFail + ' failed (across ' + files.length + ' suites)' );
process.exitCode = ( totalFail > 0 ) ? 1 : 0;
