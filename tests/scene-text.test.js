'use strict';

var helper = require( './test-helper.js' ).createRunner();
var describe = helper.describe;
var it = helper.it;
var assert = helper.assert;

var SceneText = require( '../scene-text.js' );

describe( 'scene-text.js: normalizeNewlines', function() {
	it( 'CRLFをLFへ正規化する', function() {
		assert.strictEqual( SceneText.normalizeNewlines( 'a\r\nb' ), 'a\nb' );
	} );
	it( '単独のCRもLFへ正規化する', function() {
		assert.strictEqual( SceneText.normalizeNewlines( 'a\rb' ), 'a\nb' );
	} );
	it( '既にLFのみの文字列は変化しない', function() {
		assert.strictEqual( SceneText.normalizeNewlines( 'a\nb\nc' ), 'a\nb\nc' );
	} );
	it( '空行・連続する改行を保持する', function() {
		assert.strictEqual( SceneText.normalizeNewlines( 'a\n\n\nb' ), 'a\n\n\nb' );
	} );
	it( 'null/undefinedは空文字として扱う', function() {
		assert.strictEqual( SceneText.normalizeNewlines( null ), '' );
		assert.strictEqual( SceneText.normalizeNewlines( undefined ), '' );
	} );
} );

describe( 'scene-text.js: segmentGraphemes', function() {
	it( '空文字は空配列', function() {
		assert.deepStrictEqual( SceneText.segmentGraphemes( '' ), [] );
	} );
	it( '通常のASCII文字列は1文字ずつ分割される', function() {
		assert.deepStrictEqual( SceneText.segmentGraphemes( 'abc' ), [ 'a', 'b', 'c' ] );
	} );
	it( '日本語文字列は1文字(1コードポイント)ずつ分割される', function() {
		assert.deepStrictEqual( SceneText.segmentGraphemes( 'あいう' ), [ 'あ', 'い', 'う' ] );
	} );
	it( 'サロゲートペア(絵文字等)を1つのclusterとして扱う', function() {
		var clusters = SceneText.segmentGraphemes( '😀' ); // 😀 U+1F600
		assert.strictEqual( clusters.length, 1 );
	} );
	it( '結合文字(combining mark)を基底文字と1つのclusterにまとめる(Intl.Segmenter利用可能な場合)', function() {
		// "e" + COMBINING ACUTE ACCENT (U+0301) は "é" の合成表現。
		var input = 'é';
		var clusters = SceneText.segmentGraphemes( input );
		var hasSegmenter = ( 'undefined' !== typeof Intl ) && !! Intl.Segmenter;
		if ( hasSegmenter ) {
			assert.strictEqual( clusters.length, 1, 'Intl.Segmenter利用可能な環境では1clusterにまとめる' );
		} else {
			assert.ok( clusters.length >= 1 );
		}
	} );
	it( '異体字セレクタ(variation selector)付き文字を扱える(例外を投げない)', function() {
		// U+FE0F (VARIATION SELECTOR-16)
		assert.doesNotThrow( function() {
			SceneText.segmentGraphemes( '❤️' ); // ❤️
		} );
	} );
	it( 'emoji ZWJ sequence(複数コードポイントの結合emoji)を扱える(例外を投げない)', function() {
		// 👨‍👩‍👧 (family emoji, ZWJ結合)
		var input = '👨‍👩‍👧';
		assert.doesNotThrow( function() {
			SceneText.segmentGraphemes( input );
		} );
	} );
} );

describe( 'scene-text.js: BASELINE_RATIO', function() {
	it( '0〜1の範囲の固定値である(内容依存で変化しない定数)', function() {
		assert.ok( 'number' === typeof SceneText.BASELINE_RATIO );
		assert.ok( SceneText.BASELINE_RATIO > 0 && SceneText.BASELINE_RATIO < 1 );
	} );
} );

describe( 'scene-text.js: waitForFonts', function() {
	it( 'ownerDocumentが無い環境でもPromiseを返す(例外を投げない)', function() {
		var result = SceneText.waitForFonts( null );
		assert.ok( result && 'function' === typeof result.then );
	} );
} );

module.exports = helper.summary( 'scene-text.test.js' );
